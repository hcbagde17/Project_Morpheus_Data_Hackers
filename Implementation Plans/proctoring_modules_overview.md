# ProctorWatch - Proctoring Modules Overview

This document lists all active proctoring modules, including the newly implemented AI and System Enforcement layers.

## 🧠 1. AI Behavior Intelligence (Frontend / Renderer)
These modules run in the Exam Window using advanced browser-based AI models.

| Module | Role & Detection Capabilities |
| :--- | :--- |
| **`VisionBehaviorMonitor`** | **Primary Visual AI**. Uses **MediaPipe FaceMesh (478 landmarks)** to detect: <br>• **Gaze Deviations**: Looking away (left/right/up/down) with high precision.<br>• **Head Pose**: Excessive nodding or turning.<br>• **Lip Movement**: Silent mouthing or whispering.<br>• **Multi-Face**: Detects if another person enters the frame. |
| **`AudioIntelligence`** | **Primary Audio AI**. Uses **Silero VAD & Spectral Analysis** to detect: <br>• **Human Speech**: Distinguishes voice from background noise.<br>• **Whispering**: Detects low-volume speech patterns.<br>• **Suspicious Noises**: Flags tapping, typing bursts, or non-speech spikes. |
| **`ObjectDetection`** | **Secondary Visual AI**. Uses **Coco-SSD / MobileNet** to detect: <br>• **Prohibited Objects**: Cell phones, books, additional laptops.<br>• **Person Count**: Verifies only one person is visible. |
| **`IdentityMonitor`** | **Authentication AI**. Uses **InsightFace** to verify: <br>• **Continuous Identity**: Ensures the person in the chair matches the registered student.<br>• **Impersonation**: Flags if the user is swapped mid-exam. |

## 🛡️ 2. System Enforcement & Security (Backend / Main Process)
These modules run in the **Electron Main Process** with **Administrator Privileges** to control the operating system.

| Module | Role & Enforcement Capabilities |
| :--- | :--- |
| **`EnforcementService`** | **"The Bouncer"**. Active enforcement engine that: <br>• **Process Killer**: Instantly terminates blacklisted apps (`Task Manager`, `Snipping Tool`, `AnyDesk`, `TeamViewer`).<br>• **Focus Lock**: Aggressively forces the exam window to remain **Always on Top** and **Fullscreen**.<br>• **Clipboard Cleaner**: Wipes the clipboard every second to prevent Copy/Paste.<br>• **Keyboard Guard**: Logs and blocks restricted shortcuts (`Alt+Tab`, `Win` keys). |
| **`SystemMonitor`** | **Deep System Scanner**. Uses low-level APIs to detect: <br>• **Ghost Processes**: Hidden AI scripts (Python, Node) running in the background.<br>• **Remote Desktop**: Detects RDP (`3389`), VNC (`5900`), and Screen Sharing tools.<br>• **Virtual Machines**: Detects if the exam is running inside a VM or Sandbox. |
| **`NetworkMonitor`** | **Traffic Analyzer**. Correlates network activity with behavior: <br>• **VPN Detection**: Flags active VPN/Proxy interfaces (`Tun`, `Tap`).<br>• **Typing Correlation**: Flags **"high risk"** if a network spike occurs immediately after typing an answer (suggesting external AI lookup). |

## 🖥️ 3. Standard Proctoring (Browser Level)
Basic browser-level checks that run alongside the advanced modules.

| Module | Role |
| :--- | :--- |
| **`DeviceMonitor`** | • **Tab Switch**: Detects if user tries to switch browser tabs.<br>• **Mouse Exit**: Flags if the mouse leaves the exam window.<br>• **DevTools**: Prevents opening "Inspect Element". |
| **`PreTestCheck`** | • **Environment Verification**: Forces **Administrator Rights**, Camera/Mic checks, and Face Verification before the exam starts. |

## 4. Usage & Configuration
All modules are integrated into `ExamSession.jsx` and `electron/main.cjs`.

### Admin Override
Teachers/Admins can disable specific modules in real-time via the **Admin Override Panel** (`Ctrl+Shift+A`) if false positives occur or accommodations are needed.
