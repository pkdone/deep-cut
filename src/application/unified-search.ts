import { tracksLikelySameSong } from '../domain/services/fuzzy-match.js';
import type { LocalTrack } from '../domain/schemas/local-track.js';

const DEBOUNCE_MS = 280;
const CAP = 20;

export interface SpotifyArtist {
  id: string;
  name: string;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  artists: string[];
  releaseYear?: number;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: string[];
  albumName: string;
  durationMs: number;
  uri: string;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  owner: string;
}

export interface SpotifySearchResults {
  artists: SpotifyArtist[];
  albums: SpotifyAlbum[];
  tracks: SpotifyTrack[];
  playlists: SpotifyPlaylist[];
}

export interface UnifiedSearchRow {
  readonly kind: 'merged-track';
  readonly primaryTitle: string;
  readonly subtitle?: string;
  readonly artistLine: string;
  readonly albumLine: string;
  readonly spotify?: { id: string; uri: string; durationMs: number };
  readonly local?: { localTrackId: string; filePath: string; durationMs: number };
}

export interface LocalSearchAlbum {
  readonly artist: string;
  readonly album: string;
  readonly trackCount: number;
}

export interface UnifiedSearchResult {
  readonly artists: SpotifyArtist[];
  readonly albums: SpotifyAlbum[];
  readonly tracks: UnifiedSearchRow[];
  readonly playlists: SpotifyPlaylist[];
  readonly localArtists: { name: string; trackCount: number }[];
  readonly localAlbums: LocalSearchAlbum[];
}

export function getSearchDebounceMs(): number {
  return DEBOUNCE_MS;
}

export function getSearchCap(): number {
  return CAP;
}

export function buildUnifiedSearch(params: {
  spotify: SpotifySearchResults | null;
  locals: readonly LocalTrack[];
  appPlaylists: { id: string; name: string }[];
  query: string;
}): UnifiedSearchResult {
  const q = params.query.trim().toLowerCase();
  const localsFiltered =
    q === ''
      ? [...params.locals]
      : params.locals.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.artist.toLowerCase().includes(q) ||
            t.album.toLowerCase().includes(q)
        );

  const spotify = params.spotify;
  const spotifyArtists = (spotify?.artists ?? []).slice(0, CAP);
  const spotifyAlbums = (spotify?.albums ?? []).slice(0, CAP);
  const spotifyTracks = (spotify?.tracks ?? []).slice(0, CAP);
  const spotifyPlaylists = (spotify?.playlists ?? []).slice(0, CAP);

  const localArtistMap = new Map<string, number>();
  const localAlbumMap = new Map<string, { artist: string; album: string; trackCount: number }>();
  for (const t of localsFiltered) {
    localArtistMap.set(t.artist, (localArtistMap.get(t.artist) ?? 0) + 1);
    const albumKey = `${t.artist}\0${t.album}`;
    const cur = localAlbumMap.get(albumKey);
    if (cur !== undefined) {
      cur.trackCount += 1;
    } else {
      localAlbumMap.set(albumKey, { artist: t.artist, album: t.album, trackCount: 1 });
    }
  }
  const localArtists = [...localArtistMap.entries()]
    .map(([name, trackCount]) => ({ name, trackCount }))
    .filter((a) => q === '' || a.name.toLowerCase().includes(q))
    .sort((a, b) => b.trackCount - a.trackCount || a.name.localeCompare(b.name))
    .slice(0, CAP);

  const localAlbums = [...localAlbumMap.values()]
    .filter(
      (x) =>
        q === '' ||
        x.artist.toLowerCase().includes(q) ||
        x.album.toLowerCase().includes(q)
    )
    .sort(
      (a, b) =>
        b.trackCount - a.trackCount ||
        a.album.localeCompare(b.album) ||
        a.artist.localeCompare(b.artist)
    )
    .slice(0, CAP);

  const usedLocal = new Set<string>();
  const rows: UnifiedSearchRow[] = [];

  for (const st of spotifyTracks) {
    let match: LocalTrack | undefined;
    for (const lt of localsFiltered) {
      if (usedLocal.has(lt.localTrackId)) {
        continue;
      }
      if (
        tracksLikelySameSong({
          titleA: st.name,
          artistA: st.artists[0] ?? '',
          titleB: lt.title,
          artistB: lt.artist,
        })
      ) {
        match = lt;
        break;
      }
    }
    if (match) {
      usedLocal.add(match.localTrackId);
      const subtitle =
        match.title !== st.name || match.artist !== (st.artists[0] ?? '')
          ? `${match.title} · ${match.artist}`
          : undefined;
      rows.push({
        kind: 'merged-track',
        primaryTitle: st.name,
        subtitle,
        artistLine: st.artists.join(', '),
        albumLine: st.albumName,
        spotify: {
          id: st.id,
          uri: st.uri,
          durationMs: st.durationMs,
        },
        local: {
          localTrackId: match.localTrackId,
          filePath: match.filePath,
          durationMs: match.durationMs,
        },
      });
    } else {
      rows.push({
        kind: 'merged-track',
        primaryTitle: st.name,
        artistLine: st.artists.join(', '),
        albumLine: st.albumName,
        spotify: {
          id: st.id,
          uri: st.uri,
          durationMs: st.durationMs,
        },
      });
    }
  }

  for (const lt of localsFiltered) {
    if (usedLocal.has(lt.localTrackId)) {
      continue;
    }
    rows.push({
      kind: 'merged-track',
      primaryTitle: lt.title,
      artistLine: lt.artist,
      albumLine: lt.album,
      local: {
        localTrackId: lt.localTrackId,
        filePath: lt.filePath,
        durationMs: lt.durationMs,
      },
    });
  }

  const playlists: SpotifyPlaylist[] = [...spotifyPlaylists];
  for (const p of params.appPlaylists) {
    if (q === '' || p.name.toLowerCase().includes(q)) {
      playlists.push({ id: p.id, name: p.name, owner: 'DeepCut' });
    }
  }

  return {
    artists: spotifyArtists,
    albums: spotifyAlbums,
    tracks: rows.slice(0, CAP),
    playlists,
    localArtists,
    localAlbums,
  };
}
