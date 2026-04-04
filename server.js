const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());
app.use(express.static('public'));

// CONFIGURACIÓN DE TOKENS (Luego los pondrás en Render)
const CORE_BOT_TOKEN = process.env.CORE_BOT_TOKEN; 
const NOTIFICA_BOT_TOKEN = process.env.NOTIFICA_BOT_TOKEN;
const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID; 
const PUBLIC_CHANNEL_ID = process.env.PUBLIC_CHANNEL_ID;

// Ruta para publicar desde el Admin
app.post('/api/publicar', async (req, res) => {
    const { titulo, link, tipo, notifyPublic } = req.body;

    // 1. Notificar al Core Sistem (Privado - Siempre)
    await axios.post(`https://api.telegram.org/bot${CORE_BOT_TOKEN}/sendMessage`, {
        chat_id: ADMIN_GROUP_ID,
        text: `✅ **Nueva Actividad**\nSe publicó: ${titulo}\nTipo: ${tipo}`,
        parse_mode: 'Markdown'
    });

    // 2. Notificar al Público (Solo si lo activas en el panel)
    if (notifyPublic) {
        await axios.post(`https://api.telegram.org/bot${NOTIFICA_BOT_TOKEN}/sendMessage`, {
            chat_id: PUBLIC_CHANNEL_ID,
            text: `📢 **ACAES Sucre Informa:**\n\n🚀 ${titulo}\n\n🔗 Ver aquí: ${link}`,
            parse_mode: 'Markdown'
        });
    }

    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
