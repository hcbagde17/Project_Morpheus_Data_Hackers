import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * BehaviorMonitor — Headless proctoring component
 * Uses face detection landmarks to estimate:
 *   1. Head Pose (yaw/pitch from landmark positions)
 *   2. Gaze Direction (looking away / down)
 *   3. Lip Movement (speech detection via mouth landmarks)
 *
 * Props:
 *   active: boolean
 *   videoRef: ref to a <video> element (shared with IdentityMonitor or separate)
 *   onFlag: ({ type, message, severity }) => void
 */
export default function BehaviorMonitor({ active, onFlag }) {
    const videoRef = useRef(null);
    const [stream, setStream] = useState(null);
    const lastFlagRef = useRef({});
    const lastCheckRef = useRef(0);
    const gazeViolationCount = useRef(0);
    const lipViolationCount = useRef(0);

    const emitFlag = useCallback((type, message, severity = 'medium') => {
        const now = Date.now();
        if (lastFlagRef.current[type] && now - lastFlagRef.current[type] < 8000) return;
        lastFlagRef.current[type] = now;
        onFlag?.({ type, message, severity, timestamp: new Date() });
    }, [onFlag]);

    // Start a low-res camera stream for behavior analysis
    useEffect(() => {
        if (!active) return;

        const startCamera = async () => {
            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 320, height: 240, frameRate: 10 }
                });
                setStream(mediaStream);
                if (videoRef.current) {
                    videoRef.current.srcObject = mediaStream;
                }
            } catch (err) {
                console.warn('BehaviorMonitor: camera access failed', err);
            }
        };

        startCamera();
        return () => {
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
            }
        };
    }, [active]);

    // Behavior analysis loop
    useEffect(() => {
        if (!active || !stream || !videoRef.current) return;

        let animationId;
        const CHECK_INTERVAL = 1500; // Check every 1.5 seconds

        const analysisLoop = async (timestamp) => {
            if (timestamp - lastCheckRef.current >= CHECK_INTERVAL) {
                try {
                    const { detectFaces } = await import('../../lib/faceProcessing');

                    if (videoRef.current && videoRef.current.readyState === 4) {
                        const faces = await detectFaces(videoRef.current);

                        if (faces && faces.length === 1) {
                            const face = faces[0];
                            analyzeBehavior(face);
                        }
                    }
                } catch (err) {
                    console.warn('BehaviorMonitor loop error', err);
                }
                lastCheckRef.current = timestamp;
            }
            animationId = requestAnimationFrame(analysisLoop);
        };

        animationId = requestAnimationFrame(analysisLoop);
        return () => cancelAnimationFrame(animationId);
    }, [active, stream]);

    const analyzeBehavior = (face) => {
        const { bbox, landmarks } = face;
        if (!landmarks || landmarks.length < 5) return;

        // =============================
        // 1. Head Pose Estimation (simplified from 5-point landmarks)
        // =============================
        // landmarks: [left_eye, right_eye, nose, left_mouth, right_mouth]
        const [leftEye, rightEye, nose, leftMouth, rightMouth] = landmarks;
        const bboxWidth = bbox[2] - bbox[0];
        const bboxHeight = bbox[3] - bbox[1];
        const bboxCenterX = (bbox[0] + bbox[2]) / 2;
        const bboxCenterY = (bbox[1] + bbox[3]) / 2;

        // Yaw: how far nose is from horizontal center of face bbox
        // Nose should be roughly at center. If nose.x is far from center, face is turned.
        const noseOffsetX = (nose[0] - bboxCenterX) / (bboxWidth / 2); // -1 to 1
        const yawEstimate = Math.abs(noseOffsetX); // 0 = straight, 1 = max turn

        // Pitch: how far nose is from vertical center
        const noseOffsetY = (nose[1] - bboxCenterY) / (bboxHeight / 2);
        const pitchEstimate = noseOffsetY; // positive = looking down

        // =============================
        // 2. Gaze / Looking Away Detection
        // =============================
        // Lowered thresholds for better sensitivity
        if (yawEstimate > 0.20) {
            gazeViolationCount.current++;
            if (gazeViolationCount.current >= 3) { // 3 consecutive detections (~4.5 secs)
                emitFlag('LOOKING_AWAY', `Head turned significantly (yaw: ${(yawEstimate * 100).toFixed(0)}%).`, 'medium');
                gazeViolationCount.current = 0;
            }
        } else if (pitchEstimate > 0.20) {
            gazeViolationCount.current++;
            if (gazeViolationCount.current >= 3) {
                emitFlag('LOOKING_DOWN', `Head tilted down significantly (pitch: ${(pitchEstimate * 100).toFixed(0)}%).`, 'medium');
                gazeViolationCount.current = 0;
            }
        } else {
            gazeViolationCount.current = Math.max(0, gazeViolationCount.current - 1);
        }

        // =============================
        // 3. Lip Movement / Mouth Open Detection
        // =============================
        const eyeDistance = Math.hypot(rightEye[0] - leftEye[0], rightEye[1] - leftEye[1]);
        const mouthWidth = Math.hypot(rightMouth[0] - leftMouth[0], rightMouth[1] - leftMouth[1]);
        const mouthToNoseY = Math.abs(((leftMouth[1] + rightMouth[1]) / 2) - nose[1]);

        // Ratios
        const mouthRatio = mouthWidth / eyeDistance; // Width
        const verticalRatio = mouthToNoseY / eyeDistance; // Openness

        // Yelling/Yawning Check (Wide Open)
        // Vertical ratio is usually < 0.5 when closed. > 0.8 is quite open.
        if (verticalRatio > 0.7) {
            lipViolationCount.current += 2; // Fast track
            if (lipViolationCount.current >= 4) {
                emitFlag('MOUTH_WIDE_OPEN', 'Mouth wide open (yelling/yawning) detected.', 'medium');
                lipViolationCount.current = 0;
            }
        }
        // Talking Check (Width + Some Openness)
        else if (mouthRatio > 0.8 && verticalRatio > 0.3) {
            lipViolationCount.current++;
            if (lipViolationCount.current >= 6) { // ~9 seconds
                emitFlag('LIP_MOVEMENT', 'Possible speech detected (lip movement).', 'medium');
                lipViolationCount.current = 0;
            }
        } else {
            lipViolationCount.current = Math.max(0, lipViolationCount.current - 1);
        }

        // --- EXPORT TO AUDIO INTELLIGENCE ---
        // Calculate velocity (change in vertical ratio)
        // We need previous ratio to calc velocity. Storing in ref for next frame.
        const prevRatio = videoRef.current._lastVerticalRatio || verticalRatio;
        const velocity = Math.abs(verticalRatio - prevRatio);
        videoRef.current._lastVerticalRatio = verticalRatio;

        // Import dynamically to avoid circular dependency issues if any, or just import at top if safe.
        // For now, assuming audioIntelligence is a singleton we can import.
        import('../../lib/audioIntelligence').then(({ audioIntelligence }) => {
            audioIntelligence.updateMouthData(verticalRatio, velocity);
        });
    };

    if (!active) return null;

    // Hidden video element for behavior analysis
    return (
        <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        />
    );
}
