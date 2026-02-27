import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

/**
 * VisionIntelligenceService v2.0
 *
 * Complete reimplementation of the vision behavior intelligence pipeline.
 *
 * SCORING COMPONENTS:
 *   1. Gaze Tracking (35%)       — Iris-to-Eye-Corner vector + grace zones
 *   2. Head Pose (25%)           — Geometric yaw/pitch estimation
 *   3. Duration (15%)            — Sustained suspicious state timer
 *   4. Repetition (15%)          — Rolling 5-min event counter
 *   5. Lip Activity (10%)        — MAR variance over rolling window
 *
 * IMPROVEMENTS OVER v1.0:
 *   - Exponential smoothing (α=0.3) on all sub-scores and final score
 *   - Grace zones near screen edges (reading tolerance)
 *   - Proper face-lost handling (incremental penalty)
 *   - MAR history buffer for variance-based lip detection
 *   - FPS throttling (configurable target FPS)
 *   - Lip data export to AudioIntelligenceService for fusion
 *   - Proper resource cleanup (FaceLandmarker.close())
 *   - Multiple face detection for "extra person" flags
 *   - Blendshape support for enhanced facial expression analysis
 *
 * TRIGGER: final_score > 0.60 → ORANGE FLAG
 */

// ─────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────
const CONFIG = {
    // MediaPipe
    MEDIAPIPE_WASM_CDN: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
    MODEL_URL: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    DELEGATE: "CPU",        // CPU is more stable in browser than GPU delegate
    MAX_FACES: 2,           // Detect up to 2 faces (student + possible intruder)

    // FPS Control
    TARGET_FPS: 8,          // Process at ~8 FPS (balance CPU vs responsiveness)

    // Gaze Thresholds
    GAZE_H_SAFE: [0.30, 0.70],  // Horizontal safe zone (center 40%)
    GAZE_H_GRACE: [0.22, 0.78], // Grace zone (soft penalty before hard threshold)
    GAZE_V_THRESHOLD: 0.4,      // Vertical: looking down significantly
    GAZE_SUSTAINED_MS: 3000,    // Must look away for 3s before full penalty

    // Head Pose Thresholds
    YAW_THRESHOLD: 0.25,        // ~25° side turn
    PITCH_THRESHOLD: 0.20,      // ~20° downward tilt

    // Lip Activity
    MAR_TALKING_THRESHOLD: 0.5, // MAR above this = open mouth
    MAR_VELOCITY_THRESHOLD: 0.08, // Rate of change indicating talking
    MAR_HISTORY_SIZE: 15,       // Rolling window frames for variance calc
    MAR_VARIANCE_THRESHOLD: 0.003, // Variance above this = talking

    // Duration Scoring
    DURATION_MIN_MS: 1000,      // Below 1s → 0 score
    DURATION_MAX_MS: 5000,      // Above 5s → 1.0 score

    // Repetition
    REPETITION_WINDOW_MS: 5 * 60 * 1000, // 5-minute rolling window
    REPETITION_MAX_EVENTS: 5,   // 5 events → max score
    MIN_SUSPICIOUS_MS: 1500,    // Min duration for event to count

    // Face Lost
    FACE_LOST_GRACE_MS: 2000,   // Allow 2s of face loss before penalty
    FACE_LOST_MAX_PENALTY: 0.7, // Cap face-lost score at 0.7

    // Scoring Weights
    WEIGHT_GAZE: 0.35,
    WEIGHT_POSE: 0.25,
    WEIGHT_DURATION: 0.15,
    WEIGHT_REPETITION: 0.15,
    WEIGHT_LIP: 0.10,

    // Thresholds
    FLAG_THRESHOLD: 0.60,       // Score above this → ORANGE FLAG
    FLAG_DEBOUNCE_MS: 5000,     // Min time between flags

    // Smoothing
    SMOOTHING_ALPHA: 0.3,       // Exponential smoothing factor
};

// ─────────────────────────────────────────────
// LANDMARK INDICES (MediaPipe 478-point mesh)
// ─────────────────────────────────────────────
const LM = {
    // Head Pose key points
    NOSE_TIP: 1,
    CHIN: 152,
    LEFT_EYE_OUTER: 33,
    RIGHT_EYE_OUTER: 263,
    MOUTH_LEFT: 61,
    MOUTH_RIGHT: 291,

    // Right Eye (for gaze)
    RIGHT_EYE_INNER: 362,
    RIGHT_IRIS_CENTER: 473,

    // Left Eye (for gaze — second eye for averaging)
    LEFT_EYE_INNER: 133,
    LEFT_IRIS_CENTER: 468,

    // Mouth landmarks (for MAR)
    UPPER_LIP: 13,
    LOWER_LIP: 14,
};

