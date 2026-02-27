# Implementation Plan: Aggressive Blocking Enforcement

## User Requirements

Implement **full blocking** for all security violations:
- ✅ Block Alt+Tab (window switching)
- ✅ Block Task Manager (Ctrl+Shift+Esc, Ctrl+Alt+Del)
- ✅ Block DevTools (Ctrl+Shift+I, Ctrl+Shift+J) - **Allow F12**
- ✅ Block Right-click context menu
- ✅ Wipe clipboard (Copy/Paste blocked)
- ⚠️ Allow screenshots (don't kill SnippingTool)
- ✅ Kill unauthorized processes
- ✅ Block Remote Desktop
- ✅ Block VPNs (unless whitelisted)

---

## Implementation Strategy

### 1. Keyboard Hook Enhancement

**File**: `electron/services/windows-api.cjs`

**Virtual Key Codes to Block**:
```javascript
const BLOCKED_KEYS = {
    VK_LWIN: 0x5B,      // Left Windows Key
    VK_RWIN: 0x5C,      // Right Windows Key
    VK_TAB: 0x09,       // Tab (when Alt is pressed)
    VK_ESCAPE: 0x1B,    // Escape (when Ctrl is pressed)
    VK_DELETE: 0x2E,    // Delete (for Ctrl+Alt+Del)
};

const BLOCKED_COMBINATIONS = [
    // Alt+Tab
    { alt: true, key: VK_TAB },
    
    // Ctrl+Shift+Esc (Task Manager)
    { ctrl: true, shift: true, key: VK_ESCAPE },
    
    // Ctrl+Alt+Del
    { ctrl: true, alt: true, key: VK_DELETE },
    
    // Ctrl+Shift+I (DevTools)
    { ctrl: true, shift: true, key: 0x49 }, // 'I'
    
    // Ctrl+Shift+J (Console)
    { ctrl: true, shift: true, key: 0x4A }, // 'J'
    
    // Ctrl+C, Ctrl+V (Copy/Paste)
    { ctrl: true, key: 0x43 }, // 'C'
    { ctrl: true, key: 0x56 }, // 'V'
    
    // Windows Key alone
    { key: VK_LWIN },
    { key: VK_RWIN },
];

// ALLOW F12 (0x7B) - no blocking
```

---

### 2. Process Blacklist (Kill on Sight)

**Updated List**:
```javascript
const PROCESS_BLACKLIST = [
    // Browsers (if not the exam app)
    'chrome.exe',
    'firefox.exe',
    'msedge.exe',
    'opera.exe',
    'brave.exe',
    
    // Task Manager variants
    'Taskmgr.exe',
    'procexp.exe',      // Process Explorer
    'procexp64.exe',
    
    // Remote Desktop
    'mstsc.exe',        // Windows RDP
    'TeamViewer.exe',
    'AnyDesk.exe',
    'VNCViewer.exe',
    'Chrome Remote Desktop',
    
    // Communication
    'Discord.exe',
    'Slack.exe',
    'Teams.exe',
    'Skype.exe',
    'Zoom.exe',
    
    // AI Tools
    'ChatGPT.exe',
    'claude.exe',
    
    // Programming/Terminal
    'cmd.exe',
    'powershell.exe',
    'WindowsTerminal.exe',
    'python.exe',
    'node.exe',
    
    // Screen Recording
    'obs64.exe',
    'obs32.exe',
    'ShareX.exe',
    // 'SnippingTool.exe', // EXCLUDED per user request
];
```

---

### 3. Clipboard Enforcement

**Strategy**: Auto-wipe clipboard every 500ms

```javascript
// In EnforcementService.js
let clipboardInterval;

function startClipboardEnforcement() {
    clipboardInterval = setInterval(() => {
        try {
            const { OpenClipboard, EmptyClipboard, CloseClipboard } = windowsAPI;
            
            if (OpenClipboard(null)) {
                EmptyClipboard();
                CloseClipboard();
            }
        } catch (err) {
            console.error('Clipboard enforcement error:', err);
        }
    }, 500);
}
```

---

### 4. Context Menu Blocking

**Already implemented** in `DeviceMonitor.jsx`:
```javascript
window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    // Flag logged
}, true);
```

---

### 5. VPN Detection & Blocking

**Strategy**: Detect VPN interfaces, warn user, optionally kill

```javascript
async function detectVPN() {
    const si = require('systeminformation');
    const interfaces = await si.networkInterfaces();
    
    const vpnInterfaces = interfaces.filter(iface =>
        /TAP|TUN|VPN|WireGuard|NordVPN|ExpressVPN/i.test(iface.iface)
    );
    
    if (vpnInterfaces.length > 0) {
        // Option 1: Warn and proceed (Orange Flag)
        // Option 2: Force disconnect (requires admin + specific VPN killer)
        
        return {
            detected: true,
            interfaces: vpnInterfaces.map(i => i.iface)
        };
    }
    
    return { detected: false };
}
```

---

## Proposed Changes

### File: `electron/services/windows-api.cjs`

**Additions**:
1. Complete keyboard hook with all blocked combos
2. Process termination loop (check every 2s)
3. Clipboard wiper loop (every 500ms)
4. Focus enforcer (refocus if lost >1s)

### File: `electron/main.cjs`

**Updates**:
1. Start/stop enforcement via IPC
2. Add VPN detection to system monitor
3. Send violations to renderer

### File: `src/components/PreTestCheck.jsx`

**Updates**:
1. VPN warning step (if detected, show warning)
2. Don't allow exam start if VPN active (configurable)

---

## Implementation Checklist

### Phase 1: Keyboard Hooks
- [ ] Update `windows-api.cjs` with complete key blocking logic
- [ ] Add `GetAsyncKeyState` to check modifier keys
- [ ] Implement hook callback with block logic
- [ ] Test in dev mode (should bypass)
- [ ] Test Alt+Tab blocking in production

### Phase 2: Process Termination
- [ ] Update blacklist in `windows-api.cjs`
- [ ] Implement `scanAndKillProcesses()` function
- [ ] Add to enforcement service with 2s interval
- [ ] Exclude SnippingTool from blacklist
- [ ] Test by launching Discord during exam

### Phase 3: Clipboard Enforcement
- [ ] Implement `EmptyClipboard` FFI binding
- [ ] Create clipboard wiper interval (500ms)
- [ ] Test copy/paste blocking
- [ ] Handle errors gracefully

### Phase 4: VPN Detection
- [ ] Add VPN check to system monitor
- [ ] Create warning UI in PreTestCheck
- [ ] Add admin override for whitelisted VPNs
- [ ] Store whitelist in exam config

### Phase 5: Testing & Validation
- [ ] Test all blocked shortcuts
- [ ] Verify processes are killed
- [ ] Check clipboard is wiped
- [ ] Ensure F12 still works
- [ ] Verify screenshots work

---

## Safety Measures

1. **Dev Mode Bypass**: All blocking disabled if `NODE_ENV === 'development'`
2. **Cleanup on Exit**: Unhook keyboard on process exit
3. **Error Handling**: All FFI calls wrapped in try-catch
4. **Admin Check**: Verify admin rights before starting enforcement
5. **Fail-Safe**: If enforcement crashes, student can still submit exam

---

## Testing Plan

### Manual Tests
1. Press Alt+Tab → Should NOT switch windows
2. Press Ctrl+Shift+Esc → Task Manager should NOT open
3. Press F12 → DevTools should open (allowed)
4. Right-click → Context menu blocked
5. Ctrl+C text → Clipboard wiped immediately
6. Launch Discord → Killed within 2 seconds
7. Enable VPN → Warning shown, exam blocked

### Automated Tests
- Unit tests for key detection logic
- Mock process list for termination testing
- Clipboard state verification

---

## Rollback Plan

If enforcement causes issues:
1. Admin can disable via Override Panel
2. Teacher can whitelist processes per exam
3. Can revert to "log-only" mode (no blocking, just flags)
