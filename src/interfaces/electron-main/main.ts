import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow } from 'electron';
import { loadEnv } from '../../shared/load-env.js';
import { logError, logInfo } from '../../shared/app-logger.js';
import { ConfigurationError } from '../../shared/errors.js';
import { registerIpcHandlers } from './register-ipc-handlers.js';

loadEnv();

const getMongoUri = (): string => {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new ConfigurationError('MONGODB_URI is not set. Add it to .env.local or environment.');
  }
  return uri;
};

let mainWindow: BrowserWindow | null = null;

function broadcastLibraryUpdated(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('deepcut:onLibraryUpdated');
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Allow file:// URLs for local MP3 playback (v1; tighten with custom protocol later).
      webSecurity: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadURL(
      pathToFileURL(join(__dirname, '../renderer/index.html')).href
    );
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

void app.whenReady().then(() => {
  registerIpcHandlers({
    getMongoUri,
    getMainWindow: () => mainWindow,
    broadcastLibraryUpdated,
  });
  createWindow();
  logInfo('DeepCut main started');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (contents.getType() === 'webview') {
      return;
    }
    if (url !== contents.getURL()) {
      event.preventDefault();
    }
  });
});

process.on('uncaughtException', (err) => {
  logError('uncaughtException', { message: err.message, stack: err.stack });
});

process.on('unhandledRejection', (reason) => {
  logError('unhandledRejection', { reason: String(reason) });
});
