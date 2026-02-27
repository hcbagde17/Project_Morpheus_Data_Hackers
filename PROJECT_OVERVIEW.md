# ProctorWatch 3.0 - Project Directory Structure

```
PW 3.0/
├── .git/
├── .gitignore
├── db_cleanup.sql
├── db_refactor_questions.sql
├── index.html
├── package-lock.json
├── package.json
├── PROJECT_OVERVIEW.md
├── tsconfig.json
├── vite.config.js
├── docs/
│   ├── Implementation Plans/
│   │   ├── implementation_plan_admin_override.md
│   │   ├── implementation_plan_admin_privileges.md
│   │   ├── implementation_plan_aggressive_blocking.md
│   │   ├── implementation_plan_configurable_blacklist.md
│   │   ├── implementation_plan_exam_enforcement.md
│   │   ├── implementation_plan_face_update.md
│   │   ├── implementation_plan_network_monitoring.md
│   │   ├── master_reimplementation_plan.md
│   │   └── README.md
├── electron/
│   ├── main.cjs
│   ├── preload.cjs
│   └── services/
│       ├── EnforcementService.cjs
│       ├── EnforcementService.js
│       ├── SystemMonitor.cjs
│       ├── SystemMonitor.js
│       ├── windows-api.cjs
│       └── windows-api.js
├── public/
│   ├── vite.svg
│   ├── libs/
│   │   └── vad.worklet.bundle.min.js
│   └── models/
│       ├── ort-wasm-simd-threaded.asyncify.wasm
│       ├── ort-wasm-simd-threaded.jsep.wasm
│       ├── ort-wasm-simd-threaded.jspi.wasm
│       ├── ort-wasm-simd-threaded.wasm
│       ├── silero_vad_legacy.onnx
│       ├── silero_vad_v5.onnx
│       └── face-api/
│           ├── face_landmark_68_model-shard1
│           ├── face_landmark_68_model-weights_manifest.json
│           ├── face_recognition_model-shard1
│           ├── face_recognition_model-shard2
│           ├── face_recognition_model-weights_manifest.json
│           ├── ssd_mobilenetv1_model-shard1
│           ├── ssd_mobilenetv1_model-shard2
│           └── ssd_mobilenetv1_model-weights_manifest.json
├── scripts/
│   └── download_models.cjs
├── src/
│   ├── App.jsx
│   ├── counter.ts
│   ├── main.jsx
│   ├── main.ts
│   ├── style.css
│   ├── theme.js
│   ├── typescript.svg
│   ├── components/
│   │   ├── AdminAuthDialog.jsx
│   │   ├── AdminBlacklistManager.jsx
│   │   ├── AdminOverridePanel.jsx
│   │   ├── DashboardLayout.jsx
│   │   ├── MermaidDiagram.jsx
│   │   ├── PreTestCheck.jsx
│   │   ├── ProtectedRoute.jsx
│   │   ├── QuestionBankModal.jsx
│   │   ├── RichTextEditor.jsx
│   │   └── proctoring/
│   │       ├── AudioIntelligence.jsx
│   │       ├── AudioMonitor.jsx
│   │       ├── BehaviorMonitor.jsx
│   │       ├── DeviceMonitor.jsx
│   │       ├── IdentityMonitor.jsx
│   │       ├── NetworkMonitor.jsx
│   │       ├── ObjectDetection.jsx
│   │       └── VisionBehaviorMonitor.jsx
│   ├── lib/
│   │   ├── aiModelLoader.js
│   │   ├── audioIntelligence.js
│   │   ├── evidenceCapture.js
│   │   ├── faceProcessing.js
│   │   ├── proctoringService.js
│   │   ├── supabase.js
│   │   └── visionIntelligence.js
│   ├── pages/
│   │   ├── CourseManagement.jsx
│   │   ├── DashboardRouter.jsx
│   │   ├── ExamSession.jsx
│   │   ├── FaceRegistration.jsx
│   │   ├── FirstLoginPage.jsx
│   │   ├── FlagReview.jsx
│   │   ├── LiveSessionMonitor.jsx
│   │   ├── LoginPage.jsx
│   │   ├── ProfileSettings.jsx
│   │   ├── PWTestSession.jsx
│   │   ├── Reports.jsx
│   │   ├── StudentCalendar.jsx
│   │   ├── StudentPerformance.jsx
│   │   ├── StudentTestResult.jsx
│   │   ├── TestCreation.jsx
│   │   ├── TestList.jsx
│   │   ├── TestResults.jsx
│   │   ├── UserManagement.jsx
│   │   └── dashboards/
│   │       ├── AdminDashboard.jsx
│   │       ├── ParentDashboard.jsx
│   │       ├── StudentDashboard.jsx
│   │       ├── TeacherDashboard.jsx
│   │       └── TechnicalDashboard.jsx
│   └── store/
│       └── authStore.js
└── supabase/
    ├── config.toml
    ├── fix_rls.sql
    ├── migration_testing.sql
    ├── schema.sql
    ├── storage.sql
    └── functions/
        ├── grade-exam/
        │   └── index.ts
        ├── send-notification/
        │   └── index.ts
        └── test-statistics/
            └── index.ts
```

## Detailed Electron Folder Documentation

### 1. `electron/main.cjs`
**Entry Point & Orchestrator**
- **Purpose**: Bootstraps the Electron application, creates the browser window, enforces security (CSP), and manages IPC communication between the Renderer and Node.js services.
- **Dependencies**:
  - `electron` (app, BrowserWindow, ipcMain)
  - `electron-updater` (autoUpdater)
  - `path`
  - `./services/EnforcementService.cjs`
  - `./services/SystemMonitor.cjs`
  - `./services/windows-api.cjs` (for ShellExecuteA)
- **Imported By**:
  - `package.json` (defined as `"main"`)
- **Key Functions & IPC Handlers**:
  - `createWindow()`: Sets up the main window with `preload.cjs` and secure `webPreferences`.
  - `check-admin-status`: Checks if app has admin privileges via `net session`.
  - `restart-as-admin`: Relaunches the app with "runas" verb using `ShellExecuteA`.
  - `proctoring:start-enforcement`: Initializes and starts `EnforcementService`.
  - `proctoring:pre-exam-kill`: Triggers `EnforcementService.preExamKill()`.
  - `get-system-info`: Returns OS CPU/RAM details (used by `TechnicalDashboard.jsx`).
  - `get-screen-sources`: Returns desktop/window sources for capture.

### 2. `electron/preload.cjs`
**Secure Context Bridge**
- **Purpose**: Exposes specific, safe methods to the Renderer process (`window.electronAPI`) without enabling full `nodeIntegration`.
- **Dependencies**: `electron` (contextBridge, ipcRenderer)
- **Imported By**: `electron/main.cjs` (loaded via `webPreferences`)
- **Exposed API (`window.electronAPI`) Usage**:
  - **`src/components/PreTestCheck.jsx`**: Uses `checkAdminStatus`, `restartAsAdmin`, `preExamKill`.
  - **`src/components/AdminBlacklistManager.jsx`**: Uses `getDefaultBlacklist`, `setWhitelist`, `addToBlacklist`.
  - **`src/pages/ExamSession.jsx`**: Uses `startEnforcement`, `stopEnforcement`, `startNetworkMonitor`, `onViolation`.
  - **`src/pages/dashboards/TechnicalDashboard.jsx`**: Uses `getSystemInfo`.
  - **`src/components/proctoring/NetworkMonitor.jsx`**: Uses `startNetworkMonitor`, `onNetworkRiskUpdate`.

### 3. `electron/services/EnforcementService.cjs`
**Security Enforcer**
- **Purpose**: Active proctoring enforcement. Manages blacklisted processes, monitors clipboard, enforces window focus, and hooks keyboard events to block shortcuts (Alt+Tab, etc.).
- **Dependencies**:
  - `./windows-api.cjs` (Native hooks)
  - `systeminformation` (Process scanning)
  - `koffi` (Callback registration)
  - `child_process` (Taskkill)
- **Imported By**: `electron/main.cjs`
- **Key Functions**:
  - `start()`/`stop()`: Manages detection intervals and keyboard hooks.
  - `preExamKill()`: Scans and forcibly terminates blacklisted apps before exam.
  - `startKeyboardHook()`: Installs low-level keyboard hook to block Windows keys, Alt+Tab, etc.
  - `clearClipboard()`: Periodically clears system clipboard.
  - `getDefaultBlacklistByCategory()`: Returns static list of forbidden apps.

### 4. `electron/services/SystemMonitor.cjs`
**Passive Integrity Monitor**
- **Purpose**: Monitors system resources, network traffic, and background processes to calculate a generic risk score.
- **Dependencies**: `systeminformation`
- **Imported By**: `electron/main.cjs`
- **Key Functions**:
  - `start()`: Begins monitoring loop (5s interval).
  - `calculateRisk()`: Internal logic to aggregate process/network risks.

