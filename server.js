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

// Sesión en memoria (simple, sin SQLite para evitar corrupción)
app.use(session({
  secret: 'acaes_sucre_secret_2024_muy_largo',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000, httpOnly: true, secure: false, sameSite: 'lax' }
}));

// Carpeta de uploads
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

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

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', limiter);

// Funciones de configuración
function getBotToken(cb) {
  db.get("SELECT valor FROM configuracion WHERE clave = 'bot_token'", (err, row) => cb(err, row ? row.valor : ''));
}
function getAdminTelegramId(cb) {
  db.get("SELECT valor FROM configuracion WHERE clave = 'admin_telegram_id'", (err, row) => cb(err, row ? row.valor : ''));
}
function notificarAdmin(mensaje) {
  getBotToken((err, botToken) => {
    if (err || !botToken) return;
    getAdminTelegramId((err2, adminId) => {
      if (adminId) {
        axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          chat_id: adminId,
          text: mensaje,
          parse_mode: 'Markdown'
        }).catch(e => console.log('Error notificando admin:', e.message));
      }
    });
  });
}
// Broadcast solo al administrador (sin suscriptores)
async function broadcastTelegram(mensaje, imagenUrl = null) {
  getBotToken(async (err, botToken) => {
    if (err || !botToken) return;
    getAdminTelegramId(async (err2, adminId) => {
      if (adminId) {
        try {
          if (imagenUrl) {
            await axios.post(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
              chat_id: adminId,
              photo: imagenUrl,
              caption: mensaje,
              parse_mode: 'Markdown'
            });
          } else {
            await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              chat_id: adminId,
              text: mensaje,
              parse_mode: 'Markdown'
            });
          }
        } catch(e) { console.error('Error enviando a admin:', e.message); }
      }
    });
  });
}

// Webhook Telegram (solo para guardar suscriptores, pero no se usa broadcast)
app.post('/webhook', async (req, res) => {
  const update = req.body;
  if (update.message && update.message.text === '/start') {
    getBotToken((err, botToken) => {
      if (err || !botToken) return;
      const chat_id = update.message.chat.id;
      const username = update.message.chat.username || '';
      const nombre = update.message.chat.first_name || '';
      db.run(`INSERT OR IGNORE INTO suscriptores_telegram (chat_id, username, nombre) VALUES (?, ?, ?)`,
        [chat_id, username, nombre]);
      axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chat_id,
        text: '✅ ¡Bienvenido a ACAES! Recibirás las novedades (próximamente).'
      }).catch(e => console.log('Error:', e.message));
      notificarAdmin(`🆕 *NUEVO SUSCRIPTOR*\n\n👤 ${nombre} (@${username})`);
    });
  }
  res.sendStatus(200);
});

// ========== API PÚBLICA ==========
app.get('/api/config', (req, res) => {
  db.get("SELECT valor FROM configuracion WHERE clave = 'whatsapp'", (err, row) => {
    res.json({ whatsapp: row ? row.valor : '584240000000' });
  });
});

app.get('/api/categorias', (req, res) => {
  db.all('SELECT * FROM categorias ORDER BY padre_id, orden', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const map = {};
    rows.forEach(c => { map[c.id] = { ...c, hijos: [] }; });
    const arbol = [];
    rows.forEach(c => {
      if (c.padre_id === 0) arbol.push(map[c.id]);
      else if (map[c.padre_id]) map[c.padre_id].hijos.push(map[c.id]);
    });
    res.json(arbol);
  });
});

app.get('/api/posts', (req, res) => {
  db.all(`SELECT p.*, c.nombre as categoria_nombre, c.slug as categoria_slug
          FROM publicaciones p
          LEFT JOIN categorias c ON p.categoria_id = c.id
          ORDER BY p.fecha_creacion DESC`, (err, rows) => {
    res.json(rows || []);
  });
});

app.get('/api/posts/categoria/:slug', (req, res) => {
  const { slug } = req.params;
  db.get('SELECT id FROM categorias WHERE slug = ?', [slug], (err, cat) => {
    if (err || !cat) return res.json([]);
    db.all(`SELECT p.*, c.nombre as categoria_nombre
            FROM publicaciones p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.categoria_id = ?
            ORDER BY p.fecha_creacion DESC`, [cat.id], (err2, rows) => {
      res.json(rows || []);
    });
  });
});

