# Implementation Plan: Audio Intelligence System (Phase 1)

**Goal**: Detect probable human speech with minimal false positives, running offline in the browser.

## 1. Technical Architecture

### Core Components
1.  **Audio Capture**: 16kHz mono stream from `navigator.mediaDevices.getUserMedia`.
2.  **VAD Engine**: `@ricky0123/vad-web` (WebRTC VAD wrapper) for lightweight, CPU-friendly voice activity detection.
    *   *Why?* Proven, lightweight (~20KB WASM), low CPU usage compared to full NN models, fits "Phase 1" constraints perfectly.
3.  **Audio Processor (`AudioIntelligenceService`)**:
    *   **VAD**: Detects speech segments.
    *   **Spectral Analysis**: FFT for frequency verification (human voice range 300Hz-3400Hz).
    *   **Volume/RMS**: For "Near/Far" estimation heuristic.
4.  **Lip Sync Fusion**:
    *   Connects `BehaviorMonitor` (visual mouth opening) with `AudioIntelligenceService` (audio activity).
    *   Logic: `Speech Detected + Mouth Closed = Background/Far`.
5.  **Scoring System**:
    *   Basic weighted score based on duration, volume, and lip sync.

## 2. Dependencies to Add
- `@ricky0123/vad-web`: For robust VAD.
- `onnxruntime-web`: (Already installed) - could be used for Silero later if WebRTC VAD is insufficient.

## 3. Implementation Steps

### Step 1: Core Audio Pipeline & VAD
- [ ] Install `@ricky0123/vad-web`.
- [ ] Create `src/lib/audioIntelligence.js` service.
    - Initialize VAD.
    - Handle audio stream processing.
    - Emit `SPEECH_START` and `SPEECH_END` events.

### Step 2: Audio Analysis (Near/Far Field)
- [ ] Implement FFT analysis in `audioIntelligence.js`.
    - Extract RMS (Root Mean Square) for volume.
    - Extract "Voice Band Energy" (300-3400Hz).
    - Heuristic: High Volume + High Voice Band % = "Near".

### Step 3: Lip Sync Data Exchange
- [ ] Modify `BehaviorMonitor.jsx` to expose `mouthOpenness` value via a callback or shared store (`useProctorStore`).
- [ ] Update `examSession.jsx` to pass this data to `AudioMonitor` (or merge them).
- *Alternative*: Create a `ProctorContext` to share state between monitors without prop drilling.

## 4. Models & Algorithms Specification

Each component uses distinct models for robust, low-CPU operation.

### A. Speech Probability Model (40%)
*   **Model**: **Silero VAD v4** (via `@ricky0123/vad-web`).
*   **Performance**: Highly optimized ONNX model running in browser via WebAssembly (WASM).
*   **Process**:
    1.  Receives 32ms audio chunks @ 16kHz.
    2.  Outputs a probability score `p` (0.0 to 1.0) indicating "human speech".
    3.  **Output**: `speech_probability = p` (smoothed over 3 chunks).

### B. Near-Field Estimation Model (25%)
*   **Type**: **Digital Signal Processing (DSP) Heuristic Model**.
*   **Algorithm**: Frequency Domain Analysis (Fast Fourier Transform).
*   **Logic**:
    1.  Convert time-domain audio to frequency domain (FFT).
    2.  Calculate **Spectral Flatness Measure (SFM)**: Speech is "peaky" (low flatness), Noise is "flat" (high flatness).
    3.  Calculate **Voice Band Energy Ratio**: Energy in 300Hz-3400Hz vs Total Energy.
    4.  Calculate **Volume Stability**: Coefficient of variation of RMS amplitude.
*   **Output**: `near_field_score` = Normalized combination of Low SFM + Medium-High Volume + High Voice Band Ratio.

### C. Lip Sync / Visual Correlation Model (10%)
*   **Model**: **Face-API.js Landmark Detection** (Tiny Face Detector + 68-Point Landmark Model).
*   **Metrics**:
    *   **Mouth Aspect Ratio (MAR)**: Vertical distance between inner lips / Horizontal width.
    *   **Vertical Velocity**: Rate of change of MAR (speech involves rapid opening/closing).
*   **Fusion Logic**:
    *   If Audio VAD > 0.5 AND Mouth Velocity > Threshold: High Sync (Score = 1.0).
    *   If Audio VAD > 0.5 AND Mouth Static (Velocity ~ 0): Low Sync / Ventriloquism / Background Speech (Score = 0.0).
*   **Output**: `lip_sync_score` (0.0 to 1.0).

### D. Duration Model (15%)
*   **Type**: **Statistical Accumulator**.
*   **Logic**:
    *   Sustained speech is more suspicious than short bursts (coughing/clearing throat).
    *   `duration_score` increases linearly from 0.0 at 0.5s to 1.0 at 4.0s.
    *   Formula: `min(1.0, (current_speech_duration_ms - 500) / 3500)`

### E. Repetition Model (20%) - Adjusted User Weight
*   **Type**: **Event Frequency Counter**.
*   **Logic**:
    1.  Track distinct "Speech Events" (VAD > 0.5 for > 1s) in a rolling 10-minute window.
    2.  Count `N`.
    3.  `repeat_score` = `min(1.0, N / 5)` (Max score at 5 events).

## 5. Final Confidence Formula
The system calculates the final threat score every 500ms during active speech:

```javascript
// User Defined Weights
final_confidence =
    (0.40 * speech_probability) +
    (0.25 * near_field_score) +
    (0.10 * lip_sync_score) +  // Low weight to avoid false negatives if face undetected
    (0.15 * duration_score) +
    (0.10 * repeat_score);
```

**Threshold**: If `final_confidence > 0.65` (configurable), trigger **ORANGE FLAG**.

## 6. Implementation Steps

### Step 1: Install Dependencies
- [ ] Install `@ricky0123/vad-web` for Silero VAD.
- [ ] Verify `onnxruntime-web` version compatibility.

### Step 2: Create AudioIntelligence Service
- [ ] Implement `src/lib/audioIntelligence.js`.
- [ ] Initialize Silero VAD with `onSpeechStart` / `onSpeechEnd`.
- [ ] Implement FFT Analyzer for Near-Field estimation.

### Step 3: Implement Scoring Engine
- [ ] Create `calculateConfidence()` function using the exact formula above.
- [ ] Implement Rolling Window for Repetition Score.

### Step 4: Integrate with BehaviorMonitor
- [ ] Export `mouthVelocity` and `mouthOpenness` from `BehaviorMonitor.jsx`.
- [ ] Pass visual metrics to `AudioIntelligenceService`.

### Step 5: Visualization & UI
- [ ] Create `AudioIntelligenceDebug.jsx` (hidden or admin-only) to visualize:
    - VAD Probability (Graph)
    - Near Field Score (Bar)
    - Final Confidence (Gauge)
