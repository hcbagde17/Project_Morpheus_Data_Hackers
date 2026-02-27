import { MicVAD } from "@ricky0123/vad-web";

/**
 * AudioIntelligenceService v2.0
 * 
 * Complete reimplementation of the audio intelligence pipeline.
 * 
 * SCORING COMPONENTS:
 *   1. Speech Probability (40%) — Silero VAD v4 with adaptive threshold
 *   2. Near-Field Estimation (25%) — FFT + Spectral Flatness + Voice Band Energy
 *   3. Duration Score (15%) — Linear scale: 0 at 500ms, 1.0 at 4000ms
 *   4. Repetition Score (10%) — Rolling 10-min event counter
 *   5. Lip Sync Correlation (10%) — Mouth velocity from BehaviorMonitor
 * 
 * IMPROVEMENTS OVER v1.0:
 *   - Ambient noise baseline calibration (first 5 seconds)
 *   - Adaptive VAD threshold (baseline + margin)
 *   - Exponential smoothing on all scores (α=0.3)
 *   - Proper spectral flatness calculation (geometric/arithmetic mean)
 *   - Better near-field heuristic (reduced weight per master plan: 25% → 25% but better calibrated)
 *   - Proper resource cleanup and error handling
 *   - Configurable thresholds
 * 
 * TRIGGER: final_confidence > 0.65 → ORANGE FLAG
 */

// ─────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────
const CONFIG = {
    // VAD
    VAD_POSITIVE_THRESHOLD: 0.5,       // Initial positive speech threshold
    VAD_MIN_SPEECH_FRAMES: 5,          // Min frames before speech confirmed
    VAD_ONNX_CDN: "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/",

    // FFT
    FFT_SIZE: 512,                     // 256 frequency bins
    SAMPLE_RATE: 16000,                // 16kHz mono
    VOICE_BAND_LOW: 300,               // Hz — lower bound of human voice
    VOICE_BAND_HIGH: 3400,             // Hz — upper bound of human voice

    // Calibration
    CALIBRATION_DURATION_MS: 5000,     // 5 seconds baseline capture
    CALIBRATION_MARGIN: 0.15,          // Margin above baseline for adaptive threshold

    // Scoring Weights
    WEIGHT_SPEECH: 0.40,
    WEIGHT_NEAR_FIELD: 0.25,
    WEIGHT_DURATION: 0.15,
    WEIGHT_REPETITION: 0.10,
    WEIGHT_LIP_SYNC: 0.10,

    // Thresholds
    FLAG_THRESHOLD: 0.65,              // Score above this → ORANGE FLAG
    FLAG_DEBOUNCE_MS: 5000,            // Min time between flags

    // Duration scoring
    DURATION_MIN_MS: 500,              // Below this → 0 score
    DURATION_MAX_MS: 4000,             // Above this → 1.0 score

    // Repetition
    REPETITION_WINDOW_MS: 10 * 60 * 1000,  // 10-minute rolling window
    REPETITION_MAX_EVENTS: 5,          // 5 events → max score
    MIN_SPEECH_EVENT_MS: 1500,         // Min duration to count as speech event

    // Smoothing
    SMOOTHING_ALPHA: 0.3,             // Exponential smoothing factor (lower = smoother)

    // Near-field normalization
    VOLUME_SATURATION: 50,             // RMS saturation point
    VOICE_BAND_MULTIPLIER: 1.5,        // Amplify voice band contribution
};

// ─────────────────────────────────────────────
// EXPONENTIAL SMOOTHING HELPER
// ─────────────────────────────────────────────
class ExponentialSmoother {
    constructor(alpha = 0.3) {
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

    get() {
        return this.value ?? 0;
    }

    reset() {
        this.value = null;
    }
}

// ─────────────────────────────────────────────
// AMBIENT NOISE CALIBRATOR
// ─────────────────────────────────────────────
class AmbientCalibrator {
    constructor(durationMs = CONFIG.CALIBRATION_DURATION_MS) {
        this.durationMs = durationMs;
        this.startTime = null;
        this.samples = [];
        this.isCalibrating = false;
        this.isComplete = false;
        this.baseline = {
            rms: 0,
            voiceBandRatio: 0,
            spectralFlatness: 1.0,
        };
    }

    start() {
        this.startTime = Date.now();
        this.isCalibrating = true;
        this.isComplete = false;
        this.samples = [];
    }

