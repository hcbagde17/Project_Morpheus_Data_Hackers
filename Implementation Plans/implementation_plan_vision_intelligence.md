# Implementation Plan: Vision Behavior Intelligence (Phase 1)

**Goal**: Detect suspicious visual behavior (Looking Away, Peeping, Lip Motion) with minimal false positives using MediaPipe FaceMesh.

## 1. Technical Architecture & Models

### Core Components
1.  **Vision Engine**: **MediaPipe FaceMesh** (via `@mediapipe/tasks-vision`)
    *   **Model**: `face_landmarker.task` (Standard or Heavy for better accuracy).
    *   **Features**: 478 landmarks (including IRIS tracking), blendshapes for facial expressions.
    *   **Pros**: CPU-optimized, extremely precise Iris tracking compared to 68-point models.
2.  **Vision Service (`VisionIntelligenceService`)**:
    *   Singleton service managing the FaceMesh graph.
    *   Runs at controlled FPS (5-10) to save CPU.
3.  **Heuristic Analyzers**:
    *   **Head Pose**: Solved via PnP (Perspective-n-Point) on 3D landmarks or simpler geometric heuristic.
    *   **Gaze Vector**: Iris center relative to Eye corners/bounding box.
    *   **Mouth Motion**: Vertical lip distance variance over time.
4.  **Temporal Logic Engine**:
    *   Smoothing buffers (moving average).
    *   Duration tracking (sustained deviation).
    *   Repetition counter (glance frequency).

## 2. Dependencies to Add
- `@mediapipe/tasks-vision`: For FaceLandmarker with Iris tracking.
- (Existing `face-api.js` can be phased out or kept as fallback).

## 3. Models & Algorithms Specification

### A. Face & Landmark Detection (Foundation)
*   **Model**: **MediaPipe FaceLandmarker**.
*   **Input**: Video Frame (via canvas/video element).
*   **Output**:
    *   `faceLandmarks`: 478 x (x, y, z) coordinates.
    *   `faceBlendshapes`: 52 x facial expressions (e.g., `mouthOpen`, `eyeLookInLeft`).

### B. Head Pose Estimation (25% Weight)
*   **Algorithm**: **Geometric Solver** or **PnP**.
*   **Logic**:
    1.  Select key landmarks: Nose tip (1), Chin (152), Left Eye Outer (33), Right Eye Outer (263), Mouth Left (61), Mouth Right (291).
    2.  Map 3D landmarks to canonical 3D face model.
    3.  Compute Rotation Matrix -> Euler Angles (Yaw, Pitch, Roll).
*   **Scoring**:
    *   `yaw > 25°` (Side) OR `pitch < -20°` (Down) -> High Pose Score (1.0).
    *   Else -> Low Score (0.0).

### C. Eye Gaze Estimation (35% Weight)
*   **Algorithm**: **Iris-to-Eye-Corner Vector**.
*   **Logic**:
    1.  Extract landmarks for Eye Contour (Left/Right) and Iris Center.
    2.  Calculate horizontal ratio (`iris_x` relative to `inner_corner_x` vs `outer_corner_x`).
    3.  Calculate vertical ratio (for looking down/up).
*   **Scoring**:
    *   If `horizontal_ratio < 0.2` (Looking Left) OR `> 0.8` (Looking Right) -> Gaze Away (1.0).
    *   If `vertical_ratio > 0.8` (Looking Down/Peeping) -> Gaze Down (1.0).
    *   Else -> 0.0.

### D. Lip Activity Model (10% Weight)
*   **Metric**: **Mouth Aspect Ratio (MAR)** Variance.
*   **Logic**:
    *   Calculate MAR (Height / Width) for current frame.
    *   Track variance over rolling 1 second window.
    *   High variance = Talking.
*   **Score**: 1.0 (Talking) or 0.0 (Static).

### E. Duration & Repetition Models (15% + 15% Weights)
*   **Duration**: Time continuously in "suspicious state" (Pose AND/OR Gaze).
    *   `score = min(1.0, (duration_ms - 1000) / 4000)`. (0 at 1s, 1 at 5s).
*   **Repetition**: Count of suspicious events in rolling 5 mins.
    *   `score = min(1.0, count / 5)`.

## 4. Final Confidence Formula

```javascript
// Weights defined in Master Spec
final_score =
    (0.35 * gaze_away_score) +
    (0.25 * head_pose_score) +
    (0.15 * duration_score) +
    (0.15 * repetition_score) +
    (0.10 * lip_activity_score);

// Threshold logic
if (final_score > 0.60) -> TRIGGER ORANGE FLAG
```

## 5. Implementation Steps

### Step 1: Core Setup
- [ ] Install `@mediapipe/tasks-vision`.
- [ ] Create `VisionIntelligenceService.js` (Singleton).
- [ ] Initialize `FaceLandmarker` with appropriate delegate (CPU/GPU).

### Step 2: Metric Extraction
- [ ] Implement `calculateHeadPose(landmarks)`.
- [ ] Implement `calculateGaze(landmarks)`.
- [ ] Implement `calculateLipActivity(landmarks)`.

### Step 3: Scoring Logic
- [ ] Implement Temporal Smoothing (Exponential Moving Average).
- [ ] Implement Duration/Repetition Counters.
- [ ] Implement Final Score Formula.

### Step 4: UI & Integration
- [ ] Create `VisionBehaviorMonitor.jsx` (New component).
- [ ] Visual Debug Overlay: Draw Head Axis + Gaze Vectors on canvas.
- [ ] Integrate into `ExamSession` (replace old monitors or run alongside).

### Step 5: Evidence Capture
- [ ] On Flag: Trigger 10s recording.
- [ ] Store metadata: `yaw`, `pitch`, `gaze_vector`, `score_breakdown`.

## 6. Calibration (Phase 1)
- **Angles**: Yaw +/- 25 degrees, Pitch -20 degrees (down).
- **Time**: Ignore < 1.0s. Warn > 3.0s.
