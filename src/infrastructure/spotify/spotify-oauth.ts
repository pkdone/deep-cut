import http from 'node:http';
import { URL } from 'node:url';
import { logError, logInfo } from '../../shared/app-logger.js';
import { ExternalServiceError } from '../../shared/errors.js';

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
].join(' ');
const SPOTIFY_OAUTH_REDIRECT_HOST = '127.0.0.1';
const SPOTIFY_OAUTH_REDIRECT_PORT = 8888;
const SPOTIFY_OAUTH_REDIRECT_PATH = '/callback';

export interface SpotifyTokens {
  readonly accessToken: string;
  readonly expiresAtMs: number;
}

export async function startSpotifyAuthorization(params: {
  clientId: string;
  clientSecret: string;
}): Promise<SpotifyTokens> {
  const { clientId, clientSecret } = params;
  const server = http.createServer();
  const port = await new Promise<number>((resolve, reject) => {
    server.listen(SPOTIFY_OAUTH_REDIRECT_PORT, SPOTIFY_OAUTH_REDIRECT_HOST, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve(addr.port);
      } else {
        reject(new Error('No address'));
      }
    });
    server.on('error', (error) => {
      const e = error as NodeJS.ErrnoException;
      if (e.code === 'EADDRINUSE') {
        reject(
          new ExternalServiceError(
            `Spotify OAuth callback port ${SPOTIFY_OAUTH_REDIRECT_PORT} is already in use.`
          )
        );
        return;
      }
      reject(error);
    });
  });

  const redirectUri = `http://${SPOTIFY_OAUTH_REDIRECT_HOST}:${port}${SPOTIFY_OAUTH_REDIRECT_PATH}`;
  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', SCOPES);

  const authPromise = new Promise<SpotifyTokens>((resolve, reject) => {
    server.on('request', (req, res) => {
      if (!req.url) {
        return;
      }
      const u = new URL(req.url, `http://${SPOTIFY_OAUTH_REDIRECT_HOST}:${port}`);
      if (u.pathname !== SPOTIFY_OAUTH_REDIRECT_PATH) {
        res.writeHead(404);
        res.end();
        return;
      }
      const code = u.searchParams.get('code');
      const err = u.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body>You can close this window.</body></html>');
      if (err) {
        reject(new ExternalServiceError(`Spotify auth error: ${err}`));
        return;
      }
      if (!code) {
        reject(new ExternalServiceError('Spotify auth: missing code'));
        return;
      }
      void exchangeCode({ code, redirectUri, clientId, clientSecret })
        .then(resolve)
        .catch(reject);
    });
  });

  logInfo('Spotify OAuth listening', { port });
  const { shell } = await import('electron');
  await shell.openExternal(authUrl.toString());

  try {
    const tokens = await authPromise;
    return tokens;
  } finally {
    server.close();
    logInfo('Spotify OAuth server closed');
  }
}

async function exchangeCode(params: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<SpotifyTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    client_secret: params.clientSecret,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    logError('Spotify token exchange failed', { status: res.status, t });
    throw new ExternalServiceError('Spotify token exchange failed');
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: json.access_token,
    expiresAtMs: Date.now() + json.expires_in * 1000,
  };
}