// ─────────────────────────────────────────────
// EXPONENTIAL SMOOTHING HELPER
// ─────────────────────────────────────────────
class ExponentialSmoother {
    constructor(alpha = CONFIG.SMOOTHING_ALPHA) {
        this.alpha = alpha;
        this.value = null;
    }

    update(raw) {
        if (this.value === null) {
            this.value = raw;
        } else {
            this.value = this.alpha * raw + (1 - this.alpha) * this.value;
        }
        return this.value;
    }

    get() { return this.value ?? 0; }

    reset() { this.value = null; }
}

// ─────────────────────────────────────────────
// MAIN SERVICE CLASS
// ─────────────────────────────────────────────
class VisionIntelligenceService {
    constructor() {
        this.faceLandmarker = null;
        this.isRunning = false;
        this.isInitialized = false;
        this.lastVideoTime = -1;
        this._animFrameId = null;
        this._lastProcessTime = 0;

        // Results
        this.headPose = { yaw: 0, pitch: 0 };
        this.gaze = { horizontal: 0.5, vertical: 0.5 };
        this.mouth = { mar: 0, velocity: 0 };
        this.score = 0;
        this.lastBreakdown = null;

        // Smoothers
        this.smoothers = {
            gazeH: new ExponentialSmoother(CONFIG.SMOOTHING_ALPHA),
            gazeV: new ExponentialSmoother(CONFIG.SMOOTHING_ALPHA),
            yaw: new ExponentialSmoother(CONFIG.SMOOTHING_ALPHA),
            pitch: new ExponentialSmoother(CONFIG.SMOOTHING_ALPHA),
            gazeScore: new ExponentialSmoother(CONFIG.SMOOTHING_ALPHA),
            poseScore: new ExponentialSmoother(CONFIG.SMOOTHING_ALPHA),
            lipScore: new ExponentialSmoother(CONFIG.SMOOTHING_ALPHA),
            durationScore: new ExponentialSmoother(CONFIG.SMOOTHING_ALPHA),
            repetitionScore: new ExponentialSmoother(CONFIG.SMOOTHING_ALPHA),
            final: new ExponentialSmoother(CONFIG.SMOOTHING_ALPHA),
        };

        // MAR History Buffer (rolling window for variance)
        this.marHistory = [];

        // Temporal tracking
        this.suspiciousStartTime = 0;
        this.suspiciousEvents = [];    // timestamps
        this._lastEventRecordTime = 0; // prevent double-counting

        // Face-lost tracking
        this.faceLostTime = 0;
        this.faceDetected = false;

        // Multiple faces
        this.faceCount = 0;

        // Flag debouncing
        this._lastFlagTime = 0;

        // Callbacks
        this.onResult = null;
        this.onOrangeFlag = null;

        // FPS control
        this._frameInterval = 1000 / CONFIG.TARGET_FPS;
    }

    // ─────────────────────────────────────────
    // LIFECYCLE
    // ─────────────────────────────────────────

