import { buildUnifiedSearch, MAX_UNIFIED_SECTION_ITEMS } from '../../../application/unified-search.js';
import type { LocalTrack } from '../../../domain/schemas/local-track.js';

function lt(p: Partial<LocalTrack> & Pick<LocalTrack, 'localTrackId' | 'filePath' | 'title'>): LocalTrack {
  return {
    source: 'local',
    artist: p.artist ?? 'A',
    album: p.album ?? 'Album',
    durationMs: p.durationMs ?? 1000,
    ...p,
  };
}

describe('buildUnifiedSearch local artists and albums', () => {
  it('aggregates localAlbums by artist and album with track counts', () => {
    const locals: LocalTrack[] = [
      lt({
        localTrackId: '1',
        filePath: '/a/1.mp3',
        title: 'T1',
        artist: 'Fugazi',
        album: 'Repeater',
      }),
      lt({
        localTrackId: '2',
        filePath: '/a/2.mp3',
        title: 'T2',
        artist: 'Fugazi',
        album: 'Repeater',
      }),
      lt({
        localTrackId: '3',
        filePath: '/a/3.mp3',
        title: 'T3',
        artist: 'Fugazi',
        album: 'Other',
      }),
    ];
    const r = buildUnifiedSearch({
      spotify: null,
      locals,
      appPlaylists: [],
      query: '',
    });
    const repeater = r.localAlbums.find((x) => x.album === 'Repeater');
    expect(repeater).toEqual({ artist: 'Fugazi', album: 'Repeater', trackCount: 2 });
    expect(r.localArtists.find((a) => a.name === 'Fugazi')).toEqual({
      name: 'Fugazi',
      trackCount: 3,
    });
  });

  it('filters localAlbums by query on album name', () => {
    const locals: LocalTrack[] = [
      lt({
        localTrackId: '1',
        filePath: '/x/1.mp3',
        title: 'A',
        artist: 'X',
        album: 'Alpha',
      }),
      lt({
        localTrackId: '2',
        filePath: '/x/2.mp3',
        title: 'B',
        artist: 'Y',
        album: 'Beta',
      }),
    ];
    const r = buildUnifiedSearch({
      spotify: null,
      locals,
      appPlaylists: [],
      query: 'beta',
    });
    expect(r.localAlbums).toHaveLength(1);
    expect(r.localAlbums[0]?.album).toBe('Beta');
  });

  it('returns more than 20 local artists when the library has many distinct artists (capped by MAX_UNIFIED_SECTION_ITEMS)', () => {
    const locals: LocalTrack[] = [];
    for (let i = 0; i < 25; i += 1) {
      locals.push(
        lt({
          localTrackId: `id-${i}`,
          filePath: `/m/${i}.mp3`,
          title: `T${i}`,
          artist: `Artist ${i}`,
          album: 'Album',
        })
      );
    }
    const r = buildUnifiedSearch({
      spotify: null,
      locals,
      appPlaylists: [],
      query: '',
    });
    expect(r.localArtists).toHaveLength(25);
    expect(r.spotifyPaging).toBeNull();
    expect(r.usedLocalTrackIds).toHaveLength(0);
  });

  it('caps local artists at MAX_UNIFIED_SECTION_ITEMS', () => {
    const locals: LocalTrack[] = [];
    for (let i = 0; i < MAX_UNIFIED_SECTION_ITEMS + 10; i += 1) {
      locals.push(
        lt({
          localTrackId: `id-${i}`,
          filePath: `/m/${i}.mp3`,
          title: `T${i}`,
          artist: `Artist ${i}`,
          album: 'Album',
        })
      );
    }
    const r = buildUnifiedSearch({
      spotify: null,
      locals,
      appPlaylists: [],
      query: '',
    });
    expect(r.localArtists).toHaveLength(MAX_UNIFIED_SECTION_ITEMS);
  });
});
