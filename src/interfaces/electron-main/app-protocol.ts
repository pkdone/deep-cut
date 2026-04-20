import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { protocol } from 'electron';
import { logError } from '../../shared/app-logger.js';

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.map': 'application/json',
  '.mjs': 'application/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/** Call before `app.whenReady()` so `app://` can be used like https for fetch / EME. */
export function registerPrivilegedAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
}

function resolveUnderRendererRoot(rendererRoot: string, pathname: string): string | null {
  const trimmed = pathname.replace(/^\/+/, '');
  const rel = trimmed === '' ? 'index.html' : trimmed;
  const segments = rel.split('/').filter((s) => s.length > 0);
  for (const s of segments) {
    if (s === '.' || s === '..') {
      return null;
    }
  }
  const candidate = resolve(join(rendererRoot, ...segments));
  const rootResolved = resolve(rendererRoot);
  if (candidate !== rootResolved && !candidate.startsWith(`${rootResolved}${sep}`)) {
    return null;
  }
  return candidate;
}

/**
 * Serves the production renderer bundle from `app://renderer/...` so Chromium uses a
 * non-`file://` origin (better for Widevine / Web Playback SDK than raw files).
 */
export function registerAppProtocolHandler(rendererRoot: string): void {
  protocol.handle('app', async (request) => {
    try {
      const u = new URL(request.url);
      if (u.hostname !== 'renderer') {
        return new Response('Not Found', { status: 404 });
      }
      const fsPath = resolveUnderRendererRoot(rendererRoot, u.pathname);
      if (fsPath === null) {
        return new Response('Forbidden', { status: 403 });
      }
      const body = await readFile(fsPath);
      const mime = MIME_BY_EXT[extname(fsPath).toLowerCase()] ?? 'application/octet-stream';
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'no-cache',
        },
      });
    } catch (e) {
      logError('app protocol handler failed', { url: request.url, error: String(e) });
      return new Response('Not Found', { status: 404 });
    }
  });
}

export const APP_RENDERER_ORIGIN = 'app://renderer';

export function productionRendererEntryUrl(): string {
  return `${APP_RENDERER_ORIGIN}/index.html`;
}
