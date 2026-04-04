import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { registerAppIpc } from './ipc';
import {
  getLogsDirectory,
  getMainLogPath,
  getRendererLogPath,
  logMainError,
  logMainInfo,
  logMainWarn,
} from './logger';

let mainWindow: BrowserWindow | null = null;

function createMainWindow() {
  logMainInfo('Creating main window', {
    packaged: app.isPackaged,
    userData: app.getPath('userData'),
    logsDirectory: getLogsDirectory(),
    mainLogPath: getMainLogPath(),
    rendererLogPath: getRendererLogPath(),
  });

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 760,
    title: 'ReqKit',
    backgroundColor: '#10151c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    logMainInfo('Loading renderer from dev server', { devServerUrl });
    void mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const rendererPath = path.join(app.getAppPath(), 'dist', 'index.html');
    logMainInfo('Loading renderer from packaged file', { rendererPath });
    void mainWindow.loadFile(rendererPath);
  }

  mainWindow.setTitle('ReqKit');

  mainWindow.webContents.on('did-finish-load', () => {
    logMainInfo('Renderer finished loading');
  });

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      logMainError('Renderer failed to load', {
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame,
      });
    },
  );

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logMainError('Renderer process gone', details);
  });

  mainWindow.on('unresponsive', () => {
    logMainWarn('Main window became unresponsive');
  });

  mainWindow.on('closed', () => {
    logMainInfo('Main window closed');
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  logMainInfo('App ready', {
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    userData: app.getPath('userData'),
    logsDirectory: getLogsDirectory(),
  });
  registerAppIpc(ipcMain);
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}).catch((error) => {
  logMainError('App failed during startup', error);
  dialog.showErrorBox(
    'ReqKit Startup Error',
    `ReqKit failed to start.\n\nCheck the log files in:\n${getLogsDirectory()}`,
  );
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (_attachEvent, webPreferences) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
  });

  contents.on('preload-error', (_contentsEvent, preloadPath, error) => {
    logMainError('Preload script failed', {
      preloadPath,
      error: error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack ?? null,
          }
        : String(error),
    });
  });
});

app.on('child-process-gone', (_event, details) => {
  logMainError('Child process gone', details);
});

process.on('uncaughtException', (error) => {
  logMainError('Uncaught exception in main process', error);
});

process.on('unhandledRejection', (reason) => {
  logMainError('Unhandled rejection in main process', reason);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    logMainInfo('All windows closed, quitting app');
    app.quit();
  }
});

app.on('before-quit', () => {
  logMainInfo('App is quitting');
});
