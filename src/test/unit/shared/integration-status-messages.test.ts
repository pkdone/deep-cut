import {
  getLlmIntegrationWarning,
  getLocalFoldersWarning,
  getSpotifyIntegrationWarning,
} from '../../../shared/integration-status-messages.js';
import type { AppSettings } from '../../../domain/schemas/app-settings.js';

const baseSettings = (): AppSettings => ({
  localMusicFolders: ['/music'],
  llmProvider: 'none',
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

  it('getLlmIntegrationWarning when provider none', () => {
    const s = { ...baseSettings(), llmProvider: 'none' };
    expect(getLlmIntegrationWarning(s)).toContain('LLM provider');
  });

  it('getLocalFoldersWarning when no folders', () => {
    const s = { ...baseSettings(), localMusicFolders: [] };
    expect(getLocalFoldersWarning(s)).toContain('folder');
  });
});
