const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Configure autoUpdater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'ProctorWatch',
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Load from Vite dev server in development, or from built files in production
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Security: Prevent new windows
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Security: CSP Headers
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https://*.supabase.co http://localhost:* ws://localhost:*; object-src 'none'; img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in;"
        ]
      }
    });
  });

  // Security: Verify navigation
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    const allowed = ['http:', 'https:', 'file:'];
    if (!allowed.includes(parsedUrl.protocol)) {
      event.preventDefault();
    }
  });

  // Check for updates
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      console.log('Update check failed:', err);
    });
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Auto-updater events
autoUpdater.on('update-available', () => {
  if (mainWindow) mainWindow.webContents.send('update_available');
});
autoUpdater.on('update-downloaded', () => {
  if (mainWindow) mainWindow.webContents.send('update_downloaded');
});

ipcMain.on('restart_app', () => {
  autoUpdater.quitAndInstall();
});

// IPC Handlers for system-level operations
ipcMain.handle('get-system-info', () => {
  const os = require('os');
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
    freeMemory: Math.round(os.freemem() / (1024 * 1024 * 1024)),
    hostname: os.hostname(),
  };
});

ipcMain.handle('get-network-interfaces', () => {
  const os = require('os');
  return os.networkInterfaces();
});
