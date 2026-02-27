const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    getNetworkInterfaces: () => ipcRenderer.invoke('get-network-interfaces'),
    onWindowBlur: (callback) => ipcRenderer.on('window-blur', callback),
    onWindowFocus: (callback) => ipcRenderer.on('window-focus', callback),
});
