const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// --- CONFIGURACIÓN ACAES SUCRE 🛰️ ---
const CORE_BOT_TOKEN = '8669080229:AAEKBAK0w-bxVGJ_FFwKfcJpbayej3tIoqY'; 
const NOTIFICA_BOT_TOKEN = '8523330186:AAFrAZC8EmzdHUHxKZsqJ-ZpjYmMKppGvEo';

// IDs del Grupo y Canal de Sucre
const ADMIN_GROUP_ID = '-1005231299580'; 
const PUBLIC_CHANNEL_ID = '@acaeslacertanotifica'; 
// -----------------------------------------

app.post('/api/publicar', async (req, res) => {
    const { titulo, link, tipo, notifyPublic, userAdmin } = req.body;

    try {
        // 1. Notificar al Core Sistem (Privado)
        await axios.post(`https://api.telegram.org/bot${CORE_BOT_TOKEN}/sendMessage`, {
            chat_id: ADMIN_GROUP_ID,
            text: `✅ **Actividad ACAES Sucre**\n\n👤 **Admin:** ${userAdmin}\n📝 **Post:** ${titulo}\n📂 **Tipo:** ${tipo}\n🔗 **Enlace:** ${link}`,
            parse_mode: 'Markdown'
        });

        // 2. Notificar al Canal Público (Todo Sucre)
        if (notifyPublic) {
            await axios.post(`https://api.telegram.org/bot${NOTIFICA_BOT_TOKEN}/sendMessage`, {
                chat_id: PUBLIC_CHANNEL_ID,
                text: `📢 **NUEVA PUBLICACIÓN EN ACAES SUCRE** 🌌\n\n🚀 *${titulo}*\n\n🔗 Mira los detalles aquí: ${link}`,
                parse_mode: 'Markdown'
            });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error en Telegram' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor ACAES activo en puerto ${PORT} 🛰️`));
