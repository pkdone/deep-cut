import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, globalShortcut, Menu } from 'electron';
import { loadEnv } from '../../shared/load-env.js';
import { logError, logInfo } from '../../shared/app-logger.js';
import { ConfigurationError } from '../../shared/errors.js';
import { IPC_CHANNELS } from '../ipc-contract.js';
import {
  productionRendererEntryUrl,
  registerAppProtocolHandler,
  registerPrivilegedAppScheme,
} from './app-protocol.js';
import { registerIpcHandlers } from './register-ipc-handlers.js';

loadEnv();
registerPrivilegedAppScheme();

const getMongoUri = (): string => {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new ConfigurationError('MONGODB_URI is not set. Add it to .env.local or environment.');
  }
  return uri;
};

let mainWindow: BrowserWindow | null = null;

/**
 * Allow first load from about:blank and in-app navigations (same http(s) origin or
 * same file tree). Blocks opening arbitrary external URLs from the renderer.
 */
function isNavigationAllowed(current: string, next: string): boolean {
  if (!current || current === 'about:blank' || current === 'about:srcdoc') {
    return true;
  }
  try {
    const nextUrl = new URL(next);
    const curUrl = new URL(current);
    if (
      (nextUrl.protocol === 'http:' || nextUrl.protocol === 'https:') &&
      (curUrl.protocol === 'http:' || curUrl.protocol === 'https:')
    ) {
      return nextUrl.origin === curUrl.origin;
    }
    if (nextUrl.protocol === 'app:' && curUrl.protocol === 'app:') {
      return nextUrl.origin === curUrl.origin;
    }
    if (nextUrl.protocol === 'file:' && curUrl.protocol === 'file:') {
      const curFile = fileURLToPath(curUrl.href);
      const nextFile = fileURLToPath(nextUrl.href);
      const appDir = dirname(curFile);
      return nextFile === appDir || nextFile.startsWith(`${appDir}/`);
    }
  } catch {
    return false;
  }
  return false;
}

function broadcastLibraryUpdated(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.onLibraryUpdated);
  }
}

function broadcastLibraryScanState(scanning: boolean): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.libraryScanState, { scanning });
  }
}

function rendererSandboxEnabled(): boolean {
  const raw = process.env.DEEPCUT_ELECTRON_RENDERER_SANDBOX?.trim().toLowerCase() ?? '';
  if (raw === '0' || raw === 'false') {
    return false;
  }
  return true;
}

function createWindow(): void {
  const sandbox = rendererSandboxEnabled();
  if (!sandbox) {
    logInfo('Electron renderer sandbox disabled (DEEPCUT_ELECTRON_RENDERER_SANDBOX)', {
      note: 'DRM/Web Playback diagnostics only; re-enable sandbox for normal use.',
    });
  }
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    icon: join(__dirname, '../../../assets/icons/deepcut.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox,
      // Allow file:// URLs for local MP3 playback (v1; tighten with custom protocol later).
      webSecurity: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadURL(productionRendererEntryUrl());
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerGlobalShortcuts(): void {
  const bindings: ReadonlyArray<[string, string]> = [
    ['MediaPlayPause', 'togglePlay'],
    ['MediaNextTrack', 'next'],
    ['MediaPreviousTrack', 'previous'],
    ['MediaStop', 'togglePlay'],
    ['MediaTrackNext', 'next'],
    ['MediaTrackPrevious', 'previous'],
    ['CommandOrControl+Shift+S', 'openSettings'],
    ['CommandOrControl+F', 'focusSearch'],
  ];
  for (const [accelerator, command] of bindings) {
    try {
      globalShortcut.register(accelerator, () => {
        if (mainWindow === null || mainWindow.isDestroyed()) {
          return;
        }
        mainWindow.webContents.send(IPC_CHANNELS.globalShortcutTriggered, { command });
      });
    } catch (error) {
      logError('Failed to register global shortcut', { accelerator, error: String(error) });
    }
  }
}

function tryMprisIntegration(): void {
  // Placeholder: MPRIS bridge is optional and environment-dependent.
  // Keep this hook centralized so native/dbus integration can be wired without touching UI.
  logInfo('MPRIS integration hook initialized (no-op)');
}

void app.whenReady().then(() => {
  const rendererRoot = join(__dirname, '../renderer');
  registerAppProtocolHandler(rendererRoot);
  Menu.setApplicationMenu(null);
  registerIpcHandlers({
    getMongoUri,
    getMainWindow: () => mainWindow,
    broadcastLibraryUpdated,
    broadcastLibraryScanState,
  });
  createWindow();
  registerGlobalShortcuts();
  tryMprisIntegration();
  logInfo('DeepCut main started');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (contents.getType() === 'webview') {
      return;
    }
    const current = contents.getURL();
    if (!isNavigationAllowed(current, url)) {
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