### 5. `electron/services/windows-api.cjs`
**Native Win32 Bindings**
- **Purpose**: Provides direct access to Windows API functions (User32, Kernel32, Shell32) for low-level control not available in Node.js.
- **Dependencies**: `koffi` (FFI library)
- **Imported By**:
  - `electron/services/EnforcementService.cjs` (Hooks, Clipboard, Window management)
  - `electron/main.cjs` (ShellExecute for Admin restart)
- **Exposed Functions**:
  - `SetWindowsHookExA`, `UnhookWindowsHookEx` (Keyboard hooks)
  - `ShellExecuteA` (UAC Elevation)
  - `GetForegroundWindow`, `SetWindowPos` (Focus enforcement)
  - `OpenClipboard`, `EmptyClipboard` (Clipboard control)

## Detailed Supabase Folder Documentation

### 1. `supabase/schema.sql`
**Core Database Definition**
- **Purpose**: Defines the entire relational database structure, including tables, relationships, indexes, and Row Level Security (RLS) policies.
- **Models/Tables defined**:
  - `users`: Stores user credentials and roles (student, teacher, admin).
  - `tests`, `questions`, `exam_sessions`, `answers`: Core exam logic.
  - `flags`, `telemetry`: Proctoring data and evidence.
  - `institutions`, `courses`, `enrollments`: Academic hierarchy.
- **Usage**: executed in Supabase SQL Editor to initialize the project.

### 2. `supabase/storage.sql`
**Storage Configuration**
- **Purpose**: Configures Supabase Storage buckets and security policies for file uploads.
- **Buckets defined**:
  - `profile-photos`: Publicly readable, for user avatars.
  - `evidence-videos`: Restricted access, for proctoring violation clips.
- **Usage**: executed in Supabase SQL Editor to set up storage.

### 3. `supabase/functions/` (Edge Functions)
**Serverless Backend Logic**
*(Note: These functions are deployed to Supabase Edge Runtime but are currently **not actively called** by the frontend application, which relies on direct Supabase client calls.)*

- **`grade-exam/index.ts`**
  - **Purpose**: Calculates the final score for a submitted exam session by comparing user answers against correct answers in the database.
  - **Logic**: fetches `questions` and `answers`, computes score (handling negative marking), and updates `exam_sessions`.

- **`test-statistics/index.ts`**
  - **Purpose**: Aggregates performance data for a specific test.
  - **Logic**: Calculates average/min/max scores, counts flags, and computes question-level accuracy percentages.

- **`send-notification/index.ts`**
  - **Purpose**: Intended for sending email or push notifications.
  - **Logic**: Currently logs the notification payload; intended to integrate with providers like SendGrid.

### 4. `supabase/fix_rls.sql` & `supabase/migration_testing.sql`
**Utility/Migration Scripts**
- **Purpose**: Helper scripts for updating the database state during development.
- **Details**:
  - `fix_rls.sql`: Patches RLS policies to allow 'public' access for certain tables/buckets, necessary when using custom auth schemes or simplified development modes.
  - `migration_testing.sql`: Seeds default admin/technical users and updates table schemas (e.g., adding `full_name` to `users`, `details` to `flags`) to match recent app changes.

## Detailed Public Folder Documentation

### 1. `public/` (Root Files)
**Static Assets & Web Assembly Binaries**
- **`vite.svg`**
  - **Purpose**: Application logo/favicon.
  - **Imported By**: `index.html` (`<link rel="icon" ...>`).

- **`vad.worklet.bundle.min.js`**
  - **Purpose**: Audio Worklet processor for Silero VAD (Voice Activity Detection). Runs in a separate thread to process audio streams efficiently.
  - **Used By**: `src/lib/audioIntelligence.js` (loaded via `@ricky0123/vad-web`).

- **`silero_vad_legacy.onnx` & `silero_vad_v5.onnx`**
  - **Purpose**: Pre-trained ONNX models for Voice Activity Detection.
  - **Used By**: `src/lib/audioIntelligence.js` (detects human speech segments).

- **`ort-wasm-simd-threaded.*.wasm`**
  - **Purpose**: WebAssembly binaries for **ONNX Runtime Web**. Enables running AI models (like Silero VAD) directly in the browser with SIMD acceleration and multi-threading.
  - **Used By**: `src/lib/audioIntelligence.js` (configured via `onnxWASMBasePath`).

### 2. `public/models/face-api/`
**Face Recognition Model Weights**
- **Purpose**: Sharded binary weight files and manifests for `face-api.js`.
- **Files**:
  - `ssd_mobilenetv1_model-*`: Face detection (lightweight/fast).
  - `face_landmark_68_model-*`: 68-point facial landmark detection (eyes, nose, mouth).
  - `face_recognition_model-*`: Face descriptor extraction (128-dim embeddings).
- **Used By**: `src/lib/aiModelLoader.js` (loaded via `faceapi.nets.*.loadFromUri('/models/face-api')`).

### 3. `public/libs/`
**External Libraries**
- **`opencv.js`**
  - **Purpose**: OpenCV (Open Source Computer Vision Library) compiled to WebAssembly.
  - **Status**: **Currently Unused**. The project relies on `face-api.js` (TensorFlow.js based) and `ONNX Runtime` for computer vision tasks. `src/lib/aiModelLoader.js` contains a no-op `loadOpenCV` function.

## Detailed Proctoring Components Documentation (`src/components/proctoring/`)

### 1. `VisionBehaviorMonitor.jsx` (Active)
**Visual Intrusion & Behavioral Analysis**
- **Purpose**: Real-time analysis of user behavior via webcam. Detects gaze direction, head pose, and lip movements to identify suspicious activity (looking away, talking).
- **Models/APIs**: Uses `src/lib/visionIntelligence.js` (MediaPipe/Face-API).
- **Key Features**:
  - Displays suspicion score with color-coded risk levels.
  - Mini-camera preview (mirrored).
  - Breakdown of scores: Gaze, Pose, Duration, Repetition, Lip Sync.
- **Imported By**: `src/pages/ExamSession.jsx`, `src/pages/PWTestSession.jsx`.

### 2. `AudioIntelligence.jsx` (Active)
**Audio Environment Analysis**
- **Purpose**: Monitors audio environment for speech and anomalies.
- **Models/APIs**: Uses `src/lib/audioIntelligence.js` (Silero VAD via ONNX Runtime).
- **Key Features**:
  - Calibrates to ambient noise levels.
  - Detects speech confidence, duration, and meaningful speech events.
  - Syncs with visual lip-movement data for correlation.
- **Imported By**: `src/pages/ExamSession.jsx`, `src/pages/PWTestSession.jsx`.

### 3. `IdentityMonitor.jsx` (Active)
**Continuous User Verification**
- **Purpose**: Ensures the person taking the exam matches the registered user.
- **Models/APIs**: Uses `src/lib/faceProcessing.js` (Face-API.js) for face detection and embedding comparison.
- **Key Features**:
  - Checks for "Missing User" (no face).
  - Checks for "Multiple Faces".
  - Verifies identity against `face_registrations` (Supabase) or local storage (Demo mode).
- **Imported By**: `src/pages/ExamSession.jsx`, `src/pages/PWTestSession.jsx`.

### 4. `DeviceMonitor.jsx` (Active)
**System & Browser Event Monitoring**
- **Purpose**: Headless component monitoring browser and system events for integrity violations.
- **Key Features**:
  - **Window/Tab**: Detects focus loss (`blur`) and tab switching (`visibilitychange`).
  - **Keyboard**: Blocks and flags restricted keys (Alt+Tab, Ctrl+C/V, F12/DevTools).
  - **Hardware**: Detects camera/microphone disconnects.
  - **DevTools**: Heuristic detection via window resize patterns.
- **Imported By**: `src/pages/ExamSession.jsx`, `src/pages/PWTestSession.jsx`.

### 5. `NetworkMonitor.jsx` (Active)
**System Integrity & Traffic Analysis**
- **Purpose**: Visualization UI for the main-process `SystemMonitor` service.
- **Models/APIs**: Communicates with Electron via `window.electronAPI`.
- **Key Features**:
  - Displays scores for: Process Risk (blacklisted apps), Network Anomalies (spikes/ports), VPN/Proxy usage, and Remote Access tools.
  - Computes a "System Integrity Score".
  - Correlates network spikes with keystrokes to detect potential remote assistance.
- **Imported By**: `src/pages/ExamSession.jsx`, `src/pages/PWTestSession.jsx`.

### 6. `ObjectDetection.jsx` (Active - Background)
**Prohibited Object Detection**
- **Purpose**: Detects unauthorized objects in the camera frame.
- **Models/APIs**: Uses `@tensorflow-models/coco-ssd` (TensorFlow.js).
- **Key Features**:
  - Identifies "cell phone" or multiple "person" objects.
  - Runs in the background (headless UI) to minimize performance impact.
- **Imported By**: `src/pages/ExamSession.jsx` (active), `src/pages/PWTestSession.jsx`.

