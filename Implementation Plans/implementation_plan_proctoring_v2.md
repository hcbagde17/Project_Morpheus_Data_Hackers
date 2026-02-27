
# Implementation Plan: Proctoring Refinements & Admin Features

## Goal
Address user issues with Screen Recording permissions, missing AI loading UI, missing Object Detection, and add an Admin Override feature.

## 1. Electron Screen Recording Fix
*   **Problem**: `getDisplayMedia` fails in Electron without proper handling.
*   **Fix**:
    *   In `ProctoringService.js`: Detect if running in Electron.
    *   If Electron: Use `ipcRenderer` to ask Main process for `desktopCapturer` sources.
    *   Show a simple source selector dialog (or auto-select "Entire Screen").
    *   Use `chromeMediaSourceId` constraint in `getUserMedia` (not `getDisplayMedia`).

## 2. AI Model Loading UI
*   **Problem**: Loading is hidden in a small alert.
*   **Fix**:
    *   Update `PreTestCheck.jsx`:
        *   Add a new Step 0: "System Initialization".
        *   Show a large progress spinner/status while `loadAIModels()` runs.
        *   Only advance to "Identity & Camera" once models are ready.

## 3. Object Detection (Phones/Earbuds)
*   **Problem**: Missing feature.
*   **Fix**:
    *   Install `@tensorflow/tfjs` and `@tensorflow-models/coco-ssd`.
    *   Create `src/components/proctoring/ObjectDetection.jsx`.
    *   Load `coco-ssd` model.
    *   Run detection loop on the camera stream.
    *   Flag 'cell phone' or 'person' (if multiple) instances.

## 4. Admin Override
*   **Problem**: Admins need to bypass checks during exams.
*   **Fix**:
    *   In `ExamSession.jsx`:
        *   Listen for `Ctrl + Shift + A`.
        *   Open a Dialog asking for Admin Password (or just check `user.role` if logged in, but usually students are logged in. User asked for "using admin credentials").
        *   Since the *student* is logged in, we need a credential check (e.g., simple PIN or API verify).
        *   **Dialog Controls**: Toggles for "Disable Camera Check", "Disable Screen Share", "Disable AI", "Enable Object Detection", "Force Submit".
        *   Apply these overrides to the active session state.

## Proposed Changes

### Dependencies
*   `npm install @tensorflow/tfjs @tensorflow-models/coco-ssd`

### Files
#### [MODIFY] [PreTestCheck.jsx](file:///c:/Users/gandh/Desktop/Krish/ACM/PW%203.0/src/components/PreTestCheck.jsx)
*   Add "Initializing" step.

#### [MODIFY] [ProctoringService.js](file:///c:/Users/gandh/Desktop/Krish/ACM/PW%203.0/src/lib/proctoringService.js)
*   Add Electron-specific screen capture logic.

#### [NEW] [ObjectDetection.jsx](file:///c:/Users/gandh/Desktop/Krish/ACM/PW%203.0/src/components/proctoring/ObjectDetection.jsx)
*   Implement COCO-SSD detection.

#### [MODIFY] [ExamSession.jsx](file:///c:/Users/gandh/Desktop/Krish/ACM/PW%203.0/src/pages/ExamSession.jsx)
*   Add Admin Override Shortcut & Dialog.