    async initialize() {
        if (this.faceLandmarker) return;

        try {
            console.log('[VisionIntelligence] Loading MediaPipe FaceLandmarker...');

            const vision = await FilesetResolver.forVisionTasks(CONFIG.MEDIAPIPE_WASM_CDN);

            this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: CONFIG.MODEL_URL,
                    delegate: CONFIG.DELEGATE,
                },
                outputFaceBlendshapes: true,
                runningMode: "VIDEO",
                numFaces: CONFIG.MAX_FACES,
            });

            this.isInitialized = true;
            console.log('[VisionIntelligence] FaceLandmarker ready');
        } catch (error) {
            console.error('[VisionIntelligence] Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Start processing video frames.
     * @param {HTMLVideoElement} videoElement — Camera feed
     * @param {Function} onResult — Called each frame with { pose, gaze, mouth, score, breakdown, faceCount }
     * @param {Function} onOrangeFlag — Called when score > threshold
     */
    start(videoElement, onResult, onOrangeFlag) {
        if (!this.faceLandmarker) {
            console.warn('[VisionIntelligence] Not initialized — call initialize() first');
            return;
        }

        this.isRunning = true;
        this.onResult = onResult;
        this.onOrangeFlag = onOrangeFlag;

        const processFrame = () => {
            if (!this.isRunning) return;

            const now = performance.now();

            // FPS throttling
            if (now - this._lastProcessTime >= this._frameInterval) {
                this._lastProcessTime = now;

                if (videoElement.currentTime !== this.lastVideoTime &&
                    videoElement.readyState >= 2 &&
                    !videoElement.paused &&
                    !videoElement.ended) {

                    try {
                        const results = this.faceLandmarker.detectForVideo(videoElement, now);
                        this.lastVideoTime = videoElement.currentTime;

                        if (results?.faceLandmarks?.length > 0) {
                            this.faceDetected = true;
                            this.faceLostTime = 0;
                            this.faceCount = results.faceLandmarks.length;

                            // Process primary face
                            this._analyzeFace(
                                results.faceLandmarks[0],
                                results.faceBlendshapes?.[0]
                            );

                            // Multiple face detection → flag
                            if (this.faceCount > 1) {
                                this._handleMultipleFaces(this.faceCount);
                            }
                        } else {
                            // Face lost
                            this._handleFaceLost();
                        }
                    } catch (err) {
                        console.warn('[VisionIntelligence] Frame processing error:', err);
                    }
                }
            }

            this._animFrameId = requestAnimationFrame(processFrame);
        };

        this._animFrameId = requestAnimationFrame(processFrame);
        console.log(`[VisionIntelligence] Processing started at ~${CONFIG.TARGET_FPS} FPS`);
    }

    stop() {
        console.log('[VisionIntelligence] Stopping...');
        this.isRunning = false;

        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
            this._animFrameId = null;
        }

        if (this.faceLandmarker) {
            try {
                this.faceLandmarker.close();
            } catch (e) {
                console.warn('[VisionIntelligence] Cleanup warning:', e);
            }
            this.faceLandmarker = null;
        }

        this.isInitialized = false;
        this._resetState();
    }

    _resetState() {
        this.headPose = { yaw: 0, pitch: 0 };
        this.gaze = { horizontal: 0.5, vertical: 0.5 };
        this.mouth = { mar: 0, velocity: 0 };
        this.score = 0;
        this.lastBreakdown = null;
        this.marHistory = [];
        this.suspiciousStartTime = 0;
        this.suspiciousEvents = [];
        this.faceLostTime = 0;
        this.faceDetected = false;
        this.faceCount = 0;
        this._lastFlagTime = 0;
        this._lastEventRecordTime = 0;
        Object.values(this.smoothers).forEach(s => s.reset());
    }

    // ─────────────────────────────────────────
    // FACE ANALYSIS
    // ─────────────────────────────────────────

    _analyzeFace(landmarks, blendshapes) {
        // ── 1. HEAD POSE ──
        this._computeHeadPose(landmarks);

        // ── 2. GAZE TRACKING ──
        this._computeGaze(landmarks);

        // ── 3. LIP ACTIVITY ──
        this._computeLipActivity(landmarks);

        // ── 4. EXPORT LIP DATA TO AUDIO INTELLIGENCE ──
        this._exportLipDataToAudio();

        // ── 5. SCORING ──
        this._calculateScore();

        // ── 6. EMIT RESULT ──
        if (this.onResult) {
            this.onResult({
                pose: this.headPose,
                gaze: this.gaze,
                mouth: this.mouth,
                score: this.score,
                breakdown: this.lastBreakdown,
                faceCount: this.faceCount,
                faceDetected: this.faceDetected,
            });
        }
    }

    // ─────────────────────────────────────────
    // HEAD POSE ESTIMATION (Geometric Solver)
    // ─────────────────────────────────────────

    _computeHeadPose(landmarks) {
        const nose = landmarks[LM.NOSE_TIP];
        const leftEye = landmarks[LM.LEFT_EYE_OUTER];
        const rightEye = landmarks[LM.RIGHT_EYE_OUTER];

        // Inter-eye distance for normalization
        const eyeDistX = Math.abs(rightEye.x - leftEye.x);
        if (eyeDistX < 0.01) return; // Safety: face too small / degenerate

        const eyeCenterX = (leftEye.x + rightEye.x) / 2;
        const eyeCenterY = (leftEye.y + rightEye.y) / 2;

        // Yaw: Nose X relative to eye center, normalized by eye distance
        // Range: roughly -1.0 (full left) to +1.0 (full right)
        const rawYaw = (nose.x - eyeCenterX) / (eyeDistX * 1.5);

        // Pitch: Nose Y relative to eye center
        // Positive = looking down, negative = looking up
        const rawPitch = (nose.y - eyeCenterY) / (eyeDistX * 1.5);

        // Apply smoothing
        this.headPose.yaw = this.smoothers.yaw.update(rawYaw);
        this.headPose.pitch = this.smoothers.pitch.update(rawPitch);
    }

    // ─────────────────────────────────────────
    // GAZE TRACKING (Iris-to-Eye-Corner Vector)
    // ─────────────────────────────────────────

    _computeGaze(landmarks) {
        // ── Right Eye ──
        const rIris = landmarks[LM.RIGHT_IRIS_CENTER];
        const rInner = landmarks[LM.RIGHT_EYE_INNER];
        const rOuter = landmarks[LM.RIGHT_EYE_OUTER];

        const rEyeWidth = this._dist(rOuter, rInner);
        const rIrisDist = this._dist(rIris, rInner);
        const rGazeH = rEyeWidth > 0 ? rIrisDist / rEyeWidth : 0.5;

        // ── Left Eye ──
        const lIris = landmarks[LM.LEFT_IRIS_CENTER];
        const lInner = landmarks[LM.LEFT_EYE_INNER];
        const lOuter = landmarks[LM.LEFT_EYE_OUTER];

        const lEyeWidth = this._dist(lOuter, lInner);
        const lIrisDist = this._dist(lIris, lInner);
        const lGazeH = lEyeWidth > 0 ? lIrisDist / lEyeWidth : 0.5;

        // Average both eyes for more stable horizontal gaze
        const rawGazeH = (rGazeH + lGazeH) / 2;

        // Vertical gaze: iris Y vs eye center Y (using right eye)
        const rEyeCenterY = (rInner.y + rOuter.y) / 2;
        const rawGazeV = rEyeWidth > 0
            ? (rIris.y - rEyeCenterY) / (rEyeWidth * 0.5)
            : 0;

        // Apply smoothing
        this.gaze.horizontal = this.smoothers.gazeH.update(rawGazeH);
        this.gaze.vertical = this.smoothers.gazeV.update(rawGazeV);
    }

    // ─────────────────────────────────────────
    // LIP ACTIVITY (MAR Variance)
    // ─────────────────────────────────────────

    _computeLipActivity(landmarks) {
        const upper = landmarks[LM.UPPER_LIP];
        const lower = landmarks[LM.LOWER_LIP];
        const leftMouth = landmarks[LM.MOUTH_LEFT];
        const rightMouth = landmarks[LM.MOUTH_RIGHT];

        const mouthHeight = this._dist(upper, lower);
        const mouthWidth = this._dist(leftMouth, rightMouth);
        const mar = mouthWidth > 0 ? mouthHeight / mouthWidth : 0;

        // Velocity: instantaneous change
        const prevMAR = this.mouth.mar || 0;
        const velocity = Math.abs(mar - prevMAR);

        this.mouth.mar = mar;
        this.mouth.velocity = velocity;

        // Update MAR history buffer for variance calculation
        this.marHistory.push(mar);
        if (this.marHistory.length > CONFIG.MAR_HISTORY_SIZE) {
            this.marHistory.shift();
        }
    }

    /**
     * Calculate variance of MAR over rolling window.
     * High variance = rapid opening/closing = talking.
     */
    _getMARVariance() {
        if (this.marHistory.length < 3) return 0;

        const mean = this.marHistory.reduce((s, v) => s + v, 0) / this.marHistory.length;
        const variance = this.marHistory.reduce((s, v) => s + (v - mean) ** 2, 0) / this.marHistory.length;
        return variance;
    }

    // ─────────────────────────────────────────
    // LIP DATA EXPORT TO AUDIO INTELLIGENCE
    // ─────────────────────────────────────────

    _exportLipDataToAudio() {
        // Dynamically import to avoid circular deps
        import('./audioIntelligence').then(({ audioIntelligence }) => {
            if (audioIntelligence?.updateMouthData) {
                audioIntelligence.updateMouthData(this.mouth.mar, this.mouth.velocity);
            }
        }).catch(() => {
            // audioIntelligence may not be available; that's OK
        });
    }

    // ─────────────────────────────────────────
    // FACE-LOST HANDLING
    // ─────────────────────────────────────────

    _handleFaceLost() {
        if (this.faceDetected) {
            // Just lost face
            this.faceLostTime = Date.now();
            this.faceDetected = false;
        }

        this.faceCount = 0;

        // Grace period before penalizing
        const lostDuration = this.faceLostTime > 0 ? Date.now() - this.faceLostTime : 0;

        if (lostDuration > CONFIG.FACE_LOST_GRACE_MS) {
            // Gradually increase penalty
            const penalty = Math.min(
                CONFIG.FACE_LOST_MAX_PENALTY,
                (lostDuration - CONFIG.FACE_LOST_GRACE_MS) / 5000 // Full penalty after 5s
            );

            const smoothedScore = this.smoothers.final.update(penalty);
            this.score = smoothedScore;

            if (this.onResult) {
                this.onResult({
                    pose: this.headPose,
                    gaze: this.gaze,
                    mouth: this.mouth,
                    score: this.score,
                    breakdown: {
                        gazeScore: 0,
                        poseScore: 0,
                        durationScore: 0,
                        repetitionScore: 0,
                        lipScore: 0,
                        faceLost: true,
                        faceLostMs: lostDuration,
                    },
                    faceCount: 0,
                    faceDetected: false,
                });
            }

            // Flag if face lost too long
            if (penalty > CONFIG.FLAG_THRESHOLD && lostDuration > 5000) {
                this._triggerFlag('Face not detected — student may have left frame');
            }
        }
    }

    // ─────────────────────────────────────────
    // MULTIPLE FACES
    // ─────────────────────────────────────────

    _handleMultipleFaces(count) {
        const now = Date.now();
        // Debounce: don't flag more than once every 10s for multiple faces
        if (this._lastMultiFaceFlag && (now - this._lastMultiFaceFlag < 10000)) return;
        this._lastMultiFaceFlag = now;

        if (this.onOrangeFlag) {
            this.onOrangeFlag({
                type: 'MULTIPLE_FACES',
                message: `${count} faces detected — possible unauthorized person`,
                severity: 'high',
                score: 0.8,
                details: { faceCount: count },
            });
        }
    }

    // ─────────────────────────────────────────
    // SCORING ENGINE
    // ─────────────────────────────────────────

    _calculateScore() {
        // ── A. GAZE SCORE (35%) ──
        // With grace zones: soft penalty in grace zone, hard penalty outside safe zone
        let rawGaze = 0;
        const h = this.gaze.horizontal;
        const v = this.gaze.vertical;

        if (h < CONFIG.GAZE_H_SAFE[0] || h > CONFIG.GAZE_H_SAFE[1]) {
            // Outside safe zone → full penalty
            rawGaze = 1.0;
        } else if (h < CONFIG.GAZE_H_GRACE[1] && h > CONFIG.GAZE_H_GRACE[0]) {
            // Inside grace zone but within safe → no penalty
            rawGaze = 0.0;
        }

        // Vertical: looking down
        if (v > CONFIG.GAZE_V_THRESHOLD) {
            rawGaze = Math.max(rawGaze, 0.8);
        }

        const gazeScore = this.smoothers.gazeScore.update(rawGaze);

        // ── B. HEAD POSE SCORE (25%) ──
        let rawPose = 0;
        if (Math.abs(this.headPose.yaw) > CONFIG.YAW_THRESHOLD ||
            this.headPose.pitch > CONFIG.PITCH_THRESHOLD) {
            rawPose = 1.0;
        }
        const poseScore = this.smoothers.poseScore.update(rawPose);

        // ── C. LIP ACTIVITY SCORE (10%) ──
        const marVariance = this._getMARVariance();
        let rawLip = 0;
        if (marVariance > CONFIG.MAR_VARIANCE_THRESHOLD ||
            this.mouth.mar > CONFIG.MAR_TALKING_THRESHOLD ||
            this.mouth.velocity > CONFIG.MAR_VELOCITY_THRESHOLD) {
            rawLip = 1.0;
        }
        const lipScore = this.smoothers.lipScore.update(rawLip);

        // ── D. DURATION SCORE (15%) ──
        const isSuspicious = rawGaze > 0.5 || rawPose > 0.5;

        if (isSuspicious) {
            if (this.suspiciousStartTime === 0) {
                this.suspiciousStartTime = Date.now();
            }
        } else {
            // Exited suspicious state — record event if it was long enough
            if (this.suspiciousStartTime > 0) {
                const dur = Date.now() - this.suspiciousStartTime;
                if (dur > CONFIG.MIN_SUSPICIOUS_MS && (Date.now() - this._lastEventRecordTime > 3000)) {
                    this.suspiciousEvents.push(Date.now());
                    this._lastEventRecordTime = Date.now();
                }
            }
            this.suspiciousStartTime = 0;
        }

        let rawDuration = 0;
        if (this.suspiciousStartTime > 0) {
            const durationMs = Date.now() - this.suspiciousStartTime;
            rawDuration = Math.min(1.0, Math.max(0,
                (durationMs - CONFIG.DURATION_MIN_MS) /
                (CONFIG.DURATION_MAX_MS - CONFIG.DURATION_MIN_MS)
            ));
        }
        const durationScore = this.smoothers.durationScore.update(rawDuration);

        // ── E. REPETITION SCORE (15%) ──
        this._pruneEvents();
        const rawRepetition = Math.min(1.0, this.suspiciousEvents.length / CONFIG.REPETITION_MAX_EVENTS);
        const repetitionScore = this.smoothers.repetitionScore.update(rawRepetition);

        // ── FINAL WEIGHTED SCORE ──
        const rawFinal =
            (CONFIG.WEIGHT_GAZE * gazeScore) +
            (CONFIG.WEIGHT_POSE * poseScore) +
            (CONFIG.WEIGHT_DURATION * durationScore) +
            (CONFIG.WEIGHT_REPETITION * repetitionScore) +
            (CONFIG.WEIGHT_LIP * lipScore);

        this.score = this.smoothers.final.update(rawFinal);

        // Store breakdown
        this.lastBreakdown = {
            gazeScore,
            poseScore,
            durationScore,
            repetitionScore,
            lipScore,
            // Debug info
            rawGazeH: this.gaze.horizontal,
            rawGazeV: this.gaze.vertical,
            rawYaw: this.headPose.yaw,
            rawPitch: this.headPose.pitch,
            rawMAR: this.mouth.mar,
            marVariance,
            suspiciousDurationMs: this.suspiciousStartTime > 0 ? Date.now() - this.suspiciousStartTime : 0,
            eventCount: this.suspiciousEvents.length,
            faceCount: this.faceCount,
            faceLost: false,
        };

        // ── FLAG CHECK ──
        if (this.score > CONFIG.FLAG_THRESHOLD) {
            this._triggerFlag(this._getFlagMessage());
        }
    }

    // ─────────────────────────────────────────
    // EVENT TRACKING
    // ─────────────────────────────────────────

    _pruneEvents() {
        const cutoff = Date.now() - CONFIG.REPETITION_WINDOW_MS;
        this.suspiciousEvents = this.suspiciousEvents.filter(t => t > cutoff);
    }

    // ─────────────────────────────────────────
    // FLAG SYSTEM
    // ─────────────────────────────────────────

    _triggerFlag(message) {
        const now = Date.now();
        if (now - this._lastFlagTime < CONFIG.FLAG_DEBOUNCE_MS) return;

        this._lastFlagTime = now;

        if (this.onOrangeFlag) {
            this.onOrangeFlag({
                type: 'VISION_INTELLIGENCE',
                message: message || 'Suspicious visual behavior detected',
                severity: 'medium',
                score: this.score,
                details: {
                    breakdown: this.lastBreakdown,
                    faceCount: this.faceCount,
                },
            });
        }
    }

    _getFlagMessage() {
        if (!this.lastBreakdown) return 'Suspicious visual behavior detected';

        const { gazeScore, poseScore, lipScore } = this.lastBreakdown;

        // Prioritize the most significant violation
        if (gazeScore > 0.5 && poseScore > 0.5) {
            return 'Head turned away with eyes looking off-screen';
        }
        if (gazeScore > 0.5) return 'Suspicious eye movement detected (looking away)';
        if (poseScore > 0.5) return 'Head turned away from screen';
        if (lipScore > 0.5) return 'Talking detected (sustained lip movement)';
        return `Suspicious behavior (Confidence: ${(this.score * 100).toFixed(0)}%)`;
    }

    // ─────────────────────────────────────────
    // UTILITIES
    // ─────────────────────────────────────────

    _dist(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }
}

// ─────────────────────────────────────────────
// SINGLETON EXPORT
// ─────────────────────────────────────────────
export const visionIntelligence = new VisionIntelligenceService();
export default visionIntelligence;
