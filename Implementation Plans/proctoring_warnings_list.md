# ProctorWatch - System Warnings & Violations

This document catalogs all possible warnings (Orange Flags) and critical violations (Red Flags) that the ProctorWatch system can raise during an exam.

## 🔴 Critical Violations (Red Flags)
These events indicate a high probability of cheating or a severe breach of exam integrity. Depending on institution settings, these may **auto-terminate** the exam.

| Flag Code | Source Module | Reason for Raising |
| :--- | :--- | :--- |
| **`PROCESS_KILLED`** | `EnforcementService` | A strictly forbidden application (e.g., Snipping Tool, TeamViewer, AnyDesk, ChatGPT) was detected and forcefully terminated by the system. |
| **`REMOTE_CONTROL`** | `SystemMonitor` | Remote Desktop Protocol (RDP), VNC, or active screen sharing was detected on the machine. |
| **`IMPERSONATION`** | `IdentityMonitor` | The person in front of the camera does **not match** the registered student's face embedding for a sustained period. |
| **`MULTIPLE_FACES`** | `IdentityMonitor` | More than one face was detected in the camera frame for a sustained period. |
| **`VM_DETECTED`** | `SystemMonitor` | The exam is running inside a Virtual Machine (VMware, VirtualBox) or Sandbox environment, which is prohibited. |
| **`DEV_TOOLS_OPEN`** | `DeviceMonitor` | The user attempted to open Browser Developer Tools (Inspect Element) to modify the exam code. |
| **`SCREEN_CAPTURE`** | `EnforcementService` | A screenshot or screen recording attempt was detected via keyboard shortcut or process hook. |

---

## 🟠 Warnings (Orange Flags)
These events indicate suspicious behavior. They are logged for review and may trigger a warning message to the student, but typically do not auto-terminate unless repeated frequently.

| Flag Code | Source Module | Reason for Raising |
| :--- | :--- | :--- |
| **`GAZE_AWAY`** | `VisionBehavior` | The student looked away from the screen (left, right, up, down) for more than 3 seconds. |
| **`HEAD_POSE`** | `VisionBehavior` | Excessive head movement (nodding, shaking, turning) indicating communication with someone else. |
| **`SPEECH_DETECTED`** | `AudioIntelligence` | Human speech was detected. Distinguishes voice from background noise. |
| **`WHISPER_DETECTED`** | `AudioIntelligence` | Low-volume, high-frequency speech patterns characteristic of whispering were detected. |
| **`LIP_MOVEMENT`** | `VisionBehavior` | Silent mouthing or lip movement detected without audible speech (often reading questions to a helper). |
| **`TAB_SWITCH`** | `DeviceMonitor` | The student switched to another browser tab or minimized the exam window. |
| **`FOCUS_LOST`** | `EnforcementService` | The exam window lost operating system focus (user clicked outside, opened start menu, etc.). |
| **`CLIPBOARD_CLEARED`** | `EnforcementService` | The system detected and blocked an attempt to Copy or Paste content. |
| **`TYPING_CORRELATION`** | `NetworkMonitor` | A significant network traffic spike occurred immediately (<500ms) after the student typed an answer, suggesting an external lookup. |
| **`VPN_DETECTED`** | `NetworkMonitor` | A VPN or Proxy network interface (Tun/Tap) is active, potentially hiding the user's location or IP. |
| **`LOUD_NOISE`** | `AudioIntelligence` | A sudden loud sound (bang, yell, object drop) was detected. |
| **`NO_FACE`** | `VisionBehavior` | No face was detected in the camera frame for a sustained period (student left the seat). |
| **`PROHIBITED_OBJECT`** | `ObjectDetection` | A cell phone, book, or unauthorized electronic device was detected in the frame. |
| **`MOUSE_EXIT`** | `DeviceMonitor` | The mouse cursor moved outside the exam window boundaries. |
