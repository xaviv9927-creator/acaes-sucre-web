const express = require('express');
const axios = require('axios');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const db = require('./database');
const fs = require('fs');

const app = express();

app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: 'acaes_sucre_secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Carpeta de uploads
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });
app.use('/api/', limiter);

// UN SOLO BOT - CORE
const BOT_TOKEN = '8669080229:AAEKBAK0w-bxVGJ_FFwKfcJpbayej3tIoqY';

// ========== WEBHOOK PARA TELGRAM (suscribir usuarios) ==========
app.post(`/webhook/${BOT_TOKEN}`, async (req, res) => {
  const update = req.body;
  if (update.message && update.message.text === '/start') {
    const chat_id = update.message.chat.id;
    const username = update.message.chat.username || '';
    const nombre = update.message.chat.first_name || '';
    
    db.run(`INSERT OR IGNORE INTO suscriptores_telegram (chat_id, username, nombre) VALUES (?, ?, ?)`,
      [chat_id, username, nombre], (err) => {
        if (err) console.error(err);
        axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chat_id,
          text: '✅ ¡Bienvenido a ACAES! Recibirás todas las novedades astronómicas del Estado Sucre.'
        });
      });
  }
  res.sendStatus(200);
});

// ========== FUNCIÓN PARA ENVIAR A TODOS LOS SUSCRIPTORES ==========
async function broadcastTelegram(mensaje, imagenUrl = null) {
  db.all('SELECT chat_id FROM suscriptores_telegram', async (err, rows) => {
    if (err || !rows.length) return;
    for (const row of rows) {
      try {
        if (imagenUrl) {
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
            chat_id: row.chat_id,
            photo: imagenUrl,
            caption: mensaje,
            parse_mode: 'Markdown'
          });
        } else {
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: row.chat_id,
            text: mensaje,
            parse_mode: 'Markdown'
          });
        }
      } catch(e) { console.log('Error enviando a', row.chat_id); }
      await new Promise(r => setTimeout(r, 50)); // Pequeña pausa
    }
  });
}

// ========== API PÚBLICA ==========
app.get('/api/config', (req, res) => {
  db.get("SELECT valor FROM configuracion WHERE clave = 'whatsapp'", (err, row) => {
    res.json({ whatsapp: row ? row.valor : '584240000000' });
  });
});

app.post('/api/registrar', async (req, res) => {
  const { nombre, email } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (!nombre || nombre.length < 3) {
    return res.status(400).json({ error: 'Nombre muy corto' });
  }
  db.run("INSERT INTO usuarios_web (nombre, email, ip) VALUES (?, ?, ?)", [nombre, email || '', ip], async function(err) {
    if (err) return res.status(500).json({ error: 'Error al registrar' });
    
    // Notificar a los suscriptores de Telegram (broadcast)
    await broadcastTelegram(`🆕 *NUEVO USUARIO REGISTRADO*\n\n👤 Nombre: ${nombre}\n📧 Email: ${email || 'No'}\n🌐 IP: ${ip}`);
    
    res.json({ success: true, id: this.lastID });
  });
});

app.get('/api/usuario/:nombre', (req, res) => {
  db.get("SELECT id, nombre, email FROM usuarios_web WHERE nombre = ?", [req.params.nombre], (err, row) => {
    res.json({ exists: !!row, user: row });
  });
});

app.get('/api/posts', (req, res) => {
  db.all('SELECT * FROM publicaciones ORDER BY fecha_creacion DESC', (err, rows) => {
    res.json(rows || []);
  });
});

// ========== API ADMIN ==========
function requireAdmin(req, res, next) {
  if (!req.session.admin_logged) return res.status(401).json({ error: 'No autorizado' });
  next();
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  db.get("SELECT valor FROM configuracion WHERE clave = 'admin_pass'", (err, row) => {
    const adminPass = row ? row.valor : '12345678';
    if (password === adminPass) {
      req.session.admin_logged = true;
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Contraseña incorrecta' });
    }
  });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/admin/check', (req, res) => {
  res.json({ logged: !!req.session.admin_logged });
});

app.post('/api/admin/cambiar_pass', requireAdmin, (req, res) => {
  const { nuevaPass } = req.body;
  if (!nuevaPass || nuevaPass.length < 4) {
    return res.status(400).json({ error: 'Mínimo 4 caracteres' });
  }
  db.run("REPLACE INTO configuracion (clave, valor) VALUES ('admin_pass', ?)", [nuevaPass], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/config/whatsapp', requireAdmin, (req, res) => {
  const { numero } = req.body;
  if (!numero || !/^[0-9]{10,15}$/.test(numero)) {
    return res.status(400).json({ error: 'Número inválido' });
  }
  db.run("REPLACE INTO configuracion (clave, valor) VALUES ('whatsapp', ?)", [numero], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/admin/usuarios', requireAdmin, (req, res) => {
  db.all("SELECT id, nombre, email, ip, fecha_registro FROM usuarios_web ORDER BY fecha_registro DESC", (err, rows) => {
    res.json(rows || []);
  });
});

app.get('/api/admin/suscriptores', requireAdmin, (req, res) => {
  db.all("SELECT chat_id, username, nombre, fecha_suscripcion FROM suscriptores_telegram ORDER BY fecha_suscripcion DESC", (err, rows) => {
    res.json(rows || []);
  });
});

app.delete('/api/posts/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.get('SELECT url_media FROM publicaciones WHERE id = ?', [id], (err, row) => {
    if (row && row.url_media) {
      const filepath = path.join(__dirname, 'public', row.url_media);
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    }
    db.run('DELETE FROM publicaciones WHERE id = ?', [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

app.post('/api/publicar', requireAdmin, upload.single('archivo'), async (req, res) => {
  try {
    const { titulo, tipo, userAdmin, enlace_externo, contenido } = req.body;
    const url_media = req.file ? `/uploads/${req.file.filename}` : null;

    if (!titulo || !userAdmin) {
      return res.status(400).json({ error: 'Título y admin son obligatorios' });
    }

    // Guardar en BD
    db.run(`INSERT INTO publicaciones (titulo, contenido, tipo, url_media, enlace_externo, userAdmin)
            VALUES (?, ?, ?, ?, ?, ?)`,
      [titulo, contenido || '', tipo, url_media, enlace_externo, userAdmin]);

    // ARMAR MENSAJE PARA BROADCAST
    let mensaje = `📢 *NUEVA PUBLICACIÓN ACAES*\n\n🚀 *${titulo}*\n📂 Tipo: ${tipo}\n👤 Publicado por: ${userAdmin}`;
    if (contenido) mensaje += `\n\n${contenido.substring(0, 300)}`;
    if (enlace_externo) mensaje += `\n\n🔗 ${enlace_externo}`;
    mensaje += `\n\n🌐 Ver más: ${req.headers.origin}`;

    // Enviar a TODOS los suscriptores de Telegram
    const imagenUrl = url_media ? `${req.headers.origin}${url_media}` : null;
    await broadcastTelegram(mensaje, imagenUrl);

    res.json({ success: true, message: 'Publicado y enviado a todos los suscriptores' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ========== RUTAS HTML ==========
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 ACAES activo en puerto ${PORT}`));
