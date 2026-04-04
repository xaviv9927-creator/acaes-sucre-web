const express = require('express');
const axios = require('axios');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const db = require('./database');
const fs = require('fs');

const app = express();

// Middlewares
app.use(express.json());
app.use(express.static('public'));

// Crear carpeta de uploads
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// Configuración multer para archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        cb(null, allowed.includes(file.mimetype));
    }
});

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { error: 'Demasiadas solicitudes, esperá un momento' }
});
app.use('/api/', limiter);

// Tokens Telegram (cambiá por los tuyos)
const CORE_BOT_TOKEN = '8669080229:AAEKBAK0w-bxVGJ_FFwKfcJpbayej3tIoqY';
const NOTIFICA_BOT_TOKEN = '8523330186:AAFrAZC8EmzdHUHxKZsqJ-ZpjYmMKppGvEo';
const ADMIN_GROUP_ID = '-1005231299580';
const PUBLIC_CHANNEL_ID = '@acaeslacertanotifica';

// ========== API ==========

// Obtener configuración (WhatsApp)
app.get('/api/config', (req, res) => {
    db.get("SELECT valor FROM configuracion WHERE clave = 'whatsapp'", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ whatsapp: row ? row.valor : '584240000000' });
    });
});

// Actualizar número de WhatsApp (solo admin)
app.post('/api/config/whatsapp', (req, res) => {
    const { numero } = req.body;
    if (!numero || !/^[0-9]{10,15}$/.test(numero)) {
        return res.status(400).json({ error: 'Número inválido (solo dígitos, 10-15 caracteres)' });
    }
    db.run("REPLACE INTO configuracion (clave, valor) VALUES ('whatsapp', ?)", [numero], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, numero });
    });
});

// Obtener todas las publicaciones
app.get('/api/posts', (req, res) => {
    db.all('SELECT * FROM publicaciones ORDER BY fecha_creacion DESC', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Eliminar publicación (con borrado físico del archivo)
app.delete('/api/posts/:id', (req, res) => {
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

// Crear publicación
app.post('/api/publicar', upload.single('archivo'), async (req, res) => {
    try {
        const { titulo, tipo, notifyPublic, userAdmin, enlace_externo, contenido } = req.body;
        const url_media = req.file ? `/uploads/${req.file.filename}` : null;

        if (!titulo || !userAdmin) {
            return res.status(400).json({ error: 'Título y admin son obligatorios' });
        }

        // Guardar en BD
        const stmt = db.prepare(`
            INSERT INTO publicaciones (titulo, contenido, tipo, url_media, enlace_externo, userAdmin, notificado_publico)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(titulo, contenido || '', tipo, url_media, enlace_externo, userAdmin, notifyPublic === 'true' ? 1 : 0);
        stmt.finalize();

        // Notificación al grupo de control
        let mensajeCore = `✅ *Nueva publicación*\n👤 Admin: ${userAdmin}\n📝 Título: ${titulo}\n📂 Tipo: ${tipo}`;
        if (url_media) mensajeCore += `\n🖼️ Archivo: ${req.file.originalname}`;
        if (enlace_externo) mensajeCore += `\n🔗 Enlace: ${enlace_externo}`;
        
        await axios.post(`https://api.telegram.org/bot${CORE_BOT_TOKEN}/sendMessage`, {
            chat_id: ADMIN_GROUP_ID,
            text: mensajeCore,
            parse_mode: 'Markdown'
        }).catch(e => console.log('Error core:', e.message));

        // Notificación al canal público
        if (notifyPublic === 'true') {
            let mensajePublico = `📢 *NUEVO CONTENIDO ACAES*\n\n🚀 *${titulo}*`;
            if (contenido) mensajePublico += `\n\n${contenido.substring(0, 200)}`;
            if (enlace_externo) mensajePublico += `\n\n🔗 ${enlace_externo}`;
            mensajePublico += `\n\n#Astronomía #Sucre`;

            await axios.post(`https://api.telegram.org/bot${NOTIFICA_BOT_TOKEN}/sendMessage`, {
                chat_id: PUBLIC_CHANNEL_ID,
                text: mensajePublico,
                parse_mode: 'Markdown'
            }).catch(e => console.log('Error canal:', e.message));
        }

        res.json({ success: true, message: 'Publicado correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 ACAES Sucre activo en puerto ${PORT}`));