### 7. `AudioMonitor.jsx` & `BehaviorMonitor.jsx` (Legacy)
**Deprecated Implementations**
- **Status**: Replaced by `AudioIntelligence.jsx` and `VisionBehaviorMonitor.jsx` respectively.
- **Purpose**: Older implementations of audio/visual monitoring. Maintained in codebase potentially for reference or fallback, but currently commented out in main exam pages.

## Detailed Components Documentation (`src/components/`)
*(Excluding `proctoring` folder)*

### 1. `PreTestCheck.jsx`
**System & Identity Verification**
- **Purpose**: Runs a multi-step wizard before an exam to verify system readiness and user identity.
- **Steps**:
  1.  **System Initialization**: Loads AI models (`face-api.js`).
  2.  **System Permissions**: Checks for Admin rights (via Electron) and kills blacklisted processes (`window.electronAPI.preExamKill`).
  3.  **Identity & Camera**: Verifies camera access and matches user face against registered embedding (Supabase or LocalStorage for demo).
  4.  **Microphone**: Visualizes audio input levels.
  5.  **Speaker**: Plays a test sound.
  6.  **Environment Check**: User confirmation of lighting/background.
- **Models/APIs**: `src/lib/aiModelLoader`, `src/lib/faceProcessing`, `window.electronAPI`, `supabase`.
- **Imported By**: `src/pages/ExamSession.jsx` (Student Exam), `src/pages/PWTestSession.jsx` (Demo Exam).

### 2. `AdminOverridePanel.jsx`
**Live Proctoring Control**
- **Purpose**: Allows an authorized administrator to disable specific proctoring modules *during* a live exam session (e.g., if a student has broken hardware).
- **Key Features**:
  - Requires Admin username/password verification (`verifyAdmin`).
  - Toggles for: Identity, Device, Behavior, Audio, Network, Object Detection, Enforcement.
  - Logs all overrides to `audit_logs` in Supabase.
- **Imported By**: `src/pages/ExamSession.jsx`, `src/pages/PWTestSession.jsx`.

### 3. `AdminBlacklistManager.jsx`
**Application Blocking Configuration**
- **Purpose**: UI for managing the list of forbidden applications (Blacklist) and allowed exceptions (Whitelist).
- **Key Features**:
  - Categorized display of blocked apps (Browsers, VPN, Remote tools, etc.).
  - Ability to add "Custom Apps" to the blacklist.
  - Toggle "Whitelist" status for specific apps.
  - Syncs configuration with the main Electron process via IPC.
- **Models/APIs**: `window.electronAPI` (getDefaultBlacklist, setWhitelist, addToBlacklist).
- **Imported By**: `src/pages/DashboardRouter.jsx` (Route: `/dashboard/blacklist`).

### 4. `DashboardLayout.jsx`
**Main Application Shell**
- **Purpose**: Provides the persistent sidebar navigation and top bar for authenticated users.
- **Key Features**:
  - **Role-Based Navigation**: Renders different menu items for `student`, `teacher`, `admin`, `technical`, and `parent` roles.
  - **Responsive Design**: Collapsible drawer for mobile.
  - **User Profile**: Displays avatar and role badge.
- **Imported By**: `src/pages/DashboardRouter.jsx` (Wraps all dashboard routes).

### 5. `QuestionBankModal.jsx`
**Question Import Tool**
- **Purpose**: Allows teachers to browse and import questions from other courses or tests into the current test being created.
- **Key Features**:
  - Filters by Course and Test Source.
  - Search functionality.
  - Pagination and multi-select.
  - Imports questions by creating copies (stripping IDs).
- **Imported By**: `src/pages/TestCreation.jsx`.

### 6. `RichTextEditor.jsx`
**Markdown Editor**
- **Purpose**: A lightweight text editor for formatting question text.
- **Key Features**:
  - Toolbar for Bold, Italic, Lists, Code, Image, and Links.
  - Inserts Markdown syntax directly into the text field.
- **Imported By**: `src/pages/TestCreation.jsx`.

### 7. `AdminAuthDialog.jsx`
**Security Verification**
- **Purpose**: A reusable dialog that forces an admin to re-enter credentials before performing sensitive actions.
- **Imported By**: `src/pages/dashboards/StudentDashboard.jsx` (Used for "Unlock Account" actions).

### 8. `MermaidDiagram.jsx`
**Data Visualization**
- **Purpose**: Renders text-based diagram definitions into SVG charts using Mermaid.js.
- **Used For**: displaying system architecture or flowcharts in the Technical Dashboard.
- **Imported By**: `src/pages/dashboards/TechnicalDashboard.jsx`.

### 9. `ProtectedRoute.jsx`
**Route Guard**
- **Purpose**: Higher-order component that prevents unauthenticated access.
- **Logic**:
  - Redirects to `/login` if no user found.
  - Redirects to `/first-login` if `user.first_login` is true.
- **Imported By**: `src/App.jsx`, `src/pages/FirstLoginPage.jsx` (Used to wrap all protected routes).

## Detailed Library Documentation (`src/lib/`)

### 1. `supabase.js`
**Database Client**
- **Purpose**: Initializes and exports the Supabase client for database interactions, authentication, and realtime subscriptions.
- **Config**: Uses `createClient` with `autoRefreshToken: true`.
- **Imported By**: Almost every file in the project (Stores, Pages, Components) for backend access.

### 2. `aiModelLoader.js`
**Model Management**
- **Purpose**: Loads TensorFlow.js models required by `face-api.js` (SSD MobileNet, FaceLandmark68, FaceRecognition).
- **Key Functions**:
  - `loadAIModels()`: Asynchronously loads all 3 models from the `/public/models` directory.
  - `getModels()`: Returns loading status of detector and recognition models.
- **Imported By**: `src/pages/FaceRegistration.jsx`, `src/components/PreTestCheck.jsx`.

### 3. `faceProcessing.js`
**Face Analysis Utilities**
- **Purpose**: Wrapper functions for `face-api.js` to simplify face detection and recognition tasks.
- **Key Functions**:
  - `detectFaces(input)`: Returns bounding boxes and 5-point landmarks (Mapped to standard indices).
  - `extractEmbedding(input)`: Returns a 128-dimensional float array representing the face.
  - `calculateSimilarity(v1, v2)`: Computes Cosine Similarity between two face embeddings.
- **Imported By**: `src/pages/FaceRegistration.jsx`, `src/components/PreTestCheck.jsx`, `src/components/proctoring/IdentityMonitor.jsx`.

### 4. `visionIntelligence.js` (v2.0)
**Visual Behavior Engine**
- **Purpose**: Advanced visual analysis using MediaPipe FaceLandmarker for comprehensive behavioral monitoring.
- **Scoring Components**:
  - **Gaze Tracking (35%)**: Calculates iris-to-eye-corner vectors to detect looking away.
  - **Head Pose (25%)**: Geometric solver for Yaw/Pitch estimation.
  - **Duration (15%)**: Penalizes sustained suspicious activity (>3s).
  - **Repetition (15%)**: Penalizes frequent suspicious events.
  - **Lip Activity (10%)**: Measures Mouth Aspect Ratio (MAR) variance to detect talking.
- **Key Features**: Exponential smoothing, Grace zones, FPS throttling, Face lost penalties.
- **Imported By**: `src/components/proctoring/VisionBehaviorMonitor.jsx`.

### 5. `audioIntelligence.js` (v2.0)
**Audio Analysis Engine**
- **Purpose**: Advanced audio monitoring using Silero VAD (Voice Activity Detection) and FFT analysis.
- **Scoring Components**:
  - **Speech Probability (40%)**: Silero VAD confidence score.
  - **Near-Field Estimation (25%)**: FFT spectral flatness + Voice Band Energy to distinguish nearby speech from background noise.
  - **Duration & Repetition**: Penalizes sustained or frequent speech.
  - **Lip Sync (10%)**: Correlates audio with visual lip movement (from Vision engine).
- **Key Features**: Ambient noise calibration (5s), Adaptive thresholds.
- **Imported By**: `src/components/proctoring/AudioIntelligence.jsx`.

### 6. `evidenceCapture.js`
**Video Evidence Recorder**
- **Purpose**: Manages a circular video buffer to capture "replay" clips when a flag occurs.
- **Mechanism**:
  - Continuously records video chunks (1s) into a rolling buffer (last 30s).
  - `captureForFlag(sessionId, flagId)` extracts the last N seconds, creates a Blob, and uploads it to Supabase Storage (`evidence-videos` bucket).
  - Updates the `flags` table with the video URL.
- **Imported By**: `src/pages/ExamSession.jsx` (Used to capture evidence when monitors trigger flags).

### 7. `proctoringService.js`
**Media Stream Compositor**
- **Purpose**: Handles the acquisition of Screen and Camera streams.
- **Status**: Currently configured to **Camera-Only** mode due to browser limitations with programmatic screen selection.
- **Legacy Function**: Logic exists to mix Screen + Camera (PIP) on a Canvas, but it is currently bypassed to ensure stability.
- **Imported By**: `src/pages/ExamSession.jsx`.

