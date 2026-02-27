const {
    SetWindowsHookExA, UnhookWindowsHookEx, CallNextHookEx, GetAsyncKeyState,
    GetForegroundWindow, SetForegroundWindow, SetWindowPos,
    OpenClipboard, EmptyClipboard, CloseClipboard,
    CreateToolhelp32Snapshot, Process32First, Process32Next, OpenProcess, TerminateProcess, CloseHandle,
    KBDLLHOOKSTRUCT, PROCESSENTRY32, HookCallback,
    WH_KEYBOARD_LL, TH32CS_SNAPPROCESS, PROCESS_TERMINATE
} = require('./windows-api.cjs');
const koffi = require('koffi');

// =============================================================================
// ENFORCEMENT SERVICE CLASS
// =============================================================================
class EnforcementService {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.active = false;
        this.hookHandle = null;
        this.hookCallback = null;
        this.intervals = [];

        // Blacklist is empty until loadBlacklistFromDB() fetches from Supabase.
        // No hardcoded fallback — Supabase is the single source of truth.
        this.blacklist = [];
        this.whitelist = [];
        this.customBlacklist = [];
        this.dbLoaded = false;
    }

    // =========================================================================
    // SUPABASE SYNC — Load blacklist from DB before exam
    // =========================================================================

    /**
     * Fetch the active (non-whitelisted) blacklist from Supabase.
     * Uses Node's native https — no extra dependency, no hardcoded fallback.
     * If Supabase is unreachable, the blacklist stays empty and enforcement logs an error.
     * @returns {Promise<void>}
     */
    async loadBlacklistFromDB() {
        const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

        if (!url || !key) {
            console.error('[Enforcement] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set. Blacklist will be empty.');
            return;
        }

        try {
            const result = await new Promise((resolve, reject) => {
                const https = require('https');
                const apiUrl = new URL(`${url}/rest/v1/app_blacklist?select=process_name&is_whitelisted=eq.false`);

                const options = {
                    hostname: apiUrl.hostname,
                    path: apiUrl.pathname + apiUrl.search,
                    method: 'GET',
                    headers: {
                        'apikey': key,
                        'Authorization': `Bearer ${key}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 8000,
                };

                const req = https.request(options, (res) => {
                    let body = '';
                    res.on('data', chunk => { body += chunk; });
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            resolve(JSON.parse(body));
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
                        }
                    });
                });

                req.on('error', reject);
                req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
                req.end();
            });

            if (Array.isArray(result) && result.length > 0) {
                this.blacklist = result.map(r => r.process_name.toLowerCase());
                this.dbLoaded = true;
                console.log(`[Enforcement] Blacklist loaded from Supabase: ${this.blacklist.length} apps.`);
            } else {
                console.warn('[Enforcement] Supabase returned an empty blacklist. No apps will be blocked.');
            }
        } catch (err) {
            console.error(`[Enforcement] Failed to load blacklist from Supabase: ${err.message}. Blacklist is empty.`);
            // No fallback — blacklist stays as-is (empty on first load, or whatever was previously loaded)
        }
    }

    // =========================================================================
    // BLACKLIST CONFIGURATION (Admin Configurable)
    // =========================================================================

    /**
     * Set the active blacklist from an external source (e.g., database).
     * @param {string[]} processList - Array of process names (lowercase)
     */
    setBlacklist(processList) {
        this.blacklist = processList.map(p => p.toLowerCase());
        console.log(`[Enforcement] Blacklist updated: ${this.blacklist.length} apps`);
    }

    /**
     * Set the whitelist (processes to ALLOW even if in blacklist).
     * @param {string[]} processList - Array of whitelisted process names
     */
    setWhitelist(processList) {
        this.whitelist = processList.map(p => p.toLowerCase());
        console.log(`[Enforcement] Whitelist updated: ${this.whitelist.length} apps`);
    }

    /**
     * Add custom process to blacklist (admin added from dashboard).
     * @param {string} processName - e.g. 'myapp.exe'
     */
    addToBlacklist(processName) {
        const name = processName.toLowerCase();
        if (!this.blacklist.includes(name)) {
            this.blacklist.push(name);
            this.customBlacklist.push(name);
            console.log(`[Enforcement] Added to blacklist: ${name}`);
        }
    }

    /**
     * Remove a process from the blacklist.
     * @param {string} processName - e.g. 'notepad.exe'
     */
    removeFromBlacklist(processName) {
        const name = processName.toLowerCase();
        this.blacklist = this.blacklist.filter(p => p !== name);
        this.customBlacklist = this.customBlacklist.filter(p => p !== name);
        console.log(`[Enforcement] Removed from blacklist: ${name}`);
    }

    /**
     * Check if a process is effectively blacklisted (in blacklist AND not whitelisted).
     * Uses both exact match and partial (contains) match for broader coverage.
     */
    isBlacklisted(processName) {
        const name = processName.toLowerCase();
        if (this.whitelist.includes(name)) return false;

        // Exact match
        if (this.blacklist.includes(name)) return true;

        // Partial match: check if any blacklist entry is contained in the process name
        // e.g. 'whatsapp' would match 'whatsapp.exe', 'whatsappdesktop.exe', etc.
        const nameNoExt = name.replace(/\.exe$/i, '');
        for (const entry of this.blacklist) {
            const entryNoExt = entry.replace(/\.exe$/i, '');
            if (nameNoExt.includes(entryNoExt) || entryNoExt.includes(nameNoExt)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get raw default blacklist by category (for admin UI).
     */
    static getDefaultBlacklistByCategory() {
        return DEFAULT_BLACKLIST;
    }

    /**
     * Get flat list of all active blacklisted apps.
     */
    getActiveBlacklist() {
        return this.blacklist.filter(p => !this.whitelist.includes(p));
    }

    // =========================================================================
    // PHASE 1: PRE-EXAM PROCESS KILL (One-Time)
    // =========================================================================

    /**
     * Scans for and terminates ALL blacklisted processes. Runs ONCE before exam.
     * @returns {Promise<{killed: string[], failed: string[], total: number}>}
     */
    async preExamKill() {
        console.log('[Enforcement] Syncing blacklist from Supabase before PRE-EXAM cleanup...');
        await this.loadBlacklistFromDB();

        console.log('[Enforcement] Running PRE-EXAM process cleanup...');
        const si = require('systeminformation');
        const killed = [];
        const failed = [];

        try {
            const data = await si.processes();

            for (const proc of data.list) {
                if (this.isBlacklisted(proc.name)) {
                    const success = this.killPid(proc.pid, proc.name);
                    if (success) {
                        killed.push(proc.name);
                    } else {
                        failed.push(proc.name);
                    }
                }
            }
        } catch (err) {
            console.error('[Enforcement] PRE-EXAM scan error:', err);
        }

        const result = {
            killed: [...new Set(killed)],
            failed: [...new Set(failed)],
            total: killed.length,
            source: this.dbLoaded ? 'supabase' : 'hardcoded_defaults',
        };

        console.log(`[Enforcement] PRE-EXAM complete. Killed ${result.killed.length} unique apps (source: ${result.source}).`);

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('proctoring:violation', {
                type: 'PRE_EXAM_CLEANUP',
                message: `Pre-exam cleanup: ${result.killed.length} applications closed`,
                severity: 'info',
                details: result
            });
        }

        return result;
    }

    // =========================================================================
    // PHASE 2: DURING-EXAM ENFORCEMENT (Continuous)
    // =========================================================================

    async start() {
        if (this.active) return;

        // Refresh blacklist from Supabase before starting enforcement
        console.log('[Enforcement] Syncing blacklist from Supabase before enforcement start...');
        await this.loadBlacklistFromDB();

        console.log('[Enforcement] Starting DURING-EXAM enforcement...');
        this.active = true;

        // 1. Process DETECTOR (flag, don't kill) — runs every 5 seconds
        this.intervals.push(setInterval(() => this.detectBlacklistedProcesses(), 5000));

        // 2. Clipboard Enforcer (clear every 500ms)
        this.intervals.push(setInterval(() => this.clearClipboard(), 500));

        // 3. Focus Enforcer
        this.setAlwaysOnTop(true);
        this.intervals.push(setInterval(() => this.enforceFocus(), 1000));

        // 4. Input Enforcer (Keyboard Hook)
        // ONLY in production — dev mode bypass to prevent developer lockout
        if (process.env.NODE_ENV !== 'development') {
            this.startKeyboardHook();
        } else {
            console.log('[Enforcement] Keyboard Hook DISABLED in dev mode');
        }
    }

    stop() {
        if (!this.active) return;
        console.log('[Enforcement] Stopping...');
        this.active = false;

        // Clear intervals
        this.intervals.forEach(clearInterval);
        this.intervals = [];

        // Remove Hook
        if (this.hookHandle) {
            try {
                UnhookWindowsHookEx(this.hookHandle);
            } catch (err) {
                console.error('[Enforcement] Error removing hook:', err);
            }
            this.hookHandle = null;
        }

        // Reset Window State
        this.setAlwaysOnTop(false);
    }

    // =========================================================================
    // PROCESS DETECTION (During Exam — Flag Only, NO Kill)
    // =========================================================================

    detectBlacklistedProcesses() {
        const si = require('systeminformation');
        si.processes().then(data => {
            const detected = [];
            data.list.forEach(p => {
                if (this.isBlacklisted(p.name)) {
                    detected.push(p.name);
                }
            });

            // Deduplicate (browsers spawn many processes)
            const unique = [...new Set(detected)];

            if (unique.length > 0) {
                console.log(`[Enforcement] DETECTED ${unique.length} forbidden apps: ${unique.join(', ')}`);

                // Send RED FLAG for each detected process
                unique.forEach(appName => {
                    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                        this.mainWindow.webContents.send('proctoring:violation', {
                            type: 'FORBIDDEN_PROCESS',
                            message: `Unauthorized application detected: ${appName}`,
                            severity: 'high',
                            processName: appName
                        });
                    }
                });
            }
        }).catch(err => console.error('[Enforcement] Detection error:', err));
    }

    // =========================================================================
    // PROCESS KILL (Used by Pre-Exam phase only)
    // =========================================================================

    killPid(pid, name = '') {
        try {
            // Method 1: Use taskkill /F (most reliable, handles elevation better)
            const { execSync } = require('child_process');
            execSync(`taskkill /F /PID ${pid}`, { timeout: 5000, windowsHide: true });
            console.log(`[Enforcement] Killed PID ${pid} (${name}) via taskkill`);
            return true;
        } catch (err1) {
            // Method 2: Fallback to Win32 API if taskkill fails
            try {
                const handle = OpenProcess(PROCESS_TERMINATE, false, pid);
                if (handle) {
                    const result = TerminateProcess(handle, 1);
                    CloseHandle(handle);
                    if (result) {
                        console.log(`[Enforcement] Killed PID ${pid} (${name}) via Win32 API`);
                        return true;
                    }
                }
                console.warn(`[Enforcement] Failed to kill PID ${pid} (${name}) — access denied or process protected`);
                return false;
            } catch (err2) {
                console.error(`[Enforcement] killPid error for PID ${pid} (${name}):`, err2.message);
                return false;
            }
        }
    }

    // =========================================================================
    // CLIPBOARD ENFORCER
    // =========================================================================

    clearClipboard() {
        try {
            if (OpenClipboard(0)) {
                EmptyClipboard();
                CloseClipboard();
            }
        } catch (err) {
            // Silently fail — clipboard may be locked by another process
        }
    }

    // =========================================================================
    // FOCUS ENFORCER
    // =========================================================================

    enforceFocus() {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

        if (!this.mainWindow.isFocused()) {
            this.mainWindow.focus();
            this.mainWindow.setAlwaysOnTop(true, 'screen-saver');

            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('proctoring:violation', {
                    type: 'FOCUS_LOST',
                    message: 'Exam window lost focus.',
                    severity: 'medium'
                });
            }
        }
    }

    setAlwaysOnTop(enable) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.setAlwaysOnTop(enable, 'screen-saver');
            this.mainWindow.setFullScreen(enable);
        }
    }

    // =========================================================================
    // KEYBOARD HOOK — Aggressive Blocking
    // =========================================================================
    // Blocks:  Alt+Tab, Windows Key, Task Manager, DevTools (Ctrl+Shift+I/J),
    //          Copy/Paste, Alt+F4, Ctrl+Escape
    // Allows:  F12 (DevTools via F12), Screenshots
    // =========================================================================

    startKeyboardHook() {
        try {
            // Virtual Key Codes
            const VK_SHIFT = 0x10;
            const VK_CONTROL = 0x11;
            const VK_MENU = 0x12;      // Alt key
            const VK_TAB = 0x09;
            const VK_ESCAPE = 0x1B;
            const VK_DELETE = 0x2E;
            const VK_LWIN = 0x5B;
            const VK_RWIN = 0x5C;
            const VK_F12 = 0x7B;       // F12 — ALLOWED
            const VK_I = 0x49;         // 'I' key
            const VK_J = 0x4A;         // 'J' key
            const VK_C = 0x43;         // 'C' key
            const VK_V = 0x56;         // 'V' key
            const VK_F4 = 0x73;        // F4 key

            // Define Callback using the HookCallback prototype from windows-api.cjs
            this.hookCallback = koffi.register((nCode, wParam, lParam) => {
                if (nCode >= 0) { // HC_ACTION
                    if (wParam === 256 || wParam === 260) { // WM_KEYDOWN or WM_SYSKEYDOWN
                        const kbStruct = koffi.decode(lParam, KBDLLHOOKSTRUCT);
                        const vk = kbStruct.vkCode;
                        const flags = kbStruct.flags;

                        // Check modifier keys
                        const isCtrlPressed = (GetAsyncKeyState(VK_CONTROL) & 0x8000) !== 0;
                        const isShiftPressed = (GetAsyncKeyState(VK_SHIFT) & 0x8000) !== 0;
                        const isAltPressed = (GetAsyncKeyState(VK_MENU) & 0x8000) !== 0;
                        const LLKHF_ALTDOWN = (flags >> 5) & 1;

                        let shouldBlock = false;
                        let blockReason = '';

                        // 1. Block Windows Key
                        if (vk === VK_LWIN || vk === VK_RWIN) {
                            shouldBlock = true;
                            blockReason = 'Windows Key';
                        }

                        // 2. Block Alt+Tab
                        if (vk === VK_TAB && (isAltPressed || LLKHF_ALTDOWN)) {
                            shouldBlock = true;
                            blockReason = 'Alt+Tab';
                        }

                        // 3. Block Ctrl+Shift+Esc (Task Manager)
                        if (vk === VK_ESCAPE && isCtrlPressed && isShiftPressed) {
                            shouldBlock = true;
                            blockReason = 'Ctrl+Shift+Esc (Task Manager)';
                        }

                        // 4. Block Ctrl+Escape (Start Menu)
                        if (vk === VK_ESCAPE && isCtrlPressed) {
                            shouldBlock = true;
                            blockReason = 'Ctrl+Escape';
                        }

                        // 5. Block Ctrl+Alt+Del
                        if (vk === VK_DELETE && isCtrlPressed && isAltPressed) {
                            shouldBlock = true;
                            blockReason = 'Ctrl+Alt+Del';
                        }

                        // 6. Block Alt+F4
                        if (vk === VK_F4 && isAltPressed) {
                            shouldBlock = true;
                            blockReason = 'Alt+F4';
                        }

                        // 7. Block Ctrl+Shift+I (DevTools Inspect)
                        if (vk === VK_I && isCtrlPressed && isShiftPressed) {
                            shouldBlock = true;
                            blockReason = 'Ctrl+Shift+I (DevTools)';
                        }

                        // 8. Block Ctrl+Shift+J (DevTools Console)
                        if (vk === VK_J && isCtrlPressed && isShiftPressed) {
                            shouldBlock = true;
                            blockReason = 'Ctrl+Shift+J (DevTools Console)';
                        }

                        // 9. F12 — ALLOWED (no blocking)

                        // 10. Block Ctrl+C (Copy)
                        if (vk === VK_C && isCtrlPressed && !isShiftPressed) {
                            shouldBlock = true;
                            blockReason = 'Ctrl+C (Copy)';
                        }

                        // 11. Block Ctrl+V (Paste)
                        if (vk === VK_V && isCtrlPressed && !isShiftPressed) {
                            shouldBlock = true;
                            blockReason = 'Ctrl+V (Paste)';
                        }

                        if (shouldBlock) {
                            console.log(`[Enforcement] Blocked: ${blockReason} (VK: ${vk})`);

                            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                                this.mainWindow.webContents.send('proctoring:violation', {
                                    type: 'BLOCKED_SHORTCUT',
                                    message: `Blocked: ${blockReason}`,
                                    severity: 'medium'
                                });
                            }

                            return 1; // BLOCK
                        }
                    }
                }
                return CallNextHookEx(null, nCode, wParam, lParam);
            }, koffi.pointer(HookCallback));

            this.hookHandle = SetWindowsHookExA(WH_KEYBOARD_LL, this.hookCallback, 0, 0);

            if (this.hookHandle) {
                console.log('[Enforcement] Keyboard Hook Installed Successfully');
            } else {
                console.error('[Enforcement] Failed to install keyboard hook');
            }
        } catch (err) {
            console.error('[Enforcement] Keyboard Hook failed to install:', err.message);
        }
    }
}

// Fail-safe: Clean up on unexpected exit
process.on('exit', () => {
    // This is a last resort — normally stop() should be called
});

module.exports = EnforcementService;
