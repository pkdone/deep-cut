import type { AppSettings } from '../domain/schemas/app-settings.js';

export type SpotifyStatusPayload = {
  readonly connected: boolean;
  readonly expiresAtMs: number;
};

const TOKEN_SKEW_MS = 60_000;

/**
 * When non-null, the Spotify status button should show a warning with this message.
 */
export function getSpotifyIntegrationWarning(
  settings: AppSettings,
  spotify: SpotifyStatusPayload
): string | null {
  const cid = settings.spotifyClientId?.trim() ?? '';
  const sec = settings.spotifyClientSecret?.trim() ?? '';
  if (cid === '' || sec === '') {
    return 'Add Spotify Client ID and Client secret in Settings, then use Connect Spotify.';
  }
  if (spotify.connected) {
    return null;
  }
  /** Credentials are present: “no session yet” is normal until Connect Spotify — not a status-strip warning. */
  if (spotify.expiresAtMs === 0) {
    return null;
  }
  const now = Date.now();
  if (now >= spotify.expiresAtMs - TOKEN_SKEW_MS) {
    return 'Spotify session expired. Use Connect Spotify in Settings.';
  }
  return 'Spotify is not connected. Use Connect Spotify in Settings.';
}

/**
 * When non-null, the LLM status button should show a warning with this message.
 */
export function getLlmIntegrationWarning(settings: AppSettings): string | null {
  if (settings.llmProvider === 'none') {
    return 'Select an LLM provider in Settings to enable artist insights.';
  }
  if (settings.llmProvider === 'openai') {
    const k = settings.openaiApiKey?.trim() ?? '';
    if (k === '') {
      return 'Add your OpenAI API key in Settings.';
    }
    return null;
  }
  const k = settings.anthropicApiKey?.trim() ?? '';
  if (k === '') {
    return 'Add your Anthropic API key in Settings.';
  }
  return null;
}

/**
 * When true, show a warning for local library (no folders configured).
 */
export function getLocalFoldersWarning(settings: AppSettings): string | null {
  if (settings.localMusicFolders.length === 0) {
    return 'Add a local music folder in Settings.';
  }
  return null;
}