## 2.6 Dashboards (`src/pages/dashboards/`)

### 1. `StudentDashboard.jsx`
**Student Portal**
- **Purpose**: The main landing page for students.
- **Key Features**:
  - **Welcome & Status**: Shows user greeting and Face ID registration status.
  - **Upcoming Exams**: Lists tests scheduled for the future or currently active.
  - **Quick Actions**: "Start Exam" button for active tests.
  - **Stats**: Total exams taken, average score, and total flags accumulated.
  - **Recent Results**: History of completed exams with scores and status.
- **Models/APIs**: `supabase` (fetch tests, results, enrollments), `useAuthStore`.
- **Imported By**: `src/pages/DashboardRouter.jsx`.

### 2. `TeacherDashboard.jsx`
**Instructor Portal**
- **Purpose**: Management interface for teachers.
- **Key Features**:
  - **Course Management**: Lists assigned courses and student enrollment counts.
  - **Test Management**: Shows recently created tests and their status (Active/Ended/Upcoming).
  - **Flag Review**: Alerts for pending flags needing review.
  - **Quick Actions**: "Create Test", "Monitor" live exams.
- **Models/APIs**: `supabase` (fetch courses, tests, unreviewed flags).
- **Imported By**: `src/pages/DashboardRouter.jsx`.

### 3. `AdminDashboard.jsx`
**System Administration**
- **Purpose**: High-level overview and management for administrators.
- **Key Features**:
  - **Platform Stats**: Total users, courses, tests, and active sessions.
  - **Quick Actions**: Add Users, Bulk Upload, Create Course, Manage Blacklist.
  - **Live Monitoring**: Real-time view of active exam sessions with flag counts (Red/Orange).
  - **User Management**: Table of recently registered users.
- **Models/APIs**: `supabase` (aggregates stats, active sessions).
- **Imported By**: `src/pages/DashboardRouter.jsx`.

### 4. `ParentDashboard.jsx`
**Guardian Portal**
- **Purpose**: Allows parents to track their children's academic progress.
- **Key Features**:
  - **Child Selector**: Switch between linked student accounts.
  - **Performance Stats**: Average Score, Integrity Score, Attendance % (Exam participation).
  - **Upcoming Schedule**: Next exams for the child.
  - **Teacher Contacts**: Contact info for course instructors.
