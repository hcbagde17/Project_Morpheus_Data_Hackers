import { useEffect, useRef, useCallback } from 'react';

/**
 * DeviceMonitor — Headless proctoring component
 * Monitors: window focus, tab visibility, keyboard shortcuts,
 * hardware disconnects, DevTools, and screen sharing.
 * 
 * Props:
 *   active: boolean — whether monitoring is active
 *   onFlag: ({ type, message, severity }) => void
 */
export default function DeviceMonitor({ active, onFlag }) {
    const blurTimerRef = useRef(null);
    const lastFlagRef = useRef({}); // debounce per type

    // --- Debounced flag emitter (max once per type per 5 seconds) ---
    const emitFlag = useCallback((type, message, severity = 'high') => {
        const now = Date.now();
        if (lastFlagRef.current[type] && now - lastFlagRef.current[type] < 5000) return;
        lastFlagRef.current[type] = now;
        onFlag?.({ type, message, severity, timestamp: new Date() });
    }, [onFlag]);

    // ========================
    // 1. Window Focus / Blur
    // ========================
    useEffect(() => {
        if (!active) return;

        const handleBlur = () => {
            // Start a timer — only flag if blur persists > 1 second (avoid micro-blurs)
            blurTimerRef.current = setTimeout(() => {
                emitFlag('WINDOW_BLUR', 'Application lost focus — student may have switched windows.', 'high');
            }, 1000);
        };

        const handleFocus = () => {
            if (blurTimerRef.current) {
                clearTimeout(blurTimerRef.current);
                blurTimerRef.current = null;
            }
        };

        window.addEventListener('blur', handleBlur);
        window.addEventListener('focus', handleFocus);
        return () => {
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('focus', handleFocus);
            if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
        };
    }, [active, emitFlag]);

    // ========================
    // 2. Tab Visibility Change
    // ========================
    useEffect(() => {
        if (!active) return;

        const handleVisibility = () => {
            if (document.hidden) {
                emitFlag('TAB_SWITCH', 'Student switched to another tab.', 'high');
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [active, emitFlag]);

    // ========================
    // 3. Keyboard Shortcut Blocking
    // ========================
    useEffect(() => {
        if (!active) return;

        const blockedKeys = new Set([
            'F12',        // DevTools
            'F5',         // Refresh
            'F11',        // Fullscreen toggle
        ]);

        const handleKeyDown = (e) => {
            // Block Ctrl+C, Ctrl+V, Ctrl+Shift+I, Ctrl+U
            if (e.ctrlKey && ['c', 'v', 'u'].includes(e.key.toLowerCase())) {
                e.preventDefault();
                emitFlag('BLOCKED_SHORTCUT', `Blocked shortcut: Ctrl+${e.key.toUpperCase()}`, 'medium');
                return;
            }
            // Ctrl+Shift+I (DevTools)
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i') {
                e.preventDefault();
                emitFlag('DEVTOOLS_ATTEMPT', 'Attempted to open Developer Tools (Ctrl+Shift+I).', 'high');
                return;
            }
            // Ctrl+Shift+J (Console)
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'j') {
                e.preventDefault();
                emitFlag('DEVTOOLS_ATTEMPT', 'Attempted to open Console (Ctrl+Shift+J).', 'high');
                return;
            }
            // Alt+Tab (can't fully prevent in browser, but can detect attempt)
            if (e.altKey && e.key === 'Tab') {
                emitFlag('ALT_TAB', 'Alt+Tab detected — possible window switch.', 'high');
                return;
            }
            // Function keys
            if (blockedKeys.has(e.key)) {
                e.preventDefault();
                emitFlag('BLOCKED_KEY', `Blocked key: ${e.key}`, 'medium');
            }
        };

        // Block right-click context menu
        const handleContextMenu = (e) => {
            e.preventDefault();
            emitFlag('RIGHT_CLICK', 'Right-click context menu blocked.', 'low');
        };

        window.addEventListener('keydown', handleKeyDown, true);
        window.addEventListener('contextmenu', handleContextMenu, true);
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
            window.removeEventListener('contextmenu', handleContextMenu, true);
        };
    }, [active, emitFlag]);

    // ========================
    // 4. Hardware Disconnect Detection
    // ========================
    useEffect(() => {
        if (!active) return;

        const handleDeviceChange = async () => {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const hasCamera = devices.some(d => d.kind === 'videoinput');
                const hasMic = devices.some(d => d.kind === 'audioinput');

                if (!hasCamera) {
                    emitFlag('CAMERA_DISCONNECTED', 'Camera has been disconnected.', 'high');
                }
                if (!hasMic) {
                    emitFlag('MIC_DISCONNECTED', 'Microphone has been disconnected.', 'high');
                }
            } catch (err) {
                console.warn('Device enumeration error', err);
            }
        };

        navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
        return () => navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    }, [active, emitFlag]);

    // ========================
    // 5. DevTools Detection (window size heuristic)
    // ========================
    useEffect(() => {
        if (!active) return;

        const checkDevTools = () => {
            const widthThreshold = window.outerWidth - window.innerWidth > 160;
            const heightThreshold = window.outerHeight - window.innerHeight > 160;
            if (widthThreshold || heightThreshold) {
                emitFlag('DEVTOOLS_OPEN', 'Developer Tools appear to be open.', 'high');
            }
        };

        const interval = setInterval(checkDevTools, 3000);
        return () => clearInterval(interval);
    }, [active, emitFlag]);

    // ========================
    // 6. Screen Sharing Detection
    // ========================
    useEffect(() => {
        if (!active) return;

        const checkScreenSharing = async () => {
            try {
                // getDisplayMedia is the API for screen sharing.
                // We can't detect if another app is capturing, but we can
                // check if our own window is being captured via experimental APIs.
                // For Electron, we could check desktopCapturer. 
                // In web context, this is limited. We rely on Electron main process for this.
                // Placeholder: no-op for web-only.
            } catch (err) {
                // silent
            }
        };

        const interval = setInterval(checkScreenSharing, 5000);
        return () => clearInterval(interval);
    }, [active]);

    // Headless component — renders nothing
    return null;
}
