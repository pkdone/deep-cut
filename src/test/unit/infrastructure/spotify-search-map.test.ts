import { mapSpotifySearchJson } from '../../../infrastructure/spotify/spotify-api.js';

describe('mapSpotifySearchJson', () => {
  it('maps items and next/previous paging links per category', () => {
    const r = mapSpotifySearchJson({
      artists: {
        items: [{ id: 'a1', name: 'A' }],
        next: 'https://api.spotify.com/v1/search?q=x&type=artist&offset=20',
        previous: null,
      },
      albums: {
        items: [],
        next: null,
        previous: null,
      },
      tracks: {
        items: [],
        next: null,
        previous: null,
      },
      playlists: {
        items: [],
        next: null,
        previous: null,
      },
    });
    expect(r.artists).toEqual([{ id: 'a1', name: 'A' }]);
    expect(r.paging.artists.next).toBe('https://api.spotify.com/v1/search?q=x&type=artist&offset=20');
    expect(r.paging.artists.previous).toBeNull();
    expect(r.paging.albums.next).toBeNull();
  });
});
