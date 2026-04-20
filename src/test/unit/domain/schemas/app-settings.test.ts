import { appSettingsSchema } from '../../../../domain/schemas/app-settings.js';

describe('appSettingsSchema', () => {
  it('defaults spotifyPlaybackMode to web-api-remote when omitted', () => {
    const parsed = appSettingsSchema.parse({
      localMusicFolders: [],
      llmProvider: 'none',
    });
    expect(parsed.spotifyPlaybackMode).toBe('web-api-remote');
  });

  it('accepts web-playback-sdk explicitly', () => {
    const parsed = appSettingsSchema.parse({
      localMusicFolders: [],
      llmProvider: 'none',
      spotifyPlaybackMode: 'web-playback-sdk',
    });
    expect(parsed.spotifyPlaybackMode).toBe('web-playback-sdk');
  });
});