- **Models/APIs**: `supabase` (fetch `parent_student` links, child's sessions).
- **Imported By**: `src/pages/DashboardRouter.jsx`.

### 5. `TechnicalDashboard.jsx`
**System Health & Debugging**
- **Purpose**: Advanced tools for technical support and system diagnostics.
- **Key Features**:
  - **System Info**: Real-time CPU/RAM usage (via `window.electronAPI`).
  - **Database Query**: Read-only SQL console for direct table inspection.
  - **Schema Viz**: Mermaid.js diagram of the database relationship graph.
  - **Audit Logs**: Recent system actions and security events.
  - **Emergency Stop**: Global kill switch for proctoring sessions.
- **Models/APIs**: `window.electronAPI` (system stats), `supabase` (raw queries, audit logs).
- **Imported By**: `src/pages/DashboardRouter.jsx`.

## 2.7 Root Pages (`src/pages/`)

### 1. `CourseManagement.jsx`
**Course Administration**
- **Purpose**: Interface for creating and managing courses.
- **Key Features**:
  - **CRUD Operations**: Add, Edit, Delete courses.
  - **Enrollment**: Manage students enrolled in specific courses.
  - **Code Generation**: Generates unique course codes for student joining.
- **Models/APIs**: `supabase` (courses table).
- **Imported By**: `src/pages/DashboardRouter.jsx`.

### 2. `DashboardRouter.jsx`
**Dashboard Layout & Routing**
- **Purpose**: The main layout wrapper for all authenticated dashboard pages.
- **Key Features**:
  - **Sidebar Navigation**: Renders the persistent sidebar with role-specific links.
  - **Sub-Routing**: Defines the distinct routes for `/dashboard/*` (e.g., `/dashboard/exam`, `/dashboard/reports`).
  - **Role Guarding**: Ensures users cannot access unauthorized routes.
- **Dependencies**: `react-router-dom`, `Material UI Drawer`.
- **Imported By**: `src/App.jsx`.

### 3. `ExamSession.jsx`
**[Critical] Active Exam Interface**
- **Purpose**: The core exam taking environment.
- **Key Features**:
  - **Proctoring Integration**: Runs Head/Gaze tracking (Vision), Voice Detection (Audio), and Object Detection.
  - **State Lockdown**: Prevents tab switching (Fullscreen enforcement).
  - **Question Rendering**: Displays active test questions with timer.
  - **Submission**: Handles final answer submission and score calculation.
- **Models/APIs**: `supabase`, `proctoringService.js`, `visionIntelligence.js`.
- **Imported By**: `src/pages/DashboardRouter.jsx`.

### 4. `FaceRegistration.jsx`
**Biometric Onboarding**
- **Purpose**: Captures and saves the student's face reference data.
- **Key Features**:
  - **Camera Feed**: Validates camera access and face visibility.
  - **Embedding**: Generates a 128-d face vector using `face-api.js`/models.
  - **Storage**: Saves the embedding to `users` table for future verification.
- **Models/APIs**: `faceProcessing.js`, `supabase`.
- **Imported By**: `src/pages/DashboardRouter.jsx`.

### 5. `FirstLoginPage.jsx`
**Account Setup**
- **Purpose**: Mandatory setup screen for users logging in for the first time.
- **Key Features**:
  - **Password Reset**: Enforces changing the default temporary password.
  - **Profile Confirmation**: Verifies contact details.
- **Models/APIs**: `supabase` (auth update).
- **Imported By**: `src/App.jsx`.


### 6. `FlagReview.jsx`
**[Admin/Teacher] Flag Review Interface**
- **Purpose**: A dedicated interface for reviewing proctoring flags raised during exams. Allows admins and teachers to distinct fake flags from real violations.
- **Key Features**:
  - **Filtering**: Filter flags by severity (High/Medium/Low), status (Unreviewed/Reviewed), or type.
  - **Evidence Playback**: Plays back the video clip associated with a flag (stored in Supabase Storage).
  - **Action Review**: Teachers can dismiss, warn, or escalate flags. Admins can invalidate exams entirely (setting score to 0).
  - **Audit Logging**: Logs all review actions to `audit_logs`.
- **Models/APIs**: `supabase` (fetch flags, update status), `HTMLVideoElement`.
- **Imported By**: `src/pages/DashboardRouter.jsx`.

### 7. `LiveSessionMonitor.jsx`
**[Admin/Teacher] Real-time Monitor**
- **Purpose**: Real-time dashboard for monitoring currently active exam sessions.
- **Key Features**:
  - **Live Stats**: Shows total active, paused, and flagged sessions.
  - **Auto-Refresh**: Polls Supabase every 10 seconds for updates.
  - **Intervention**: Allows authorized users to Pause, Resume, or Terminate a student's active exam session.
  - **Flag Counter**: Visual indicators for Red/Orange flags per student.
- **Models/APIs**: `supabase` (real-time polling of `exam_sessions`).
- **Imported By**: `src/pages/DashboardRouter.jsx`.

### 8. `LoginPage.jsx`
**[Auth] Authentication**
- **Purpose**: The entry point for the application. Handles user authentication.
- **Features**:
  - **Role-Based Redirect**: Redirects to the appropriate dashboard (`/dashboard`, `/first-login`) based on user role and status.
  - **State Management**: Uses `authStore` to manage session state.
- **Models/APIs**: `supabase` (auth).
- **Imported By**: `src/App.jsx`.

### 9. `PWTestSession.jsx`
**[Demo] Exam Simulation**
- **Purpose**: A standalone "Demo Mode" version of the exam interface.
- **Key Features**:
  - **Local Logic**: mirrors `ExamSession.jsx` but removes all server dependencies (no Supabase saves).
  - **Simulation**: Uses local state to simulate flags, timer, and submission.
  - **Safe Playground**: Allows developers and users to test the proctoring UI/UX without affecting real data.
  - **Proctoring**: Runs active proctoring modules (Face, Object, etc.) but alerts via Toast instead of server logs.
- **Models/APIs**: `navigator.mediaDevices`, Local State.
- **Imported By**: `src/pages/DashboardRouter.jsx`.

### 10. `ProfileSettings.jsx`
**[User] Profile Management**
- **Purpose**: User profile management page.
- **Features**:
  - **Profile Photo**: Uploads images to Supabase Storage bucket `profile-photos`.
  - **Password Change**: Updates password via Supabase Auth.
  - **Contact Info**: Updates phone and email.
- **Models/APIs**: `supabase` (storage & auth).
- **Imported By**: `src/pages/DashboardRouter.jsx`.

### 11. `Reports.jsx`
**[Analytics] Institutional Reports**
- **Purpose**: Comprehensive analytics dashboard for institution-wide performance.
- **Key Features**:
  - **Visualizations**: Uses `recharts` to render Bar, Pie, and Line charts.
    - Score Distribution (Histogram).
    - Flag Breakdown by Module (Pie).
    - Course-wise Performance (Bar).
    - 30-Day Exam Trend (Line).
  - **Export**: Generates and downloads a CSV report of course performance.
- **Models/APIs**: `recharts`, `supabase`.
- **Imported By**: `src/pages/DashboardRouter.jsx`.

### 12. `StudentCalendar.jsx`
**[Student] Exam Calendar**
- **Purpose**: A calendar view of upcoming exams for students.
- **Key Features**:
  - **Grouping**: Groups tests effectively by date.
  - **Status Indicators**: Upcoming (Info), Active (Green), Expired (Grey).
  - **Quick Start**: Direct "Start Exam" button for active tests.
- **Models/APIs**: `supabase` (fetch enrolled course tests).
- **Imported By**: `src/pages/DashboardRouter.jsx`.

### 13. `StudentPerformance.jsx`
**[Analytics] Performance History**
- **Purpose**: Detailed performance history for a student.
- **Key Features**:
  - **Dual View**: 
    - Students see their own stats.
    - Teachers/Admins can select any student to view their history.
  - **Metrics**: Calculates Average Score, Best Score, Pass Rate, and Total Flags.
  - **History Table**: List of all past exams with scores and flag counts.
- **Models/APIs**: `supabase`.
- **Imported By**: `src/pages/DashboardRouter.jsx`.

### 14. `StudentTestResult.jsx`
**[Student] Exam Results**
- **Purpose**: Detailed result view after an exam is graded.
- **Features**:
  - **Score Display**: Shows final score and pass/fail status.
  - **Question Review**: If not invalidated, shows question-by-question breakdown of user's answer vs. correct answer.
  - **Invalidation Handling**: Shows a specific error banner if the exam was voided by admin.
- **Models/APIs**: `supabase` (fetch `test_questions`, `answers`).
- **Imported By**: `src/pages/DashboardRouter.jsx`.

### 15. `TestCreation.jsx`
**[Teacher] Test Builder**
- **Purpose**: Interface for teachers to create and publish new tests.
- **Key Features**:
  - **Rich Text**: Uses `RichTextEditor` for question text.
  - **Question Bank**: Imports questions from existing pool (`QuestionBankModal`).
  - **Accommodations**: Allows setting "Extra Time" for specific students (by email/username).
  - **Settings**: Toggle Negative Marking, Randomization, and Schedule.
- **Models/APIs**: `supabase` (insert tests, questions, junction table).
- **Imported By**: `src/pages/DashboardRouter.jsx`.

### 16. `TestList.jsx`
**[Teacher/Student] Test Directory**
- **Purpose**: filtered list of tests available to the user.
- **Features**:
  - **Role Filtering**: 
    - **Students**: See tests from enrolled courses.
    - **Teachers**: See tests they created.
  - **Actions**: Start (Student), View Results (Teacher), Duplicate (Teacher).
- **Models/APIs**: `supabase`.
- **Imported By**: `src/pages/DashboardRouter.jsx`.

### 17. `TestResults.jsx`
**[Teacher] Grading & Results**
- **Purpose**: Grading and results overview for a specific test (Teacher View).
- **Key Features**:
  - **Leaderboard**: Lists all students who took the test with scores.
  - **Manual Grading**: Allows teachers to override scores (e.g., for subjective adjustment) and add feedback.
  - **Export**: Placeholder for CSV export of results.
- **Models/APIs**: `supabase`.
- **Imported By**: `src/pages/DashboardRouter.jsx`.

### 18. `UserManagement.jsx`
**[Admin] User Administration**
- **Purpose**: Central hub for managing platform users.
- **Key Features**:
  - **CRUD**: Create single users (Student, Teacher, Admin, etc.).
  - **Bulk Upload**:
    - **General CSV**: Upload any user type.
    - **Student+Parent CSV**: specific format to auto-create students AND their parents, linking them immediately.
  - **Activation**: Toggle user account active/inactive status.
- **Models/APIs**: `supabase` (users table), `crypto.subtle` (SHA-256 hashing for default passwords).
- **Imported By**: `src/pages/DashboardRouter.jsx`.


### 2.7 Store (`src/store`)

#### authStore.js
- **Purpose**: Global state management for user authentication using **Zustand**.
- **Key Features**:
  - **Session Management**: Handles Login, Logout, and Session Initialization from `localStorage` ('pw_session').
  - **Security**: 
    - Client-side SHA-256 password hashing (MVP implementation).
    - Verifies credentials against Supabase `users` table.
  - **Audit Logging**: Automatically logs 'LOGIN', 'LOGOUT', and 'PASSWORD_CHANGE' events to `audit_logs`.
  - **Admin Verification**: Provides `verifyAdmin` method for high-security actions (like Admin Override).
- **Models/APIs**: `zustand`, `supabase`, `crypto.subtle`.
- **Imported By**: `src/App.jsx`, `src/components/ProtectedRoute.jsx` and many pages.

### 2.8 Hooks (`src/hooks`)
*No custom hooks defined in this directory yet.*

### 2.9 Other Root Files (`src/`)

#### App.jsx
- **Purpose**: Main application component and router configuration.
- **Key Features**:
  - **Routing**: Configures `react-router-dom` with routes for Login, First Login, and Dashboard.
  - **Route Protection**: Wraps protected routes with `ProtectedRoute` component.
  - **Initialization**: Triggers `authStore` initialization on mount.
  - **Theming**: Applies the global Material-UI theme.
- **Dependencies**: `react-router-dom`, `@mui/material`.

#### theme.js
- **Purpose**: Centralized Material-UI theme definition.
- **Key Features**:
  - **Design System**: Defines the "ProctorWatch" aesthetic—Dark Mode, Glassmorphism, and Gradient accents.
  - **Palette**: 
    - **Background**: `#0A0E1A` (Deep Blue/Black).
    - **Primary**: `#6C63FF` (Purple).
    - **Secondary**: `#00D9FF` (Cyan).
    - **Error**: `#FF4D6A` (Red).
  - **Component Overrides**: Custom styles for Buttons (gradients/shadows), Cards (blur effects), and TextFields.
- **Dependencies**: `@mui/material/styles`.

## 2.10 Electron Backend (`electron/`)

### 1. `main.cjs`
**Main Process Entry Point**
- **Purpose**: Initializes the Electron application window and manages lifecycle events.
- **Key Features**:
  - **Window Creation**: Configures the main browser window with secure web preferences (context isolation enabled).
  - **IPC Handlers**: Registers listeners for system info, screen sources, and proctoring commands.
  - **Auto-Update**: Intregrates `electron-updater` for automatic application updates.
  - **Admin Elevation**: Handles requests to restart the application with Administrator privileges via `ShellExecuteA`.

### 2. `preload.cjs`
**IPC Bridge**
- **Purpose**: Securely exposes Node.js functionality to the renderer process via `contextBridge`.
- **Key Features**:
  - **API Exposure**: Provides the global `window.electronAPI` object.
  - **Event Forwarding**: Relays `proctoring:violation` and `proctoring:network-risk-update` events from Main to Renderer.
  - **Method Mapping**: Maps frontend calls like `startEnforcement()` to backend IPC channels.

### 3. `services/EnforcementService.cjs`
**[Critical] Active Proctoring Engine**
- **Purpose**: Manages low-level system enforcement during exams.
- **Key Features**:
  - **Process Blocking**: Terminates blacklisted applications (browsers, remote tools, communication apps) before and during exams.
  - **Keyboard Hook**: Uses `SetWindowsHookExA` to aggressively block system shortcuts (Alt+Tab, WinKey, Ctrl+Esc, etc.).
  - **Focus Enforcement**: Forces the exam window to remain in the foreground and always-on-top.
  - **Clipboard Clearing**: Periodically clears the system clipboard to prevent cheating.
- **Dependencies**: `koffi` (for Windows API calls).

### 4. `services/SystemMonitor.cjs`
**Advanced System Telemetry**
- **Purpose**: Continuously monitors system resources and network activity for suspicious behavior.
- **Key Features**:
  - **Risk Scoring**: Calculates real-time risk scores based on process list, open ports, and network traffic.
  - **Anomaly Detection**: Flags throughput spikes, suspicious port usage (RDP/VNC), and gateway changes (VPN detection).
  - **Heuristic Analysis**: Identifies unknown high-CPU processes.
- **Dependencies**: `systeminformation`.

### 5. `services/windows-api.cjs`
**Native Windows Bindings**
- **Purpose**: direct interface to Windows OS APIs using `koffi` (FFI).
- **Key Features**:
  - **DLL Loading**: Loads `user32.dll`, `kernel32.dll`, and `shell32.dll`.
  - **Function Definitions**: Exports robust definitions for `SetWindowsHookExA`, `TerminateProcess`, `ShellExecuteA`, etc.
  - **Structs**: Defines C-compatible structs like `KBDLLHOOKSTRUCT` for hook callbacks.

## 3. Proctoring System Architecture

### 3.1 Visual Intelligence Engine (v2.0)
**Core Technology**: `MediaPipe FaceLandmarker` + `TensorFlow Lite` (WASM)
**Sampling Rate**: ~8 FPS (Throttled for performance)

#### Scoring Algorithm (Weighted Sum)
The final `visual_score` (0.0 - 1.0) is calculated using a weighted sum of 5 components, smoothed exponentially ($\alpha=0.3$):

$$ Score = (0.35 \times Gaze) + (0.25 \times Pose) + (0.15 \times Duration) + (0.15 \times Repetition) + (0.10 \times Lip) $$

| Component | Weight | Logic / Calculation |
| :--- | :--- | :--- |
| **Gaze Tracking** | **35%** | **Iris-to-Eye-Corner Vector**. <br> - **Safe Zone**: Horizontal ratio 0.30 - 0.70 (Center). <br> - **Grace Zone**: 0.22 - 0.78 (Soft penalty). <br> - **violation**: Looking away > 3s or Looking down (Vertical > 0.4). |
| **Head Pose** | **25%** | **Geometric Solver** (PnP). <br> - **Yaw**: > 25° (Side profile). <br> - **Pitch**: > 20° (Looking down/up). |
| **Duration** | **15%** | **Linear Scale**. 0% at 1s $\to$ 100% at 5s of sustained suspicious behavior. |
| **Repetition** | **15%** | **Event Counter**. Rolling 5-minute window. 5+ events = Max penalty. |
| **Lip Activity** | **10%** | **MAR (Mouth Aspect Ratio)** Variance. <br> - Detects speaking vs. random mouth movement. <br> - `MAR > 0.5` or `Velocity > 0.08`. |

**Trigger**: `Score > 0.60` $\to$ **ORANGE FLAG**

---

### 3.2 Audio Intelligence Engine (v2.0)
**Core Technology**: `Silero VAD` (Voice Activity Detection) + `Web Audio API` (FFT)
**Calibration**: First 5 seconds establishes ambient noise baseline.

#### Scoring Algorithm
$$ Score = (0.40 \times Speech) + (0.25 \times NearField) + (0.15 \times Duration) + (0.10 \times Repetition) + (0.10 \times LipSync) $$

| Component | Weight | Logic / Calculation |
| :--- | :--- | :--- |
| **Speech Prob** | **40%** | **Silero VAD Confidence**. Adaptive threshold (Baseline RMS + Margin). |
| **Near-Field** | **25%** | **Proximity Heuristic**. Combines: <br> 1. **Volume RMS** (normalized). <br> 2. **Voice Band Energy** (300Hz-3400Hz ratio). <br> 3. **Spectral Flatness** (0=Tone/Voice, 1=Noise). |
| **Duration** | **15%** | Linear: 0% at 0.5s $\to$ 100% at 4s. |
| **Lip Sync** | **10%** | **Visual Fusion**. Correlation between Audio Signal and Visual Mouth Velocity. Prevents false positives from background noise. |

**Trigger**: `Score > 0.65` $\to$ **ORANGE FLAG**

---

### 3.3 System & Network Monitor (Electron Main Process)
**Core Technology**: `systeminformation` + `native OS APIs`

#### A. Process Intelligence (25%)
- **Blacklist**: 57+ apps (Browsers, Remote Desktop, Communication, AI Tools).
- **Heuristic**: Flags *unknown* processes consuming >15% CPU.
- **Deduplication**: Groups multiple processes (e.g., chrome.exe * 12) into single alerts.

#### B. Network Anomaly (25%)
- **Port Scanning**: Checks active connections on suspicious ports:
  - `3389` (RDP), `5900` (VNC), `5938` (TeamViewer), `22` (SSH).
- **Throughput Analysis**:
  - Establishes baseline TX/RX during first 3 scans.
  - Flags spikes > 3.0x baseline.
- **Connection Count**: Flags > 50 simultaneous ESTABLISHED connections.

#### C. VPN/Proxy Detection (20%)
- **Interface Analysis**: Scans for keywords: `tun`, `tap`, `vpn`, `wireguard`, `nord`, `cloudflare`.
- **Gateway Watch**: Flags if Default Gateway IP changes *during* the exam.

#### D. Remote Control Detection (15%)
- **Correlation**: Matches Process Name (e.g., `anydesk.exe`) AND Port Usage for 100% confidence.

---

### 3.4 Active Enforcement (Windows Native)
**Core Technology**: `koffi` (FFI) $\to$ `User32.dll`, `Kernel32.dll`

1.  **Pre-Exam Cleanup**:
    -   Scans all running processes.
    -   **Terminates** (Force Kill) any blacklisted apps before exam start.
    -   *Logic*: `taskkill /F /PID <pid>`

2.  **Keyboard Hook (WH_KEYBOARD_LL)**:
    -   Intercepts low-level keystrokes *before* the OS handles them.
    -   **Blocks**:
        -   `Alt + Tab` / `Win Key` (Task Switching)
        -   `Ctrl + Esc` / `Alt + Esc` (Start Menu)
        -   `Ctrl + Shift + Esc` (Task Manager)
        -   `Alt + F4` (Close Window)
        -   `PrtScn` / `Snip & Sketch`
        -   `Ctrl + C` / `Ctrl + V` (Clipboard)

3.  **Focus Governance**:
    -   **Always-On-Top**: Forces exam window to `HWND_TOPMOST`.
    -   **Clipboard Wiper**: Clears clipboard buffer every 500ms.

## 4. Future Roadmap & Remaining Tasks

### 4.1 Testing & Verification
- **Unit Testing**: Implement comprehensive unit tests for `authStore`, `examLogic`, and `utils`.
- **Integration Testing**: End-to-end testing of the full exam flow (Login $\to$ Start $\to$ Proctoring $\to$ Submit).
- **Performance Benchmarking**: Stress test the `MediaPipe` and `Silero VAD` integration on low-end hardware.

### 4.2 Security Hardening
- **Code Obfuscation**: Obfuscate the Electron main process code to prevent reverse engineering of the blacklist/logic.
- **Anti-Debugger**: Implement advanced anti-debugging techniques to detect if a student tries to attach a debugger to the process.
- **Certificates**: Acquire EV Code Signing Certificate for Windows to prevent SmartScreen warnings.

### 4.3 Deployment & Distribution
- **Installer Creation**: Build `.exe` (NSIS) and `.dmg` installers.
- **Auto-Update**: Configure a simplified S3 or GitHub Releases bucket for `electron-updater`.
- **Legal Compliance**: Draft Terms of Service and Privacy Policy regarding biometric data usage.

### 4.4 Feature Expansions (Phase 3)
- **Voice Registration**: Force student to read a phrase to create a voice print for more accurate audio spoofing detection.
- **Mobile Companion App**: Use phone camera as a secondary "side-view" proctoring angle.

## 5. Completed Tasks & Progress

### Planning Phase
- [x] Create a comprehensive `PROJECT_OVERVIEW.md` file in the project root
    - [x] Document directory structure (Strictly exhaustive tree)
    - [x] Document key files and their purposes (Tree format only)
    - [x] Document database schema (tables and key columns)
    - [x] Document key workflows (Exam Session, Proctoring)
    - [x] Document current task status approach
- [x] Create comprehensive implementation plan
  - [x] Define system architecture
  - [x] Technology stack selection
  - [x] Module-by-module breakdown
  - [x] Security & deployment strategy
  - [x] Verification approach

### Implementation Phase (After Approval)

#### Setup Project Structure
- [x] Initialize Electron + Vite + React project
- [x] Configure build scripts and package.json
- [x] Set up directory structure (src, electron, supabase)
- [x] Install dependencies (React, MUI, Supabase client, React Router, Zustand)

#### Backend Development (Supabase)

##### Supabase Setup
- [x] Create Supabase project
- [x] Configure authentication settings
- [x] Set up database tables (PostgreSQL)
  - [x] users table
  - [x] institutions table
  - [x] courses table
  - [x] enrollments table
  - [x] tests table
  - [x] questions table
  - [x] exam_sessions table
  - [x] answers table
  - [x] flags table
  - [x] module_overrides table
  - [x] audit_logs table
  - [x] consents table
  - [x] face_registrations table
  - [x] telemetry table
- [x] Configure storage buckets
  - [x] profile-photos bucket (public read)
  - [x] evidence-videos bucket (private, teacher/admin access)
  - [x] RLS policies for upload/read
  - [x] Auto-cleanup function for old evidence
- [x] Set up Row Level Security (RLS)
  - [x] Enable RLS on all tables
  - [x] Create policies for role-based access
  - [x] Test policy enforcement

##### Authentication & User Management
- [x] Username generation (email → @pw.com)
- [x] Default password (phone number)
- [x] First login detection and flow
  - [x] Password change enforcement
  - [x] Profile photo upload
  - [x] Consent acceptance
  - [x] Face registration UI (Capture flow implemented)
- [ ] Voice registration (AI Phase)
- [ ] ID card scanning (AI Phase) middleware
- [x] JWT token management (Supabase Auth)
- [x] Role-based access control middleware

##### Default Admin Credentials
- [x] Username: admin@pw.com
- [x] Password: Admin@123 (must change on first login)
- [x] Seeded in schema.sql

##### API Endpoints (Supabase Functions)
- [x] grade-exam function (auto-grading with negative marking)
- [x] send-notification function (email/alerts placeholder)
- [x] test-statistics function (test analytics)
- [x] Deploy functions to Supabase (Config ready)

#### Frontend Development (Electron App)

##### Electron Setup & Configuration
- [x] Main process setup (electron/main.cjs)
- [x] Preload script (electron/preload.cjs)
- [x] IPC handlers for renderer communication
- [x] Security policies (CSP, sandbox, nodeIntegration:false)
- [x] Auto-update management (electron-updater)
- [x] Build configuration (electron-builder)

##### Core Application Structure
- [x] Vite + React configuration
- [x] React Router setup
- [x] Protected route wrapper
- [x] Authentication state management (Zustand)
- [x] Theme provider (MUI dark theme)
- [x] Global styles and layout components
- [x] Dashboard layout with sidebar navigation

##### Role-Based Dashboards

###### Technical Dashboard (Superuser)
- [x] Dashboard component created
- [x] System metrics display (CPU, memory, logs)
- [x] Raw SQL query interface
  - [x] Schema visualization (Mermaid diagram)
  - [x] Global override controls (Emergency Stop)
  - [x] Real-time log streaming (Audit Logs Tab)

###### Admin Dashboard
- [x] Dashboard component created
- [x] User management interface
  - [x] Create users (teachers, admins, technical)
  - [x] CSV bulk upload for students
  - [x] User list with search/filter
  - [x] Edit and deactivate users
- [x] Course management
  - [x] Create courses
  - [x] Assign teachers
  - [x] Student enrollment interface
- [x] Live monitoring
  - [x] Active exam sessions table
  - [x] Suspend/resume exam controls
  - [x] Flag count display
- [x] Reporting
  - [x] Institutional reports with charts
  - [x] CSV export functionality
  - [x] Fix Admin Override causing blank screen (NetworkMonitor cleanup crash) <!-- id: 3150 -->
- [ ] Verify Override panel functionality

###### Teacher Dashboard
- [x] Dashboard component created
- [x] Course view
  - [x] List of assigned courses
  - [x] Student roster per course
- [x] Test creation
  - [x] Test metadata form
  - [x] Question builder (MCQ single/multiple)
  - [x] Marks allocation
  - [x] Negative marking support
  - [x] Rich text editor for questions (Markdown support)
  - [x] Image support in questions (Markdown syntax)
  - [x] Question bank (Import from existing tests)
  - [x] Extra time allocation for specific students
- [x] Live monitoring
  - [x] Active test sessions for their courses
  - [x] Real-time flag display
  - [ ] Student camera feed viewer (optional)
- [x] Review & grading
  - [x] Flagged exams list
  - [x] Student camera feed viewer (Live Monitor grid)
  - [x] Fix Mermaid diagram rendering (replace deprecated API)
  - [x] Fix "Warning is not defined" crash in StudentDashboard
  - [x] Fix "Face Detector not loaded" by switching to face-api.js
  - [x] Manual grading override (Test Results page)
  - [x] Comments and feedback system (Test Results page)
- [x] Student history
  - [x] Past performance per student
  - [x] Flag history display

###### Student Dashboard
- [x] Dashboard component created
- [x] Profile section
  - [x] View/edit profile photo
  - [x] Change password
  - [x] View registered face status
- [x] Upcoming exams
  - [x] Calendar view (placeholder)
  - [x] Exam details display
  - [x] "Start Exam" button (5 min before)
- [x] Past results
  - [x] Scores display
  - [x] Performance statistics
  - [x] Review correct/incorrect answers (if enabled)
- [x] Flag history
  - [x] List of flagged exams
  - [x] Transparency feedback
  - [x] Face ID Update (Admin Protected)

###### Parent Dashboard
- [x] Dashboard component created
- [x] Child selector (for multiple children)
- [x] Performance summary
  - [x] Recent test scores
  - [x] Performance charts
  - [x] Attendance percentage
  - [x] Integrity score calculation
- [x] Upcoming exams calendar
- [x] Teacher contact information
- [x] Flag summary (privacy-protected)

##### Course & Enrollment Management
- [x] Course creation interface
- [x] Course listing (role-filtered)
- [x] Teacher assignment
- [x] Student enrollment (bulk and individual)
- [x] Enrollment management

##### Test Creation & Scheduling
- [x] Test metadata form
- [x] Question builder (MCQ single/multiple)
- [x] Marks and negative marking
- [x] Test scheduling
- [x] Question randomization settings
- [x] Extra time allocation per student
- [x] Test duplication feature

##### Exam Interface (Student)
- [x] Question display & navigation
  - [x] Question text rendering
  - [x] Option selection (radio/checkbox)
  - [x] Navigation buttons (Previous/Next)
  - [x] Question palette (grid view)
- [x] Timer & auto-submit
  - [x] Countdown timer
  - [x] Auto-submit on timeout
  - [x] Time urgency indicator
- [x] Answer saving
  - [x] Local auto-save (every answer change)
  - [x] Cloud sync to Supabase
  - [x] Answer persistence
- [x] Live Admin Override Panel
  - [x] Hidden menu (triple-click timer bar)
  - [x] Admin credential verification
  - [x] Module disable toggles (video/audio/network/device/behavior)
  - [x] Reason input for audit log
  - [x] Apply override and record to DB
  - [x] Visual override indicator
- [x] Submit confirmation dialog
- [x] Post-submission score view
- [x] Pre-test diagnostic flow
  - [x] Camera test
  - [x] Microphone test
  - [x] Speaker test
  - [x] Instant Face Verification (Merged with Camera Check, >90% match req)
  - [x] Lighting check (AI Phase placeholder in UI)
  - [x] Environment setup confirmation
  - [x] Student Exam Calendar (Date-grouped view)
- [x] Offline mode support
- [x] Resume exam capability

##### Additional Shared Pages
- [x] Create parent_student table in Supabase (if not exists)
- [x] Modify UserManagement to include parent fields for student creation
- [x] Implement backend logic to create/link parent
- [x] Create distinct CSV templates for general vs student+parent upload
- [x] Update CSV parser to handle parent columns
- [x] User Management (admin/technical)
- [x] Course Management (all roles)
- [x] Test Creation (teachers)
- [x] Test List (role-filtered)
- [x] Flag Review (teachers/admin)
- [x] Profile Settings (all users)
- [x] Live Session Monitor (admin/teacher)
- [x] Student Performance History (teacher/admin/student)
- [x] Reports & Analytics (admin/teacher)

### AI/ML Integration

#### Tech Stack Setup
- [x] Install ONNX Runtime Web
- [x] Setup `public/models` directory for **Offline Model Serving**
- [x] Download models to local storage
- [x] Configure `env` to point to local model paths
- [x] Configure model loading and caching
- [x] Test cross-platform compatibility

#### Face Registration System
- [x] MediaPipe / SCRFD Face Detection integration
- [x] InsightFace / MobileFaceNet model setup
  - [x] Download and convert model to ONNX
  - [x] Test inference speed
  - [x] Embedding extraction (512-dim)
- [x] Quality validation logic
  - [x] Single face detection
  - [x] Frontal pose verification (basic bbox check)
  - [x] Lighting check (basic)
  - [x] Obstruction detection (via landmarks)
- [x] Storage of embeddings and landmarks
- [x] Registration UI component
  - [x] Camera feed with overlay
  - [x] Real-time feedback
  - [x] Capture multiple frames (Single frame implemented for v1)
  - [x] Success/error handling

#### Proctoring Engine - 5 Monitor Modules

##### Identity Monitor
- [x] Face presence detection (MediaPipe/SCRFD)
- [x] Face recognition (InsightFace MobileFaceNet ONNX)
  - [x] Continuous verification (every 2 sec)
  - [x] Cosine similarity calculation
  - [x] Threshold configuration (40% match for MobileFaceNet)
- [x] Multi-face detection
  - [x] Count faces in frame
  - [x] Red flag if >1 face
- [x] Obstruction detection (Implicit in minimal face score check)
  - [x] Landmark visibility check
  - [x] Orange flag if <80% visible

##### Device Monitor
- [x] Window focus tracking
  - [x] Blur event listener
  - [x] Red flag on focus loss (>1 sec debounce)
- [x] Tab switch detection
  - [x] visibilitychange event
  - [x] Red flag on tab switch
- [x] Application monitoring
  - [x] Screen sharing detection (placeholder for Electron)
- [x] Hardware disconnect detection
  - [x] Camera unplugged
  - [x] Mic unplugged
  - [x] Red flags on disconnect
- [x] Keyboard shortcut blocking
  - [x] Prevent Ctrl+C, Ctrl+V, Ctrl+Shift+I, F12
  - [x] Red flags on attempt
- [x] Developer tools detection
  - [x] Window size heuristic
  - [x] Red flag if DevTools open

##### Behavior Monitor
- [x] Head pose estimation (from 5-point landmarks)
  - [x] Nose offset calculation for yaw/pitch
  - [x] Consecutive violation tracking
- [x] Gaze tracking
  - [x] Looking away detection (yaw >35%)
  - [x] Looking down detection (pitch >30%)
  - [x] Orange flags for sustained deviations (3+ consecutive)
- [x] Lip movement detection
  - [x] Mouth-to-eye ratio tracking
  - [x] Speech pattern heuristic
  - [x] Orange flag on lip movement

##### Audio Monitor
- [x] Voice Activity Detection (Web Audio API energy-based)
  - [x] Web Audio API setup
  - [x] Process audio in 500ms chunks
  - [x] Speech band energy calculation (300-3400Hz)
- [x] Whisper pattern detection
  - [x] Low energy + speech band heuristic
  - [x] Consecutive frame detection
- [x] Background noise analysis
- [x] Orange flag on voice detection

##### Network Monitor
- [x] VPN/Proxy detection
  - [x] WebRTC local IP discovery
  - [x] Multiple interface detection
  - [x] Medium flag if VPN suspected
- [x] IP change detection
  - [x] Baseline IP at start
  - [x] Red flag on IP change
- [x] Connection quality monitoring
  - [x] Network Information API
  - [x] Low flag on slow connection

#### Evidence Capture System
- [x] Circular buffer implementation
  - [x] 30-second video buffer in memory
  - [x] 10-second clip extraction on flag
- [x] Upload queue management
  - [x] Background upload when online
  - [x] Retry logic
- [x] Storage bucket integration
  - [x] Upload to evidence-videos bucket
  - [x] Generate signed URLs for viewing
  - [x] Link evidence to flags table

#### Flag Classification System
- [x] Severity categorization logic (high/medium/low)
- [x] Flag Review Dashboard with video playback
- [x] Filter by severity and review status
- [x] Review workflow (dismiss/warn/invalidate/escalate)
- [x] Automated action: Terminate exam on RED severity flag
- [x] Evidence Capture: Video-only recording (Screen recording disabled due to support issues)
- [x] Instant Warnings: Alert student on Orange flags
- [x] Audio Monitor refinement: Reduced false positives (horns/noise)
- [x] Proctoring Cleanup: Ensure all streams stop on submit
- [x] Role-Based Flag Review
  - [x] Teacher View: Dismiss/Warn/Escalate (No Invalidate)
  - [x] Admin View: Default to Escalated flags; Allow re-review of escalated items
- [x] Fix Exam Invalidation Logic (Update session status/score)
- [x] Student View for Violations/Invalidation status (Performance Page)
- [x] Student Dashboard Update: Show Invalidated status in Recent Results
- [x] Exam Results Page: Show 'Void' message instead of score for invalidated exams
- [-] Fix screen recording permissions in Electron (User reported failure - Debugging)
- [x] Restore "Loading AI Models" step (Added 'System Initialization' step in PreTestCheck)
- [x] Verify Object Detection Models (Implemented ObjectDetection.jsx using coco-ssd)
- [x] Implement Admin Override (Added AdminOverridePanel with Ctrl+Shift+A shortcut)
- [x] Create Database Cleanup Script (Created db_cleanup.sql)
- [x] Fix Question Duplication on Import (Added deduplication in QuestionBankModal.jsx)
- [x] Refactor Questions to Many-to-Many (Created db_refactor_questions.sql with evidence_logs fix)
- [x] Update TestCreation.jsx for Many-to-Many (Handles Linking vs Creating)
- [x] Update ExamSession.jsx & Results for Many-to-Many (Joining test_questions)
- [x] Fix False Positive "Not in Frame" (Added 3-interval buffer & lowered threshold)
- [x] Fix Camera Resource Leak on Termination (Added useEffect cleanup on submit)
- [x] Debug Evidence Video Saving (Added detailed logs to evidenceCapture.js)
- [x] Make Admin Override Accessible (Added visible Warning icon button in timer bar)

### Audio Intelligence System (Phase 1)
- [x] Install VAD Dependencies (@ricky0123/vad-web)
- [x] Create AudioIntelligence Service (VAD + Spectral Analysis)
- [x] Update BehaviorMonitor to Export Lip Data
- [x] Implement Speech/Lip Fusion Logic
- [x] Implement Confidence Scoring & Flagging
- [x] Integrate with ExamSession & Evidence Capture in Exam Session (Bypass modules via credentials)
- [x] Fix AudioIntelligence Model Loading (Protobuf error) by serving local ONNX/WASM
- [x] Fix VisionBehaviorMonitor CSP (storage.googleapis.com)
- [x] Fix IdentityMonitor Supabase 406 (Added Demo Mode)

### Network & External Monitoring (Phase 1)
- [x] Install systeminformation (Main Process)
- [x] Create SystemMonitor Service (Process/Network/VPN scans)
- [x] Implement Risk Scoring Engine in Electron Main
- [x] Setup IPC Bridge for Risk Updates
- [x] Update NetworkMonitor to Visualize Risk & Correlation
- [x] Implement Evidence Snapshot (Process Lists)

### System Control & Admin Privileges
- [x] Implement Admin Check (Main Process)
- [x] Implement Restart-as-Admin (Main Process)
- [x] Update PreTestCheck to enforce Admin Rights

### Windows Secure Enforcement (Phase 1)
- [x] Install koffi (FFI for Node.js)
- [x] Create Native Bindings (user32 code)
- [x] Implement ProcessEnforcer (Kill Blacklisted Apps)
- [x] Implement FocusEnforcer (Lock Window)
- [x] Implement ClipboardEnforcer (Auto-clear)
- [x] Implement InputEnforcer (Keyboard Hook - Mock/Log for first pass)

### Admin & Integration
- [x] Update AdminOverridePanel (All modules + Active-by-default logic)
- [x] Update ExamSession (Toggle EnforcementService dynamically)

### Aggressive Blocking Enforcement (Phase 2)
- [x] Update process blacklist (removed SnippingTool, added 30+ apps)
- [x] Enable keyboard hook in production mode
- [x] Implement Alt+Tab blocking
- [x] Implement Task Manager blocking (Ctrl+Shift+Esc, Ctrl+Alt+Del)
- [x] Implement DevTools blocking (Ctrl+Shift+I/J) - Allow F12
- [x] Implement Copy/Paste blocking (Ctrl+C/V)
- [x] Implement Windows Key blocking
- [x] Implement Alt+F4 blocking
- [x] Increase clipboard clear frequency (500ms)
- [x] Add dev mode bypass for keyboard hook
- [ ] Test all blocking scenarios
- [ ] Add admin whitelist configuration

### Documentation
- [x] Create Proctoring Modules Overview
- [x] Create Warnings & Violations List
- [x] Create Technical Architecture Doc
- [x] Create API Documentation

### Testing & Verification
- [ ] Unit tests
  - [ ] Authentication flows
  - [ ] CRUD operations
  - [ ] AI model inference
- [ ] Integration tests
  - [ ] End-to-end exam flow
  - [ ] Proctoring scenarios
  - [ ] Multi-role workflows
- [ ] Security audit
  - [ ] RLS policy verification
  - [ ] Input validation
  - [ ] XSS/CSRF protection
- [ ] Performance testing
  - [ ] AI inference benchmarks
  - [ ] Video processing load
  - [ ] Database query optimization
  - [ ] Concurrent user load testing

### Deployment
- [ ] Electron installer creation
  - [ ] Windows (NSIS/Squirrel)
  - [ ] macOS (DMG)
  - [ ] Linux (AppImage/DEB)
- [ ] Code signing certificates
- [ ] Auto-update configuration
- [ ] Supabase production setup
  - [ ] Database backups
  - [ ] Storage bucket policies
  - [ ] Edge function deployment
- [ ] Documentation
  - [ ] User guides (per role)
  - [ ] Admin setup guide
  - [ ] Technical architecture docs
  - [ ] API documentation
- [ ] Legal compliance
  - [ ] Privacy policy
  - [ ] Terms of service
  - [ ] Consent forms
  - [ ] Data retention policy

## Verification (Original Plan)
- [x] Vite build succeeds
- [ ] Electron app launches successfully
- [ ] All roles can log in
- [ ] Exam flow works end-to-end
- [ ] Proctoring modules functional
- [ ] Evidence capture and upload working
- [ ] Reports generate correctly
- [ ] Performance meets requirements



