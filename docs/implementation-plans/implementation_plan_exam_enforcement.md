# Implementation Plan: Windows Secure Exam Enforcement (Phase 1)

**Goal**: Create a high-friction environment to prevent cheating during exams by enforcing system-level restrictions using native Windows APIs.

## 1. Technical Architecture

### Core Technology: FFI (Foreign Function Interface)
We will use **`koffi`** (a modern, fast C-FFI for Node.js) to call native Windows APIs directly from the Electron Main Process. This avoids the complexity of writing separate C++ addons while giving us access to low-level OS power.

- **Why FFI?**: Standard Node.js APIs cannot block global shortcuts (like Alt+Tab) or clear the clipboard globally on update. We need `user32.dll`.
- **Privilege**: Requires **Administrator** rights (already enforced).

### Module Structure (Main Process)
1.  **`EnforcementService.js`**: Orchestrator that starts/stops all sub-modules.
2.  **`InputEnforcer.js`**: Handles Low-Level Keyboard Hooks.
3.  **`ProcessEnforcer.js`**: Handles Whitelist/Blacklist scanning and Termination.
4.  **`WindowEnforcer.js`**: Handles Focus locking and Always-on-Top enforcement.
5.  **`ClipboardEnforcer.js`**: Monopolizes the clipboard.

## 2. Windows API Mapping (The "Keys")

We will load these functions dynamically from system DLLs.

### A. Keyboard & Input Control (`user32.dll`)
| Function | Purpose | Implementation Detail |
| :--- | :--- | :--- |
| **`SetWindowsHookExA`** | **CRITICAL**. Installs `WH_KEYBOARD_LL` (id 13) hook. | Used to intercept *every* keystroke before it reaches the OS/App. |
| `UnhookWindowsHookEx` | Removal | Cleanup on exam end. |
| `CallNextHookEx` | Chain | Pass allowed keys to next hook; return `1` to **BLOCK** forbidden keys. |
| `GetAsyncKeyState` | State | Check modifier keys (Ctrl, Alt, Win) status during keydown. |

#### Blocked Combinations
- `VK_LWIN` / `VK_RWIN` (Windows Key)
- `VK_MENU` (Alt) + `VK_TAB`
- `VK_CONTROL` + `VK_ESCAPE`
- `VK_LMENU` + `VK_F4` (Alt+F4)

### B. Process & System Control (`kernel32.dll` / `advapi32.dll`)
| Function | Purpose | Implementation Detail |
| :--- | :--- | :--- |
| `CreateToolhelp32Snapshot` | Discovery | Fast snapshot of all running processes. |
| `Process32First` / `Next` | Enumeration | Iterate snapshot to find blacklisted names. |
| `OpenProcess` | Access | Get handle with `PROCESS_TERMINATE` rights. |
| `TerminateProcess` | **KILL** | Forcefully close forbidden apps. |

#### Target Processes (Blacklist)
- `chrome.exe`, `firefox.exe`, `msedge.exe` (Browsers)
- `mstsc.exe`, `TeamViewer.exe`, `AnyDesk.exe` (Remote)
- `SnippingTool.exe`, `obs64.exe` (Capture)
- `Notepad.exe`, `CalculatorApp.exe` (Tools)

### C. Window & Focus Management (`user32.dll`)
| Function | Purpose | Implementation Detail |
| :--- | :--- | :--- |
| `GetForegroundWindow` | Monitoring | Check if Exam Window is active. |
| `SetForegroundWindow` | Enforcement | Force focus back if lost. |
| `SetWindowPos` | Geometry | Set `HWND_TOPMOST` to float above everything. |
| `GetWindowThreadProcessId` | Identification | Map window HWND to Process ID (to ignore safe windows). |

### D. Clipboard Hygiene (`user32.dll`)
| Function | Purpose | Implementation Detail |
| :--- | :--- | :--- |
| `OpenClipboard` | Locking | Lock clipboard for modification. |
| `EmptyClipboard` | Sanitization | **Wipe content** immediately on access. |
| `CloseClipboard` | Release | Release lock. |
| `AddClipboardFormatListener`| Events | Listen for `WM_CLIPBOARDUPDATE` messages to auto-wipe. |

## 3. Policy & Logic

### Risk Engine Integration
This module does not just "block" — it **Flags**.
- **User Blocked Key**: Log warning (Yellow).
- **Focus Lost (>2s)**: Log suspicion (Orange).
- **Blacklisted Process Found**: Kill + Log Violation (Red).

### "Panic Button" Safety
- If the app crashes or freezes, the Keyboard Hook *must* be uninstalled.
- **Fail-safe**: We will register `process.on('exit')` and `process.on('uncaughtException')` to purely call `UnhookWindowsHookEx`.

## 4. Implementation Steps

### Step 1: Dependencies
- [ ] Install `koffi` (npm install koffi).

### Step 2: Native Bindings (`windows-api.js`)
- [ ] Define FFI signatures for all functions listed above.
- [ ] Define Structs (`KBDLLHOOKSTRUCT`, `PROCESSENTRY32`).

### Step 3: Enforcer Modules
- [ ] `FocusEnforcer`: Loop (500ms) verifying `GetForegroundWindow` is us.
- [ ] `ProcessEnforcer`: Loop (2000ms) scanning process list. Aggressive `TerminateProcess` on violators.
- [ ] `InputEnforcer`: Register Hook. Callback logic: `if (block) return 1; else return CallNextHookEx();`
- [ ] `ClipboardEnforcer`: Set loop (1000ms) to `EmptyClipboard()`.

### Step 4: IPC Integration
- [ ] `proctoring:start-enforcement` / `stop-enforcement`.
- [ ] Send violations to Renderer via `proctoring:violation`.

## 5. Deployment Strategy
- **Phase 1 (Now)**: Implement Focus & Process Kill. Monitoring Hook.
- **Phase 2 (Later)**: Full Keyboard Blocking (High Risk of bugs/locking user out). *We will start with Logging Keys instead of Blocking to test stability.*

## 6. Development Note
Running this in Dev mode vs Prod is different.
- In Dev, blocking `Alt+Tab` makes debugging impossible.
- We will add `if (process.env.NODE_ENV === 'development')` bypasses for Keyboard Hooks.
