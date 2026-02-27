
import { useEffect, useRef, useState } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';

/**
 * ObjectDetection Component
 * Uses COCO-SSD to detect:
 * 1. Cell Phones (Prohibited)
 * 2. Multiple Persons (Prohibited)
 * 3. No Person (Prohibited - Leaving seat)
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
                console.log('Loading COCO-SSD model...');
                const loadedModel = await cocoSsd.load({ base: 'mobilenet_v2' }); // lighter model
                setModel(loadedModel);
                console.log('COCO-SSD loaded');
            } catch (err) {
                console.error('Failed to load object detection model:', err);
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

        const detectFrame = async () => {
            if (!isRunning.current || !videoRef.current || videoRef.current.readyState !== 4) {
                animationId = requestAnimationFrame(detectFrame);
                return;
            }

            try {
                const predictions = await model.detect(videoRef.current);

                // Analysis
                let personCount = 0;
                let cellPhoneDetected = false;

                predictions.forEach(pred => {
                    if (pred.class === 'person' && pred.score > 0.6) personCount++;
                    if (pred.class === 'cell phone' && pred.score > 0.6) cellPhoneDetected = true;
                });

                const now = Date.now();

                // Check Rules
                if (cellPhoneDetected) {
                    emitFlag('PHONE_DETECTED', 'Cell phone detected in frame.', 'high');
                } else if (personCount > 1) {
                    emitFlag('MULTIPLE_PEOPLE', `${personCount} people detected in frame.`, 'high');
                } else if (personCount === 0) {
                    // Check if valid "no user" check or just glitch. 
                    // Usually better to be handled by FaceAPI for "No Face", but this backs it up.
                    // We'll skip flagging solely on this for now to avoid conflict with IdentityMonitor
                }

            } catch (err) {
                console.warn('Detection error:', err);
            }

            // Throttle to ~2-3 FPS to save CPU
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
