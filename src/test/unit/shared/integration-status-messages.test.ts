import {
  getLlmIntegrationWarning,
  getLocalFoldersWarning,
  getSpotifyIntegrationWarning,
} from '../../../shared/integration-status-messages.js';
import type { AppSettings } from '../../../domain/schemas/app-settings.js';

const baseSettings = (): AppSettings => ({
  localMusicFolders: ['/music'],
  llmProvider: 'none',
  spotifyPlaybackMode: 'web-api-remote',
});

describe('integration-status-messages', () => {
  it('getSpotifyIntegrationWarning requires credentials', () => {
    const s = { ...baseSettings(), spotifyClientId: '', spotifyClientSecret: '' };
    expect(getSpotifyIntegrationWarning(s, { connected: false, expiresAtMs: 0 })).toContain(
      'Client ID'
    );
  });

  it('getSpotifyIntegrationWarning null when connected', () => {
    const s = { ...baseSettings(), spotifyClientId: 'id', spotifyClientSecret: 'sec' };
    expect(getSpotifyIntegrationWarning(s, { connected: true, expiresAtMs: Date.now() + 3600_000 })).toBeNull();
  });

  it('getSpotifyIntegrationWarning null when credentials saved but no session yet', () => {
    const s = { ...baseSettings(), spotifyClientId: 'id', spotifyClientSecret: 'sec' };
    expect(getSpotifyIntegrationWarning(s, { connected: false, expiresAtMs: 0 })).toBeNull();
  });

  it('getSpotifyIntegrationWarning when session expired', () => {
    const s = { ...baseSettings(), spotifyClientId: 'id', spotifyClientSecret: 'sec' };
    const past = Date.now() - 120_000;
    expect(getSpotifyIntegrationWarning(s, { connected: false, expiresAtMs: past })).toContain(
      'expired'
    );
  });

  it('getLlmIntegrationWarning when provider none', () => {
    const s = { ...baseSettings(), llmProvider: 'none' };
    expect(getLlmIntegrationWarning(s)).toContain('LLM provider');
  });

  it('getLocalFoldersWarning when no folders', () => {
    const s = { ...baseSettings(), localMusicFolders: [] };
    expect(getLocalFoldersWarning(s)).toContain('folder');
  });
});
