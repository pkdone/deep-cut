import { uniqueNewPlaylistName } from '../../../shared/playlist-naming.js';

describe('uniqueNewPlaylistName', () => {
  it('returns New Playlist #1 when no conflicting names', () => {
    expect(uniqueNewPlaylistName([])).toBe('New Playlist #1');
    expect(uniqueNewPlaylistName(['Other'])).toBe('New Playlist #1');
  });

  it('picks the smallest unused n for New Playlist #n', () => {
    expect(uniqueNewPlaylistName(['New Playlist #1'])).toBe('New Playlist #2');
    expect(uniqueNewPlaylistName(['New Playlist #1', 'New Playlist #2'])).toBe('New Playlist #3');
    expect(uniqueNewPlaylistName(['New Playlist #2'])).toBe('New Playlist #1');
  });
});