    addSample(rms, voiceBandRatio, spectralFlatness) {
        if (!this.isCalibrating) return;

        this.samples.push({ rms, voiceBandRatio, spectralFlatness });

        // Check if calibration time is up
        if (Date.now() - this.startTime >= this.durationMs) {
            this.finalize();
        }
    }

    finalize() {
        if (this.samples.length === 0) {
            this.isCalibrating = false;
            this.isComplete = true;
            return;
        }

        // Calculate baseline as average of all samples
        const n = this.samples.length;
        this.baseline.rms = this.samples.reduce((s, x) => s + x.rms, 0) / n;
        this.baseline.voiceBandRatio = this.samples.reduce((s, x) => s + x.voiceBandRatio, 0) / n;
        this.baseline.spectralFlatness = this.samples.reduce((s, x) => s + x.spectralFlatness, 0) / n;

        this.isCalibrating = false;
        this.isComplete = true;

        console.log('[AudioIntelligence] Calibration complete:', {
            baselineRMS: this.baseline.rms.toFixed(2),
            baselineVoiceBand: this.baseline.voiceBandRatio.toFixed(3),
            baselineFlatness: this.baseline.spectralFlatness.toFixed(3),
            samplesUsed: n,
        });
    }
}

// ─────────────────────────────────────────────
// MAIN SERVICE CLASS
// ─────────────────────────────────────────────
class AudioIntelligenceService {
    constructor() {
        // Core instances
        this.vad = null;
        this.audioCtx = null;
        this.analyser = null;
        this.stream = null;
        this.isInitialized = false;

        // Calibrator
        this.calibrator = new AmbientCalibrator();

        // Smoothers: one per score component
        this.smoothers = {
            speech: new ExponentialSmoother(CONFIG.SMOOTHING_ALPHA),
            nearField: new ExponentialSmoother(CONFIG.SMOOTHING_ALPHA),
            duration: new ExponentialSmoother(CONFIG.SMOOTHING_ALPHA),
            repetition: new ExponentialSmoother(CONFIG.SMOOTHING_ALPHA),
            lipSync: new ExponentialSmoother(CONFIG.SMOOTHING_ALPHA),
            final: new ExponentialSmoother(CONFIG.SMOOTHING_ALPHA),
        };

        // Raw state
        this.vadProbability = 0;
        this.currentScore = 0;
        this.speechDurationMs = 0;
        this.speechStartTime = null;

        // FFT metrics
        this.spectralFlatness = 1.0;
        this.voiceBandEnergyRatio = 0;
        this.volumeRMS = 0;

        // External data (from BehaviorMonitor)
        this.mouthOpenness = 0;
        this.mouthVelocity = 0;

        // Repetition tracking
        this.speechEvents = [];  // Timestamps of validated speech events

        // Flag debouncing
        this._lastFlagTime = 0;

        // Callbacks
        this.onScoreUpdate = null;
        this.onOrangeFlag = null;

        // Precomputed FFT bin range for voice band
        this._binSize = CONFIG.SAMPLE_RATE / CONFIG.FFT_SIZE;
        this._voiceStartBin = Math.floor(CONFIG.VOICE_BAND_LOW / this._binSize);
        this._voiceEndBin = Math.ceil(CONFIG.VOICE_BAND_HIGH / this._binSize);
    }

    // ─────────────────────────────────────────
    // LIFECYCLE
    // ─────────────────────────────────────────

    /**
     * Start the audio intelligence service.
     * @param {MediaStream} stream — Audio stream (getUserMedia)
     * @param {Function} onScoreUpdate — Called with { score, breakdown, isCalibrating }
     * @param {Function} onOrangeFlag — Called when score > threshold
     */
    async start(stream, onScoreUpdate, onOrangeFlag) {
        if (this.isInitialized) {
            console.warn('[AudioIntelligence] Already initialized — call stop() first');
            return;
        }

        this.stream = stream;
        this.onScoreUpdate = onScoreUpdate;
        this.onOrangeFlag = onOrangeFlag;

        try {
            // 1. Audio Context + Analyser (FFT)
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: CONFIG.SAMPLE_RATE,
            });
            const source = this.audioCtx.createMediaStreamSource(stream);
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = CONFIG.FFT_SIZE;
            this.analyser.smoothingTimeConstant = 0.4; // Some temporal smoothing on FFT
            source.connect(this.analyser);

