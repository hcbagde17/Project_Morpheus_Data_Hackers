
/**
 * ProctoringService
 * Handles the acquisition and composition of Screen + Camera streams.
 * Creates a mixed MediaStream where the camera is overlayed on the screen share (Picture-in-Picture).
 */

class ProctoringService {
    constructor() {
        this.screenStream = null;
        this.cameraStream = null;
        this.canvas = null;
        this.ctx = null;
        this.mixedStream = null;
        this.animationId = null;
        this.isActive = false;
        this.videoElements = {
            screen: document.createElement('video'),
            camera: document.createElement('video')
        };

        // Config
        this.canvasWidth = 1280;
        this.canvasHeight = 720;
        this.pipWidth = 320;
        this.pipHeight = 240;
        this.pipMargin = 20;

        // Mute internal video elements to avoid feedback
        this.videoElements.screen.muted = true;
        this.videoElements.camera.muted = true;
        this.videoElements.screen.playsInline = true;
        this.videoElements.camera.playsInline = true;
    }

    /**
     * Start the proctoring session.
     * Requests Screen Share first, then Camera.
     * @returns {Promise<MediaStream>} The mixed stream (Video: Canvas, Audio: Mic + System)
     */
    async start() {
        if (this.isActive) return this.mixedStream;

        try {
            // 1. Get Screen Stream - DISABLED per user request (issues with NotSupportedError)
            console.log('Screen recording disabled by configuration.');
            this.screenStream = null;

            /* 
            // Original Screen Share Logic (Commented Out)
            console.log('Requesting Screen Share...');
            if (window.electronAPI) {
                // ... Electron specific logic ...
            } else {
                // ... Browser specific logic ...
            }
            */

            // 2. Get Camera Stream (Audio is Mic)
            console.log('Requesting Camera...');
            this.cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480 },
                audio: true
            });

            // 3. Setup Video Elements (Internal usage only if needed for canvas, otherwise optional)
            // this.videoElements.screen.srcObject = this.screenStream; 
            this.videoElements.camera.srcObject = this.cameraStream;
            await this.videoElements.camera.play();

            // 4. Skip Canvas Composition -> Use Camera Stream Directly as Mixed Stream
            // This ensures we get valid video evidence without failing on screen capture
            this.isActive = true;

            // Note: If we need purely just video tracks for evidence, this works.
            // If we needed to maintain the canvas aspect ratio, we would keep drawing camera on canvas.
            // For now, simpler is better to fix the error.

            this.mixedStream = this.cameraStream;
            console.log('ProctoringService: Started camera-only stream (Screen recording disabled)');

            return this.mixedStream;

        } catch (err) {
            console.error('ProctoringService Start Error:', err);
            this.stop(); // Cleanup partials
            throw err;
        }
    }

    drawLoop() {
        if (!this.isActive) return;

        // Draw Screen (Full)
        if (this.videoElements.screen.readyState === 4) {
            this.ctx.drawImage(this.videoElements.screen, 0, 0, this.canvasWidth, this.canvasHeight);
        } else {
            // Black background if not ready
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
            this.ctx.fillStyle = '#fff';
            this.ctx.fillText("Waiting for screen...", 50, 50);
        }

        // Draw Camera (PIP - Bottom Right)
        if (this.videoElements.camera.readyState === 4) {
            const x = this.canvasWidth - this.pipWidth - this.pipMargin;
            const y = this.canvasHeight - this.pipHeight - this.pipMargin;

            // Border
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x, y, this.pipWidth, this.pipHeight);

            this.ctx.drawImage(this.videoElements.camera, x, y, this.pipWidth, this.pipHeight);
        }

        // Add Timestamp
        this.ctx.font = '20px monospace';
        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this.ctx.fillRect(10, 10, 300, 30);
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText(new Date().toISOString(), 20, 32);

        this.animationId = requestAnimationFrame(() => this.drawLoop());
    }

    stop() {
        console.log('ProctoringService: Stopping...');
        this.isActive = false;

        if (this.animationId) cancelAnimationFrame(this.animationId);

        // Stop Streams
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(t => t.stop());
            this.screenStream = null;
        }
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(t => t.stop());
            this.cameraStream = null;
        }
        if (this.mixedStream) {
            this.mixedStream.getTracks().forEach(t => t.stop());
            this.mixedStream = null;
        }

        // Clear refs
        this.videoElements.screen.srcObject = null;
        this.videoElements.camera.srcObject = null;
    }
}

export const mediaService = new ProctoringService();