app.get('/api/posts/:id', (req, res) => {
  db.get('SELECT * FROM publicaciones WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  });
});

app.post('/api/registrar', async (req, res) => {
  const { nombre } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (!nombre || nombre.length < 3) return res.status(400).json({ error: 'Nombre muy corto' });
  db.run("INSERT INTO usuarios_web (nombre, ip) VALUES (?, ?)", [nombre, ip], async function(err) {
    if (err) return res.status(500).json({ error: 'Error al registrar' });
    notificarAdmin(`🆕 *NUEVO USUARIO REGISTRADO*\n\n👤 Nombre: ${nombre}\n🌐 IP: ${ip}`);
    res.json({ success: true, id: this.lastID });
  });
});

app.get('/api/usuario/:nombre', (req, res) => {
  db.get("SELECT id, nombre FROM usuarios_web WHERE nombre = ?", [req.params.nombre], (err, row) => {
    res.json({ exists: !!row, user: row });
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
      req.session.save();
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      notificarAdmin(`🔐 *INICIO DE SESIÓN ADMIN*\n\n🌐 IP: ${ip}\n📅 ${new Date().toLocaleString()}`);
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
  if (!nuevaPass || nuevaPass.length < 4) return res.status(400).json({ error: 'Mínimo 4 caracteres' });
  db.run("REPLACE INTO configuracion (clave, valor) VALUES ('admin_pass', ?)", [nuevaPass], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    notificarAdmin(`🔑 *CONTRASEÑA ADMIN CAMBIADA*`);
    res.json({ success: true });
  });
});

app.post('/api/config/whatsapp', requireAdmin, (req, res) => {
  const { numero } = req.body;
  if (!numero || !/^[0-9]{10,15}$/.test(numero)) return res.status(400).json({ error: 'Número inválido' });
  db.run("REPLACE INTO configuracion (clave, valor) VALUES ('whatsapp', ?)", [numero], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    notificarAdmin(`📱 *WHATSAPP ACTUALIZADO: +${numero}`);
    res.json({ success: true });
  });
});

app.post('/api/admin/bot_token', requireAdmin, (req, res) => {
  const { token } = req.body;
  if (!token || token.length < 10) return res.status(400).json({ error: 'Token inválido' });
  db.run("REPLACE INTO configuracion (clave, valor) VALUES ('bot_token', ?)", [token], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    notificarAdmin(`🤖 *TOKEN DEL BOT ACTUALIZADO*`);
    res.json({ success: true });
  });
});

app.post('/api/admin/admin_id', requireAdmin, (req, res) => {
  const { id } = req.body;
  if (!id || !/^[0-9]+$/.test(id)) return res.status(400).json({ error: 'ID inválido' });
  db.run("REPLACE INTO configuracion (clave, valor) VALUES ('admin_telegram_id', ?)", [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    notificarAdmin(`🆔 *ID ADMIN ACTUALIZADO: ${id}`);
    res.json({ success: true });
  });
});

app.get('/api/admin/config', requireAdmin, (req, res) => {
  db.all("SELECT clave, valor FROM configuracion", (err, rows) => {
    const config = {};
    rows.forEach(row => { config[row.clave] = row.valor; });
    res.json(config);
  });
});

// CRUD de categorías
app.post('/api/admin/categorias', requireAdmin, (req, res) => {
  const { nombre, slug, padre_id, orden } = req.body;
  if (!nombre || !slug) return res.status(400).json({ error: 'Nombre y slug requeridos' });
  db.run("INSERT INTO categorias (nombre, slug, padre_id, orden) VALUES (?, ?, ?, ?)",
    [nombre, slug, padre_id || 0, orden || 0], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      notificarAdmin(`📁 *CATEGORÍA CREADA*: ${nombre}`);
      res.json({ success: true, id: this.lastID });
    });
});

app.put('/api/admin/categorias/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { nombre, slug, padre_id, orden } = req.body;
  db.run("UPDATE categorias SET nombre = ?, slug = ?, padre_id = ?, orden = ? WHERE id = ?",
    [nombre, slug, padre_id || 0, orden || 0, id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      notificarAdmin(`✏️ *CATEGORÍA EDITADA*: ${nombre}`);
      res.json({ success: true });
    });
});

app.delete('/api/admin/categorias/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM categorias WHERE id = ?", [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    notificarAdmin(`🗑️ *CATEGORÍA ELIMINADA* ID: ${id}`);
    res.json({ success: true });
  });
});

app.post('/api/admin/subcategoria', requireAdmin, (req, res) => {
  const { nombre, slug, padre_id } = req.body;
  if (!nombre || !slug || !padre_id) return res.status(400).json({ error: 'Datos incompletos' });
  db.get("SELECT id FROM categorias WHERE id = ?", [padre_id], (err, row) => {
    if (err || !row) return res.status(400).json({ error: 'La categoría padre no existe' });
    db.get("SELECT id FROM categorias WHERE slug = ?", [slug], (err2, row2) => {
      if (row2) return res.status(400).json({ error: 'Ya existe una categoría con ese slug' });
      db.run("INSERT INTO categorias (nombre, slug, padre_id, orden) VALUES (?, ?, ?, (SELECT COALESCE(MAX(orden),0)+1 FROM categorias WHERE padre_id=?))",
        [nombre, slug, padre_id, padre_id], function(err3) {
          if (err3) return res.status(500).json({ error: err3.message });
          notificarAdmin(`📁 *SUBCATEGORÍA CREADA*: ${nombre} (padre ID ${padre_id})`);
          res.json({ success: true, id: this.lastID });
        });
    });
  });
});