            // 2. Start ambient calibration
            this.calibrator = new AmbientCalibrator();
            this.calibrator.start();

            // 3. Initialize Silero VAD
            this.vad = await MicVAD.new({
                startOnLoad: true,
                stream: stream,
                baseAssetPath: "/",          // Load .onnx and worklet from public root
                onnxWASMBasePath: "/",       // Load .wasm files from public root
                ortConfig: (ort) => {
                    ort.env.wasm.wasmPaths = "/"; // Configure ONNX Runtime to look in root
                    ort.env.wasm.numThreads = 1;  // Prevent threading issues in some envs
                },
                positiveSpeechThreshold: CONFIG.VAD_POSITIVE_THRESHOLD,
                minSpeechFrames: CONFIG.VAD_MIN_SPEECH_FRAMES,
                onFrameProcessed: (probs) => {
                    this.vadProbability = probs.isSpeech;
                    this._processFrame();
                },
                onSpeechStart: () => {
                    this.speechStartTime = Date.now();
                },
                onSpeechEnd: () => {
                    if (this.speechStartTime) {
                        const duration = Date.now() - this.speechStartTime;
                        if (duration > CONFIG.MIN_SPEECH_EVENT_MS) {
                            this._recordSpeechEvent();
                        }
                    }
                    this.speechStartTime = null;
                    this.speechDurationMs = 0;
                },
            });

