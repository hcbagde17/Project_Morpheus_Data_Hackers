const koffi = require('koffi');

// Load DLLs
const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');

// --- Types & Structs ---
const HANDLE = koffi.pointer('HANDLE', koffi.opaque());
const HWND = koffi.pointer('HWND', koffi.opaque());
const HHOOK = koffi.pointer('HHOOK', koffi.opaque());
const HINSTANCE = koffi.pointer('HINSTANCE', koffi.opaque());
const BOOL = 'int';

// Keyboard Hook Struct
const KBDLLHOOKSTRUCT = koffi.struct('KBDLLHOOKSTRUCT', {
    vkCode: 'uint32',
    scanCode: 'uint32',
    flags: 'uint32',
    time: 'uint32',
    dwExtraInfo: 'ulong'
});

// Process Entry Struct (for Toolhelp32)
const PROCESSENTRY32 = koffi.struct('PROCESSENTRY32', {
    dwSize: 'uint32',
    cntUsage: 'uint32',
    th32ProcessID: 'uint32',
    th32DefaultHeapID: 'uintptr',
    th32ModuleID: 'uint32',
    cntThreads: 'uint32',
    th32ParentProcessID: 'uint32',
    pcPriClassBase: 'long',
    dwFlags: 'uint32',
    szExeFile: koffi.array('char', 260)
});

// --- User32 Functions ---
// Define Callback Prototype
const HookCallback = koffi.proto('HookCallback', 'intptr', ['int', 'intptr', koffi.pointer(KBDLLHOOKSTRUCT)]);

// --- User32 Functions ---
const SetWindowsHookExA = user32.func('SetWindowsHookExA', HHOOK, ['int', koffi.pointer(HookCallback), HINSTANCE, 'uint32']);
const UnhookWindowsHookEx = user32.func('UnhookWindowsHookEx', BOOL, [HHOOK]);
const CallNextHookEx = user32.func('CallNextHookEx', 'intptr', [HHOOK, 'int', 'intptr', 'intptr']);
const GetAsyncKeyState = user32.func('GetAsyncKeyState', 'short', ['int']);
const GetForegroundWindow = user32.func('GetForegroundWindow', HWND, []);
const SetForegroundWindow = user32.func('SetForegroundWindow', BOOL, [HWND]);
const SetWindowPos = user32.func('SetWindowPos', BOOL, [HWND, HWND, 'int', 'int', 'int', 'int', 'uint32']);
const OpenClipboard = user32.func('OpenClipboard', BOOL, [HWND]);
const EmptyClipboard = user32.func('EmptyClipboard', BOOL, []);
const CloseClipboard = user32.func('CloseClipboard', BOOL, []);
const MessageBoxA = user32.func('MessageBoxA', 'int', [HWND, 'string', 'string', 'uint32']);

// --- Kernel32 Functions ---
const CreateToolhelp32Snapshot = kernel32.func('CreateToolhelp32Snapshot', HANDLE, ['uint32', 'uint32']);
const Process32First = kernel32.func('Process32First', BOOL, [HANDLE, koffi.pointer(PROCESSENTRY32)]);
const Process32Next = kernel32.func('Process32Next', BOOL, [HANDLE, koffi.pointer(PROCESSENTRY32)]);
const OpenProcess = kernel32.func('OpenProcess', HANDLE, ['uint32', BOOL, 'uint32']);
const TerminateProcess = kernel32.func('TerminateProcess', BOOL, [HANDLE, 'uint32']);
const CloseHandle = kernel32.func('CloseHandle', BOOL, [HANDLE]);
const GetCurrentThreadId = kernel32.func('GetCurrentThreadId', 'uint32', []);

// --- Shell32 Functions ---
const shell32 = koffi.load('shell32.dll');
const ShellExecuteA = shell32.func('ShellExecuteA', 'int', [HWND, 'string', 'string', 'string', 'string', 'int']);

// Constants
const WH_KEYBOARD_LL = 13;
const TH32CS_SNAPPROCESS = 0x00000002;
const PROCESS_TERMINATE = 0x0001;
const HWND_TOPMOST = -1; // Cast to pointer manually in usage if needed, or handle via library 

module.exports = {
    // API
    user32,
    kernel32,
    shell32,

    // Functions
    ShellExecuteA,
    SetWindowsHookExA,
    UnhookWindowsHookEx,
    CallNextHookEx,
    GetAsyncKeyState,
    GetForegroundWindow,
    SetForegroundWindow,
    SetWindowPos,
    OpenClipboard,
    EmptyClipboard,
    CloseClipboard,
    MessageBoxA,
    CreateToolhelp32Snapshot,
    Process32First,
    Process32Next,
    OpenProcess,
    TerminateProcess,
    CloseHandle,
    GetCurrentThreadId,

    // Structs
    KBDLLHOOKSTRUCT,
    PROCESSENTRY32,

    // Types
    HookCallback,

    // Constants
    WH_KEYBOARD_LL,
    TH32CS_SNAPPROCESS,
    PROCESS_TERMINATE,
    HWND_TOPMOST
};