app.get('/api/admin/usuarios', requireAdmin, (req, res) => {
  db.all("SELECT id, nombre, ip, fecha_registro FROM usuarios_web ORDER BY fecha_registro DESC", (err, rows) => {
    res.json(rows || []);
  });
});

app.get('/api/admin/suscriptores', requireAdmin, (req, res) => {
  db.all("SELECT chat_id, username, nombre, fecha_suscripcion FROM suscriptores_telegram ORDER BY fecha_suscripcion DESC", (err, rows) => {
    res.json(rows || []);
  });
});

// CRUD publicaciones
app.delete('/api/posts/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.get('SELECT titulo, url_media FROM publicaciones WHERE id = ?', [id], (err, row) => {
    if (row && row.url_media) {
      const filepath = path.join(__dirname, 'public', row.url_media);
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    }
    db.run('DELETE FROM publicaciones WHERE id = ?', [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      notificarAdmin(`🗑️ *PUBLICACIÓN ELIMINADA*: ${row ? row.titulo : id}`);
      res.json({ success: true });
    });
  });
});

app.put('/api/posts/:id', requireAdmin, upload.single('archivo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, contenido, tipo, userAdmin, enlace_externo, categoria_id } = req.body;
    const url_media = req.file ? `/uploads/${req.file.filename}` : null;
    if (!titulo || !userAdmin) return res.status(400).json({ error: 'Título y admin obligatorios' });
    db.get('SELECT url_media FROM publicaciones WHERE id = ?', [id], (err, old) => {
      if (old && old.url_media && url_media && old.url_media !== url_media) {
        const oldPath = path.join(__dirname, 'public', old.url_media);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    });
    const updateQuery = url_media
      ? `UPDATE publicaciones SET titulo = ?, contenido = ?, tipo = ?, categoria_id = ?, url_media = ?, enlace_externo = ?, userAdmin = ? WHERE id = ?`
      : `UPDATE publicaciones SET titulo = ?, contenido = ?, tipo = ?, categoria_id = ?, enlace_externo = ?, userAdmin = ? WHERE id = ?`;
    const params = url_media
      ? [titulo, contenido || '', tipo, categoria_id || null, url_media, enlace_externo, userAdmin, id]
      : [titulo, contenido || '', tipo, categoria_id || null, enlace_externo, userAdmin, id];
    db.run(updateQuery, params, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      notificarAdmin(`✏️ *PUBLICACIÓN EDITADA*: ${titulo}\n👤 ${userAdmin}`);
      res.json({ success: true });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/api/publicar', requireAdmin, upload.single('archivo'), async (req, res) => {
  try {
    const { titulo, contenido, tipo, userAdmin, enlace_externo, categoria_id } = req.body;
    const url_media = req.file ? `/uploads/${req.file.filename}` : null;
    if (!titulo || !userAdmin) return res.status(400).json({ error: 'Título y admin obligatorios' });
    db.run(`INSERT INTO publicaciones (titulo, contenido, tipo, categoria_id, url_media, enlace_externo, userAdmin)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [titulo, contenido || '', tipo, categoria_id || null, url_media, enlace_externo, userAdmin], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        notificarAdmin(`📢 *NUEVA PUBLICACIÓN*: ${titulo}\n👤 ${userAdmin}`);
        let catNombre = '';
        if (categoria_id) {
          db.get("SELECT nombre FROM categorias WHERE id = ?", [categoria_id], (err2, row) => {
            if (row) catNombre = row.nombre;
            const mensaje = `📢 *NUEVA PUBLICACIÓN ACAES*\n\n🚀 *${titulo}*\n📂 Tipo: ${tipo}${catNombre ? `\n📁 Categoría: ${catNombre}` : ''}\n👤 Por: ${userAdmin}${contenido ? `\n\n${contenido.substring(0,300)}` : ''}${enlace_externo ? `\n\n🔗 ${enlace_externo}` : ''}\n\n🌐 ${req.headers.origin || 'https://acaes-sucre.onrender.com'}`;
            const imagenUrl = url_media ? `${req.headers.origin || 'https://acaes-sucre.onrender.com'}${url_media}` : null;
            broadcastTelegram(mensaje, imagenUrl);
          });
        } else {
          const mensaje = `📢 *NUEVA PUBLICACIÓN ACAES*\n\n🚀 *${titulo}*\n📂 Tipo: ${tipo}\n👤 Por: ${userAdmin}${contenido ? `\n\n${contenido.substring(0,300)}` : ''}${enlace_externo ? `\n\n🔗 ${enlace_externo}` : ''}\n\n🌐 ${req.headers.origin || 'https://acaes-sucre.onrender.com'}`;
          const imagenUrl = url_media ? `${req.headers.origin || 'https://acaes-sucre.onrender.com'}${url_media}` : null;
          broadcastTelegram(mensaje, imagenUrl);
        }
      });
    res.json({ success: true, message: 'Publicado' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ========== RUTAS HTML ==========
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/index.html', (req, res) => res.redirect('/'));
app.get('/admin.html', (req, res) => res.redirect('/admin'));
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 ACAES activo en puerto ${PORT}`));
