const {
    SetWindowsHookExA, UnhookWindowsHookEx, CallNextHookEx, GetAsyncKeyState,
    GetForegroundWindow, SetForegroundWindow, SetWindowPos,
    OpenClipboard, EmptyClipboard, CloseClipboard,
    CreateToolhelp32Snapshot, Process32First, Process32Next, OpenProcess, TerminateProcess, CloseHandle,
    KBDLLHOOKSTRUCT, PROCESSENTRY32,
    WH_KEYBOARD_LL, TH32CS_SNAPPROCESS, PROCESS_TERMINATE
} = require('./windows-api');
const koffi = require('koffi');

// Config
const BLACKLIST = [
    'taskmgr.exe', 'snippingtool.exe', 'notepad.exe', 'chrome.exe', 'msedge.exe', 'firefox.exe', 'calculator.exe',
    'teamviewer.exe', 'anydesk.exe', 'obs64.exe', 'discord.exe'
];

class EnforcementService {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.active = false;
        this.hookHandle = null;
        this.hookCallback = null;
        this.intervals = [];
    }

    start() {
        if (this.active) return;
        console.log('[Enforcement] Starting...');
        this.active = true;

        // 1. Process Enforcer (Kill forbidden apps)
        this.intervals.push(setInterval(() => this.killBlacklistedProcesses(), 2000));

        // 2. Clipboard Enforcer (Clear repeatedly)
        this.intervals.push(setInterval(() => this.clearClipboard(), 1000));

        // 3. Focus Enforcer (Wait a bit for window to settle)
        this.setAlwaysOnTop(true);
        this.intervals.push(setInterval(() => this.enforceFocus(), 1000));

        // 4. Input Enforcer (Keyboard Hook)
        // this.startKeyboardHook(); // Disabled for safety in dev (uncomment to test blocking)
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
            UnhookWindowsHookEx(this.hookHandle);
            this.hookHandle = null;
        }

        // Reset Window State
        this.setAlwaysOnTop(false);
    }

    // --- Process Enforcer ---
    killBlacklistedProcesses() {
        try {
            const snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if (!snapshot) return;

            const entry = {}; // Struct container
            let success = Process32First(snapshot, entry);

            while (success) {
                // entry.szExeFile is a char array, koffi decodes it properties? or need manual?
                // Koffi handles array types in structs automatically usually, let's assume decoded string or buffer
                // Need to verify koffi usage for char arrays. If it returns buffer, decode it.
                // For safety in this quick draft, let's assume basic valid chars. 
                // Actual Koffi usage might need 'entry.szExeFile' to be converted if it returns an object wrapper.

                // Fix: Koffi struct decoding for char array usually results in a string if configured, 
                // but let's be safe.
                // NOTE: In Koffi, char arrays in structs are returned as Buffers/TypedArrays or strings depending on config.
                // We'll rely on basic string check.

                let processName = '';
                // *Hack*: Koffi documentation says it decodes null-terminated strings for `koffi.array('char', ...)`?
                // If not, we iterate.
                // Let's rely on standard koffi behavior for now.

                // Note: Implementing precise iteration might be tricky without running it. 
                // Logic:

                // Pseudo-fix for simplicity:
                // We will assume string. If buffer, we decode.
                // entry.szExeFile

                /* 
                   Correct Koffi pattern for decoding char array from struct:
                   It's tricky without `koffi` docs in front of me for `process32next`. 
                   Using `systeminformation` for process list might have been safer? 
                   But we need `TerminateProcess` which requires HANDLE from `OpenProcess`.
                   
                   Actually, `systeminformation` gives us the PID, we *can* just use `OpenProcess` on that PID!
                   
                   REFACTOR: Let's use `systeminformation` to FIND, and Native to KILL. 
                   Targeting Process32First/Next via FFI is notoriously unstable in JS due to struct padding.
                   
                   Wait, I already installed `systeminformation`. I can use that for discovery!
                   Much safer.
                */

                // SKIPPING native scan. Using `systeminformation` logic instead for stability.
                break;

            }
            CloseHandle(snapshot);
        } catch (e) {
            console.error('Process Scan Error', e);
        }

        // Revised Logic: Use SystemInformation for List, Native for Kill
        const si = require('systeminformation');
        si.processes().then(data => {
            data.list.forEach(p => {
                if (BLACKLIST.includes(p.name.toLowerCase())) {
                    console.log(`[Enforcement] Killing forbidden app: ${p.name} (${p.pid})`);
                    this.killPid(p.pid);
                    // Notify Renderer
                    this.mainWindow.webContents.send('proctoring:violation', {
                        type: 'PROCESS_KILLED',
                        message: `Killed forbidden application: ${p.name}`,
                        severity: 'high'
                    });
                }
            });
        }).catch(err => console.error(err));
    }

    killPid(pid) {
        const handle = OpenProcess(PROCESS_TERMINATE, false, pid);
        if (handle) {
            TerminateProcess(handle, 1);
            CloseHandle(handle);
        }
    }

    // --- Clipboard Enforcer ---
    clearClipboard() {
        // We use the simpler method: just empty it.
        // Needs a valid HWND for OpenClipboard usually, or NULL (associated with current task).
        // Passing NULL (0) works for current task.
        if (OpenClipboard(0)) {
            EmptyClipboard();
            CloseClipboard();
        }
    }

    // --- Focus Enforcer ---
    enforceFocus() {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

        const myHwnd = this.mainWindow.getNativeWindowHandle(); // Returns Buffer
        // Koffi expects Buffer/Pointer for HWND.

        // Check current foreground
        /* 
           Note: GetForegroundWindow returns HWND (ptr). 
           Comparing Pointers in JS... buf.compare(buf2)?
        */

        // Simplifying: Just FORCE it.
        // Calling SetForegroundWindow repeatedly can be annoying but effective.
        // Better: SetAlwaysOnTop via Electron API + Native backup

        // Use Electron's API for reliability primarily
        if (!this.mainWindow.isFocused()) {
            this.mainWindow.focus();
            this.mainWindow.setAlwaysOnTop(true, 'screen-saver');

            // Notify
            this.mainWindow.webContents.send('proctoring:violation', {
                type: 'FOCUS_LOST',
                message: 'Exam window lost focus.',
                severity: 'medium'
            });
        }
    }

    setAlwaysOnTop(enable) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.setAlwaysOnTop(enable, 'screen-saver');
            this.mainWindow.setFullScreen(enable);
        }
    }

    // --- Input Enforcer (Keyboard Hook) ---
    startKeyboardHook() {
        // Define Callback
        this.hookCallback = koffi.register((nCode, wParam, lParam) => {
            if (nCode >= 0) { // HC_ACTION
                if (wParam === 256 || wParam === 260) { // WM_KEYDOWN or WM_SYSKEYDOWN
                    // Read struct
                    // lParam is pointer to KBDLLHOOKSTRUCT
                    // How to read struct from pointer in callback?
                    // koffi.decode(lParam, KBDLLHOOKSTRUCT)
                    const kbStruct = koffi.decode(lParam, KBDLLHOOKSTRUCT);
                    const vk = kbStruct.vkCode;
                    const flags = kbStruct.flags;

                    // Logic to block Alt+Tab (Alt is VK_MENU 0x12)
                    // If (vk === VK_TAB && (flags & LLKHF_ALTDOWN))

                    const LLKHF_ALTDOWN = (flags >> 5) & 1;
                    const VK_TAB = 0x09;
                    const VK_LWIN = 0x5B;
                    const VK_RWIN = 0x5C;
                    const VK_ESCAPE = 0x1B;

                    if ((vk === VK_TAB && LLKHF_ALTDOWN) ||
                        vk === VK_LWIN || vk === VK_RWIN ||
                        (vk === VK_ESCAPE && GetAsyncKeyState(0x11) /*CTRL*/)) {

                        console.log('Blocked Key:', vk);
                        return 1; // Block
                    }
                }
            }
            return CallNextHookEx(null, nCode, wParam, lParam);
        }, koffi.pointer(koffi.func('HookCallback', 'intptr', ['int', 'intptr', koffi.pointer(KBDLLHOOKSTRUCT)])));

        // Install Hook
        // GetModuleHandle(NULL) -> 0
        this.hookHandle = SetWindowsHookExA(WH_KEYBOARD_LL, this.hookCallback, 0, 0);
        console.log('Keyboard Hook Installed:', this.hookHandle);
    }
}

module.exports = EnforcementService;