            this.isInitialized = true;
            console.log('[AudioIntelligence] Service started — calibrating for 5s...');

        } catch (err) {
            console.error('[AudioIntelligence] Initialization failed:', err);
            throw err; // Let caller handle
        }
    }

    /**
     * Stop and clean up all resources.
     */
    stop() {
        console.log('[AudioIntelligence] Stopping...');

        // 1. Stop VAD
        if (this.vad) {
            try {
                this.vad.pause();
                this.vad.destroy?.();
            } catch (e) {
                console.warn('[AudioIntelligence] VAD cleanup warning:', e);
            }
            this.vad = null;
        }

        // 2. Close audio context
        if (this.audioCtx && this.audioCtx.state !== 'closed') {
            try {
                this.audioCtx.close();
            } catch (e) {
                console.warn('[AudioIntelligence] AudioContext cleanup warning:', e);
            }
        }
        this.audioCtx = null;
        this.analyser = null;

        // 3. Reset all state
        this._resetState();
        this.isInitialized = false;
    }

    _resetState() {
        this.vadProbability = 0;
        this.currentScore = 0;
        this.speechDurationMs = 0;
        this.speechStartTime = null;
        this.spectralFlatness = 1.0;
        this.voiceBandEnergyRatio = 0;
        this.volumeRMS = 0;
        this.mouthOpenness = 0;
        this.mouthVelocity = 0;
        this.speechEvents = [];
        this._lastFlagTime = 0;

        // Reset smoothers
        Object.values(this.smoothers).forEach(s => s.reset());
    }

    // ─────────────────────────────────────────
    // EXTERNAL DATA INPUT (from BehaviorMonitor)
    // ─────────────────────────────────────────

    /**
     * Called by BehaviorMonitor to provide lip movement data.
     * @param {number} openness — Mouth openness ratio (0.0–1.0)
     * @param {number} velocity — Rate of change of mouth opening
     */
    updateMouthData(openness, velocity) {
        this.mouthOpenness = openness || 0;
        this.mouthVelocity = velocity || 0;
    }

    // ─────────────────────────────────────────
    // FRAME PROCESSING (called per VAD frame)
    // ─────────────────────────────────────────

    _processFrame() {
        if (!this.analyser) return;

        // 1. Run FFT analysis
        this._computeFFTMetrics();

        // 2. During calibration, collect baseline samples
        if (this.calibrator.isCalibrating) {
            this.calibrator.addSample(
                this.volumeRMS,
                this.voiceBandEnergyRatio,
                this.spectralFlatness
            );

            // Notify UI we're still calibrating
            if (this.onScoreUpdate) {
                this.onScoreUpdate({
                    score: 0,
                    isCalibrating: true,
                    calibrationProgress: Math.min(1, (Date.now() - this.calibrator.startTime) / this.calibrator.durationMs),
                    breakdown: null,
                });
            }
            return;
        }

        // 3. Update speech duration
        if (this.speechStartTime) {
            this.speechDurationMs = Date.now() - this.speechStartTime;
        }

        // 4. Adaptive threshold: only calculate score if VAD above adaptive level
        const adaptiveThreshold = this.calibrator.isComplete
            ? Math.max(0.3, CONFIG.VAD_POSITIVE_THRESHOLD - CONFIG.CALIBRATION_MARGIN + this.calibrator.baseline.rms / CONFIG.VOLUME_SATURATION * 0.2)
            : CONFIG.VAD_POSITIVE_THRESHOLD;

        if (this.vadProbability > adaptiveThreshold * 0.8) {
            this._calculateConfidence();
        } else {
            // Below threshold — decay score smoothly toward 0
            this.currentScore = this.smoothers.final.update(0);
            if (this.onScoreUpdate) {
                this.onScoreUpdate({
                    score: this.currentScore,
                    isCalibrating: false,
                    breakdown: this._getBreakdown(0, 0, 0, 0, 0),
                });
            }
        }
    }

    // ─────────────────────────────────────────
    // FFT ANALYSIS
    // ─────────────────────────────────────────

    _computeFFTMetrics() {
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteFrequencyData(dataArray);

        // ── A. Volume RMS ──
        let sqSum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sqSum += dataArray[i] * dataArray[i];
        }
        this.volumeRMS = Math.sqrt(sqSum / bufferLength);

        // ── B. Voice Band Energy Ratio (300Hz–3400Hz) ──
        let voiceEnergy = 0;
        let totalEnergy = 0;
        for (let i = 0; i < bufferLength; i++) {
            totalEnergy += dataArray[i];
            if (i >= this._voiceStartBin && i <= this._voiceEndBin) {
                voiceEnergy += dataArray[i];
            }
        }
        this.voiceBandEnergyRatio = totalEnergy > 0 ? voiceEnergy / totalEnergy : 0;

        // ── C. Spectral Flatness (Geometric Mean / Arithmetic Mean) ──
        // SFM: 0 = pure tone (speech-like), 1 = white noise
        // Using log-domain for numerical stability
        let logSum = 0;
        let arithmeticSum = 0;
        let validBins = 0;

        for (let i = 1; i < bufferLength; i++) { // Skip DC bin
            const val = Math.max(dataArray[i], 1); // Avoid log(0)
            logSum += Math.log(val);
            arithmeticSum += val;
            validBins++;
        }

        if (validBins > 0 && arithmeticSum > 0) {
            const geometricMean = Math.exp(logSum / validBins);
            const arithmeticMean = arithmeticSum / validBins;
            this.spectralFlatness = Math.min(1, geometricMean / arithmeticMean);
        } else {
            this.spectralFlatness = 1.0;
        }
    }

    // ─────────────────────────────────────────
    // SCORING ENGINE
    // ─────────────────────────────────────────

    _calculateConfidence() {
        const baseline = this.calibrator.baseline;

        // ── 1. Speech Probability (40%) ──
        // Raw VAD output, smoothed
        const rawSpeech = this.vadProbability;
        const speechScore = this.smoothers.speech.update(rawSpeech);

        // ── 2. Near-Field Score (25%) ──
        // Combines: calibrated volume + voice band ratio + spectral flatness
        // Subtract baseline RMS to reduce false positives from ambient noise
        const calibratedRMS = Math.max(0, this.volumeRMS - (baseline.rms * 0.5));
        const volNorm = Math.min(1, calibratedRMS / CONFIG.VOLUME_SATURATION);

        // Voice band ratio above baseline
        const calibratedVoiceBand = Math.max(0, this.voiceBandEnergyRatio - (baseline.voiceBandRatio * 0.3));
        const bandNorm = Math.min(1, calibratedVoiceBand * CONFIG.VOICE_BAND_MULTIPLIER);

        // Low spectral flatness = speech-like signal (inverse: 1 - flatness)
        const flatnessScore = Math.min(1, Math.max(0, 1 - this.spectralFlatness));

        const rawNearField = (volNorm * 0.4) + (bandNorm * 0.35) + (flatnessScore * 0.25);
        const nearFieldScore = this.smoothers.nearField.update(rawNearField);

        // ── 3. Duration Score (15%) ──
        // Linear: 0 at 500ms, 1.0 at 4000ms sustained speech
        const rawDuration = Math.min(1, Math.max(0,
            (this.speechDurationMs - CONFIG.DURATION_MIN_MS) /
            (CONFIG.DURATION_MAX_MS - CONFIG.DURATION_MIN_MS)
        ));
        const durationScore = this.smoothers.duration.update(rawDuration);

        // ── 4. Repetition Score (10%) ──
        // Count speech events in rolling 10-minute window
        this._pruneSpeechEvents();
        const rawRepetition = Math.min(1, this.speechEvents.length / CONFIG.REPETITION_MAX_EVENTS);
        const repetitionScore = this.smoothers.repetition.update(rawRepetition);

        // ── 5. Lip Sync Score (10%) ──
        // High correlation: mouth moving + audio detected = speaking
        // Low correlation: audio detected + mouth closed = background/far
        let rawLipSync = 0;
        if (this.mouthVelocity > 0.05 || this.mouthOpenness > 0.3) {
            rawLipSync = 1.0; // Mouth is active — likely the student speaking
        } else if (this.vadProbability > 0.5 && this.mouthVelocity < 0.02) {
            rawLipSync = 0.0; // Audio but mouth closed — likely background speech
        } else {
            rawLipSync = 0.5; // Neutral / face not detected
        }
        const lipSyncScore = this.smoothers.lipSync.update(rawLipSync);

        // ── FINAL WEIGHTED SCORE ──
        const rawFinal =
            (CONFIG.WEIGHT_SPEECH * speechScore) +
            (CONFIG.WEIGHT_NEAR_FIELD * nearFieldScore) +
            (CONFIG.WEIGHT_LIP_SYNC * lipSyncScore) +
            (CONFIG.WEIGHT_DURATION * durationScore) +
            (CONFIG.WEIGHT_REPETITION * repetitionScore);

        this.currentScore = this.smoothers.final.update(rawFinal);

        // ── Notify UI ──
        const breakdown = this._getBreakdown(speechScore, nearFieldScore, lipSyncScore, durationScore, repetitionScore);

        if (this.onScoreUpdate) {
            this.onScoreUpdate({
                score: this.currentScore,
                isCalibrating: false,
                breakdown,
            });
        }

        // ── Check Flag Threshold ──
        if (this.currentScore > CONFIG.FLAG_THRESHOLD) {
            this._triggerOrangeFlag();
        }
    }

    _getBreakdown(speechScore, nearFieldScore, lipSyncScore, durationScore, repetitionScore) {
        return {
            speechScore,
            nearFieldScore,
            lipSyncScore,
            durationScore,
            repetitionScore,
            // Debug info
            rawVAD: this.vadProbability,
            volumeRMS: this.volumeRMS,
            voiceBandRatio: this.voiceBandEnergyRatio,
            spectralFlatness: this.spectralFlatness,
            speechDurationMs: this.speechDurationMs,
            speechEventCount: this.speechEvents.length,
            mouthOpenness: this.mouthOpenness,
            mouthVelocity: this.mouthVelocity,
            isCalibrated: this.calibrator.isComplete,
        };
    }

    // ─────────────────────────────────────────
    // SPEECH EVENT TRACKING
    // ─────────────────────────────────────────

    _recordSpeechEvent() {
        this.speechEvents.push(Date.now());
        console.log(`[AudioIntelligence] Speech event recorded (total in window: ${this.speechEvents.length})`);
    }

    _pruneSpeechEvents() {
        const cutoff = Date.now() - CONFIG.REPETITION_WINDOW_MS;
        this.speechEvents = this.speechEvents.filter(t => t > cutoff);
    }

    // ─────────────────────────────────────────
    // FLAG SYSTEM
    // ─────────────────────────────────────────

    _triggerOrangeFlag() {
        const now = Date.now();
        if (now - this._lastFlagTime < CONFIG.FLAG_DEBOUNCE_MS) return;

        this._lastFlagTime = now;

        if (this.onOrangeFlag) {
            this.onOrangeFlag({
                type: 'AUDIO_INTELLIGENCE',
                message: `Speech detected (Confidence: ${(this.currentScore * 100).toFixed(0)}%)`,
                severity: 'medium', // Orange
                score: this.currentScore,
                details: {
                    speechEvents: this.speechEvents.length,
                    durationMs: this.speechDurationMs,
                    calibrated: this.calibrator.isComplete,
                },
            });
        }
    }
}

// ─────────────────────────────────────────────
// SINGLETON EXPORT
// ─────────────────────────────────────────────
export const audioIntelligence = new AudioIntelligenceService();
export default audioIntelligence;
