# Technical Architecture: ProctorWatch Intelligence Layer

## 1. AI & Machine Learning Modules (Renderer Process)

The frontend utilizes lightweight, browser-optimized WASM/WebGL models to perform real-time inference without requiring heavy backend GPU resources.

### A. Vision Behavior Intelligence (`VisionBehaviorMonitor.jsx`)
*   **Model**: **MediaPipe FaceMesh** (TensorFlow.js / WASM)
*   **Key Landmarks**: 478 3D facial landmarks.
*   **Implementation**:
    *   **Gaze Tracking**: Vectors calculated from Iris (Left/Right) relative to Eye corners and Head Pose.
    *   **Head Pose**: Solved using `SolvePnP` (Perspective-n-Point) logic on Nose/Chin/Ear coords.
    *   **Lip Activity**: Vertical separation distance between upper/lower lip landmarks normalized by face height.
*   **Threat Model**:
    *   **False Positive**: Poor lighting can cause landmark jitter (shaking head). Glasses with heavy reflection can block iris tracking (Gaze Away).
    *   **False Negative**: "Statue Stare" (user freezes video feed via software). Can be mitigated by checking for *micro-movements*.

### B. Audio Intelligence (`AudioIntelligence.jsx`)
*   **Model**: **Silero VAD** (Voice Activity Detector) via ONNX Runtime Web.
*   **APIs**: **Web Audio API** (AudioContext, AnalyserNode).
*   **Implementation**:
    *   **VAD**: Returns probability (0-1) of human speech in 30ms chunks.
    *   **Spectral Analysis** (FFT): `getByteFrequencyData` analyzes 20Hz-20kHz spectrum to distinguish "Speech-like" harmonic patterns vs "Broadband" noise (e.g., fan, typing).
*   **Threat Model**:
    *   **False Positive**: Loud mechanical keyboard switches (Blue/Green) can trigger VAD spikes. Background TV/Conversation.
    *   **False Negative**: Whispering *below* the noise floor (-60dB). High-quality directional microphones used by cheaters to whisper away from the mic.

### C. Object Detection (`ObjectDetection.jsx`)
*   **Model**: **Coco-SSD** (MobileNet v2 base) via TensorFlow.js.
*   **Classes**: Detects 80 classes, filtered for: `cell phone`, `book`, `laptop`, `person`.
*   **Implementation**:
    *   Runs inference every 500-1000ms on a downsampled video frame (320x240).
*   **Threat Model**:
    *   **False Positive**: Calculateor or wallet identified as `cell phone`.
    *   **False Negative**: Small objects hidden in palms. Objects below the camera's field of view.

---

## 2. System Enforcement & Native APIs (Main Process)

The backend utilizes **Electron's Main Process** with **Administrator Privileges** to access low-level OS functions via FFI (Foreign Function Interface) and System Libraries.

### A. Process & App Control (`EnforcementService.js`)
*   **Library**: **koffi** (C-FFI for Node.js) loading `kernel32.dll`.
*   **APIs**:
    *   `CreateToolhelp32Snapshot` / `Process32Next`: Enumerates running processes.
    *   `OpenProcess` / `TerminateProcess`: Forcefully kills blacklisted PIDs.
*   **Logic**: Polling loop (2000ms) checks against a blacklist (`AnyDesk`, `SnippingTool`, `ChatGPT`).
*   **Threat Model**:
    *   **Failure**: Renamed executables (e.g., renaming `anydesk.exe` to `svchost_fake.exe`). Mitigated by checking *Process Description* or *Signature* (Phase 2 feature).

### B. Input & Window Control (`EnforcementService.js`)
*   **Library**: **koffi** loading `user32.dll`.
*   **APIs**:
    *   `SetWindowsHookEx` (`WH_KEYBOARD_LL`): Intercepts `Alt+Tab`, `Win+D`, `PrtSc`.
    *   `SetForegroundWindow` / `SetWindowPos`: Forces `HWND_TOPMOST`.
    *   `EmptyClipboard`: Clears clipboard content.
*   **Threat Model**:
    *   **Failure**: Kernel-level cheats (Ring 0) can bypass User-mode hooks. Virtual Machines can trap input before it reaches the OS hook.

### C. Network & Environment Analysis (`SystemMonitor.js`)
*   **Library**: **systeminformation** (npm).
*   **Implementation**:
    *   **Network**: Scans interfaces (`si.networkInterfaces()`) for `Tun`, `Tap`, `Pptp` (VPN/Proxy indicators).
    *   **Stats**: Correlates `currentLoad.currentLoad` (CPU spikes) with Network RX/TX spikes.
*   **Threat Model**:
    *   **False Positive**: legitimate Windows Background Updates causing network spikes.
    *   **False Negative**: 4G/5G Hotspot usage (undetectable on the local interface if proxied externally via Router).

---

## 3. Summary of Failure Modes

| Module | Primary Failure Risk | Mitigation Strategy |
| :--- | :--- | :--- |
| **Vision** | **Occlusion/Lighting** | Require "Pre-Test Environment Check" to validate lighting. |
| **Audio** | **Background Noise** | Use Noise Suppression (WebAudio) + Sensitivity thresholding. |
| **Enforcement** | **Kernel Bypass** | Detect "Test Mode" signing or VM presence (`VM_DETECTED`). |
| **Identity** | **Deepfakes** | Phase 2: Implement "Liveness Detection" (Screen flash colors). |
