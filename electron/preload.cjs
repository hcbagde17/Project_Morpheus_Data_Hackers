const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    getNetworkInterfaces: () => ipcRenderer.invoke('get-network-interfaces'),
    getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
    onWindowBlur: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('window-blur', subscription);
        return () => ipcRenderer.removeListener('window-blur', subscription);
    },
    onWindowFocus: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('window-focus', subscription);
        return () => ipcRenderer.removeListener('window-focus', subscription);
    },

    // System Monitor (Network/Process)
    startNetworkMonitor: () => ipcRenderer.send('proctoring:start-monitor'),
    stopNetworkMonitor: () => ipcRenderer.send('proctoring:stop-monitor'),
    onNetworkRiskUpdate: (callback) => {
        const subscription = (event, data) => callback(data);
        ipcRenderer.on('proctoring:network-risk-update', subscription);
        return () => ipcRenderer.removeListener('proctoring:network-risk-update', subscription);
    },

    // Secure Enforcement
    startEnforcement: () => ipcRenderer.invoke('proctoring:start-enforcement'),
    stopEnforcement: () => ipcRenderer.send('proctoring:stop-enforcement'),
    onViolation: (callback) => {
        const subscription = (event, data) => callback(data);
        ipcRenderer.on('proctoring:violation', subscription);
        return () => ipcRenderer.removeListener('proctoring:violation', subscription);
    },

    // PRE-EXAM: One-time process kill
    preExamKill: () => ipcRenderer.invoke('proctoring:pre-exam-kill'),

    // Blacklist Management (Admin)
    getDefaultBlacklist: () => ipcRenderer.invoke('proctoring:get-default-blacklist'),
    getActiveBlacklist: () => ipcRenderer.invoke('proctoring:get-active-blacklist'),
    setWhitelist: (processList) => ipcRenderer.invoke('proctoring:set-whitelist', processList),
    addToBlacklist: (processName) => ipcRenderer.invoke('proctoring:add-to-blacklist', processName),
    removeFromBlacklist: (processName) => ipcRenderer.invoke('proctoring:remove-from-blacklist', processName),

    // System Control
    checkAdminStatus: () => ipcRenderer.invoke('check-admin-status'),
    restartAsAdmin: () => ipcRenderer.send('restart-as-admin'),
});
