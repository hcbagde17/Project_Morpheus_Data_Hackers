# Implementation Plan: Admin Override Panel Update

**Goal**: Update the Admin Override Panel to include all new proctoring modules and improve the UX by showing "Active" status by default.

## 1. Module List & Identifiers

| UI Label | Internal ID | Controls |
| :--- | :--- | :--- |
| **Identity Verification** | `identity` | `IdentityMonitor` |
| **Device Lock** | `device` | `DeviceMonitor` |
| **Vision Behavior AI** | `behavior` | `VisionBehaviorMonitor` |
| **Audio Intelligence** | `audio` | `AudioIntelligence` |
| **Network & System Monitor** | `network` | `NetworkMonitor` + `SystemMonitor` (Backend) |
| **Object Detection** | `object_detection` | `ObjectDetection` |
| **System Enforcement** | `enforcement` | `EnforcementService` (Backend) |

## 2. AdminOverridePanel.jsx Updates
- **State**: Initialize all modules to `true` (Active).
- **UI**:
    - Switches show "Active" (Green) or "Disabled" (Gray).
    - Label: "Microphone Monitor (Active)" vs "Microphone Monitor (Disabled)".
- **Logic**:
    - `disabledModules` array sent to parent = Keys where state is `false`.

## 3. ExamSession.jsx Updates
- **Effect Hook**: Watch `disabledModules`.
- **Enforcement Control**:
    - If `!disabledModules.includes('enforcement')` -> `startEnforcement()`
    - If `disabledModules.includes('enforcement')` -> `stopEnforcement()`
- **Network Control**:
    - `NetworkMonitor` component handles frontend.
    - Add logic to also call `stopNetworkMonitor()` if disabled? (Currently `NetworkMonitor` handles start/stop on mount/unmount, but maybe explicit stop is safer).

## 4. Execution Steps
1.  **Refactor `AdminOverridePanel.jsx`**: Update state initialization and rendering loop.
2.  **Update `ExamSession.jsx`**: Add `useEffect` to manage `EnforcementService` based on disabled list.

