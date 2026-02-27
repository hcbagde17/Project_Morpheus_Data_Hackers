// Load .env into process.env (covers both SUPABASE_ and MODEL_MASTER_SECRET)
require('dotenv').config();

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
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https://*.supabase.co http://localhost:* ws://localhost:* https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net https://*.gstatic.com https://storage.googleapis.com https://*.ort.pyke.io https://api.groq.com https://generativelanguage.googleapis.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net blob:; worker-src 'self' blob:; object-src 'none'; img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in;"
        ]
      }
    });
  });

  // Auto-grant camera & microphone permissions (required for proctoring)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture', 'screen'];
    callback(allowed.includes(permission));
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

ipcMain.handle('get-screen-sources', async () => {
  try {
    const { desktopCapturer } = require('electron');
    // console.log('Main: Requesting screen sources...');
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
    // console.log(`Main: Found ${sources.length} sources`);
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }));
  } catch (err) {
    console.error('Main: Error getting screen sources:', err);
    throw err;
  }
});

// --- System Monitor (Network/Process Risk) ---
const SystemMonitor = require('./services/SystemMonitor.cjs');
let systemMonitor = null;

// --- Enforcement Service (Secure Exam) ---
const EnforcementService = require('./services/EnforcementService.cjs');
let enforcementService = null;

// Ensure enforcement service instance exists
function getEnforcementService() {
  if (!enforcementService && mainWindow) {
    enforcementService = new EnforcementService(mainWindow);
  }
  return enforcementService;
}

// Start during-exam enforcement (continuous detection + keyboard hooks)
ipcMain.handle('proctoring:start-enforcement', async () => {
  const svc = getEnforcementService();
  if (svc) await svc.start();
  return { success: true };
});

// Stop enforcement
ipcMain.on('proctoring:stop-enforcement', () => {
  if (enforcementService) {
    enforcementService.stop();
    enforcementService = null;
  }
});

// PRE-EXAM: One-time process kill (terminates all blacklisted apps)
ipcMain.handle('proctoring:pre-exam-kill', async () => {
  const svc = getEnforcementService();
  if (svc) {
    return await svc.preExamKill();
  }
  return { killed: [], failed: [], total: 0 };
});

// Get default blacklist organized by category (for admin UI)
ipcMain.handle('proctoring:get-default-blacklist', () => {
  return EnforcementService.getDefaultBlacklistByCategory();
});

// Get currently active blacklist
ipcMain.handle('proctoring:get-active-blacklist', () => {
  const svc = getEnforcementService();
  return svc ? svc.getActiveBlacklist() : [];
});

// Admin: Set whitelist (allow specific apps)
ipcMain.handle('proctoring:set-whitelist', (event, processList) => {
  const svc = getEnforcementService();
  if (svc) {
    svc.setWhitelist(processList);
    return { success: true, count: processList.length };
  }
  return { success: false };
});

// Admin: Add custom app to blacklist
ipcMain.handle('proctoring:add-to-blacklist', (event, processName) => {
  const svc = getEnforcementService();
  if (svc) {
    svc.addToBlacklist(processName);
    return { success: true };
  }
  return { success: false };
});

// Admin: Remove app from blacklist
ipcMain.handle('proctoring:remove-from-blacklist', (event, processName) => {
  const svc = getEnforcementService();
  if (svc) {
    svc.removeFromBlacklist(processName);
    return { success: true };
  }
  return { success: false };
});

// --- System Monitor IPC ---
ipcMain.on('proctoring:start-monitor', () => {
  if (!systemMonitor && mainWindow) {
    systemMonitor = new SystemMonitor(mainWindow);
  }
  if (systemMonitor) systemMonitor.start();
});

ipcMain.on('proctoring:stop-monitor', () => {
  if (systemMonitor) {
    systemMonitor.stop();
    systemMonitor = null;
  }
});

// --- Admin Privilege & Elevation ---
ipcMain.handle('check-admin-status', () => {
  return new Promise((resolve) => {
    // "net session" only works with Admin privileges
    require('child_process').exec('net session', (err) => {
      resolve(!err);
    });
  });
});

ipcMain.on('restart-as-admin', () => {
  const { ShellExecuteA } = require('./services/windows-api.cjs');

  // Determine command and arguments based on environment
  let command, args;

  if (app.isPackaged) {
    // Production: Run the app executable directly
    command = app.getPath('exe');
    args = '';
  } else {
    // Development: Run electron binary with the app source path
    command = process.execPath;
    // args needs to be a string for ShellExecute
    args = `"${app.getAppPath()}"`; // Quote path for safety
  }

  console.log(`Main: Restarting as Admin (ShellExecute). Command: "${command}", Args: ${args}`);

  // ShellExecuteA(HWND, Operation, File, Parameters, Directory, ShowCmd)
  // Operation: "runas" (Triggers UAC)
  // ShowCmd: 1 (SW_SHOWNORMAL)
  // HWND: 0 (NULL)

  const result = ShellExecuteA(0, 'runas', command, args, null, 1);

  // Per MSDN: If the function succeeds, it returns a value greater than 32. 
  // If the function fails, it returns an error value that indicates the cause of the failure.
  if (result > 32) {
    console.log('Main: ShellExecute success.');
    app.quit();
  } else {
    console.error('Main: ShellExecute failed with code:', result);
    // We might want to notify renderer, but app likely stays open if failed.
  }
});

// ─── Encrypted ONNX Model Loader ─────────────────────────────────────────────
// Decrypts a .onnx.enc file in-memory and returns the raw ArrayBuffer to the
// renderer. The decrypted bytes never touch disk.
ipcMain.handle('load-model', async (_, modelName) => {
  const { loadModel } = require('./services/modelLoader.cjs');
  return await loadModel(modelName);
});
