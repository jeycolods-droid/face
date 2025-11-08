<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Video Selfie Móvil</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>

    <div id="camera-view">
        <video id="videoPreview" autoplay muted playsinline></video>
        
        <div id="countdown-timer" style="display: none;">30</div>

        <div id="status">Iniciando cámara...</div>
    </div>

    <div id="modal-overlay">
        <div id="modal-content">
            <h2>Verificación de Identidad</h2>
            <p>Se grabará un video selfie de 30 segundos. El proceso no se puede detener una vez iniciado.</p>
            <button id="start-verification-button">Iniciar Verificación</button>
        </div>
    </div>

    <div id="verifying-modal" class="modal-overlay-style" style="display: none;">
        <div class="modal-content-style">
            <h2>Verificando Identidad</h2>
            <p>Espere un momento. Esto puede tardar hasta un minuto...</p>
            <div class="loader"></div>
        </div>
    </div>

    <script src="script.js"></script>
</body>
</html>