
import { useEffect, useRef, useState } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';

/**
 * ObjectDetection Component
 * Uses COCO-SSD to detect cell phones in the webcam frame.
 * Person / multi-face detection is handled by IdentityMonitor.
 */
export default function ObjectDetection({ active, stream, onFlag }) {
    const videoRef = useRef(null);
    const [model, setModel] = useState(null);
    const lastFlagRef = useRef({});
    const isRunning = useRef(false);

    // Load Model
    useEffect(() => {
        const loadModel = async () => {
            try {
                console.log('Loading COCO-SSD model from local bundle...');
                const loadedModel = await cocoSsd.load({
                    modelUrl: '/models/coco-ssd/model.json',
                });
                setModel(loadedModel);
                console.log('COCO-SSD loaded from local bundle ✔');
            } catch (err) {
                console.warn('Local COCO-SSD model not found, falling back to CDN:', err.message);
                try {
                    // Fallback: CDN (requires internet) — run scripts/download_coco_ssd.cjs to avoid this
                    const loadedModel = await cocoSsd.load({ base: 'mobilenet_v2' });
                    setModel(loadedModel);
                    console.log('COCO-SSD loaded from CDN (fallback)');
                } catch (fallbackErr) {
                    console.error('Failed to load object detection model:', fallbackErr);
                }
            }
        };
        loadModel();
    }, []);

    // Bind Stream
    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    // Detection Loop
    useEffect(() => {
        if (!active || !model || !stream || !videoRef.current) return;

        isRunning.current = true;
        let animationId;

        // Phone detection threshold — ORANGE flag (warning only)
        const PHONE_THRESHOLD = 0.30;

        const detectFrame = async () => {
            if (!isRunning.current || !videoRef.current || videoRef.current.readyState !== 4) {
                animationId = requestAnimationFrame(detectFrame);
                return;
            }

            try {
                const predictions = await model.detect(videoRef.current);

                const cellPhoneDetected = predictions.some(
                    pred => pred.class === 'cell phone' && pred.score > PHONE_THRESHOLD
                );

                if (cellPhoneDetected) {
                    emitFlag('PHONE_DETECTED', 'Cell phone detected in frame.', 'medium');
                }

            } catch (err) {
                console.warn('Detection error:', err);
            }

            // Throttle to ~2 FPS to save CPU
            setTimeout(() => {
                if (isRunning.current) animationId = requestAnimationFrame(detectFrame);
            }, 500);
        };

        const emitFlag = (type, message, severity) => {
            const now = Date.now();
            // Debounce: Don't flag same thing within 10 seconds
            if (lastFlagRef.current[type] && now - lastFlagRef.current[type] < 10000) return;
            lastFlagRef.current[type] = now;
            onFlag?.({ type, message, severity, timestamp: new Date() });
        };

        detectFrame();

        return () => {
            isRunning.current = false;
            cancelAnimationFrame(animationId);
        };
    }, [active, model, stream, onFlag]);

    return (
        <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
                position: 'fixed',
                width: 320,
                height: 240,
                opacity: 0,
                pointerEvents: 'none',
                zIndex: -1
            }}
        />
    );
}
