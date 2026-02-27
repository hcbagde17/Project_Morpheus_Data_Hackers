# Implementation Plan: Administrator Privilege Enforcement

**Goal**: Ensure the application is running with Administrator privileges before the student can start an exam. This is a prerequisite for advanced monitoring features.

## 1. Technical Strategy

### Detection (Main Process)
- **Command**: `net session`
- **Logic**: This command only succeeds if the process has Admin rights.
    - Exit Code 0: **Admin**
    - Exit Code > 0: **User**

### Elevation (Main Process)
- **Command**: `powershell Start-Process "path/to/exe" -Verb RunAs`
- **Logic**: Relaunches the current application executable (`process.execPath`) with an elevation prompt (UAC).
- **Action**: Triggers `app.quit()` after spawning the new instance.

### UI Integration (PreTestCheck.jsx)
- **New Step**: Insert "System Permissions" after "System Initialization".
- **State**: `checks.admin = 'pending' | 'success' | 'error'`
- **UI**:
    - If `pending`/`error`: Show "Admin Rights Required" warning and a "Restart as Administrator" button.
    - If `success`: Auto-advance.

## 2. Implementation Steps

### Step 1: Main Process Logic
- [ ] Add `ipcMain.handle('check-admin-status')`.
- [ ] Add `ipcMain.on('restart-as-admin')`.

### Step 2: Preload API
- [ ] Expose `checkAdminStatus()` and `restartAsAdmin()`.

### Step 3: Frontend Update (PreTestCheck.jsx)
- [ ] Update `steps` array.
- [ ] Add `admin` to `checks` state.
- [ ] Implement UI for the new step.

## 3. Security & Safety
- **Prompt**: The OS handles the UAC prompt. We cannot bypass it (by design).
- **Loop Prevention**: If the user denies UAC, the app restarts as User again. The check ensures they cannot proceed without accepting.

