import { tracksLikelySameSong } from '../domain/services/fuzzy-match.js';
import type { LocalTrack } from '../domain/schemas/local-track.js';

const DEBOUNCE_MS = 280;

/** Rows shown per page in Search UI (fixed). */
export const SEARCH_PAGE_SIZE = 20;

/**
 * Safety cap on how many items we return per section from unified search (local aggregates + merged
 * tracks) to keep IPC payloads bounded for large libraries.
 */
export const MAX_UNIFIED_SECTION_ITEMS = 500;

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

export interface SpotifyPagingLinks {
  readonly next: string | null;
  readonly previous: string | null;
}

export interface SpotifySearchResults {
  readonly artists: SpotifyArtist[];
  readonly albums: SpotifyAlbum[];
  readonly tracks: SpotifyTrack[];
  readonly playlists: SpotifyPlaylist[];
  readonly paging: {
    readonly artists: SpotifyPagingLinks;
    readonly albums: SpotifyPagingLinks;
    readonly tracks: SpotifyPagingLinks;
    readonly playlists: SpotifyPagingLinks;
  };
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

export interface UnifiedSearchSpotifyPaging {
  readonly artists: SpotifyPagingLinks;
  readonly albums: SpotifyPagingLinks;
  readonly tracks: SpotifyPagingLinks;
  readonly playlists: SpotifyPagingLinks;
}

export interface UnifiedSearchResult {
  readonly artists: SpotifyArtist[];
  readonly albums: SpotifyAlbum[];
  readonly tracks: UnifiedSearchRow[];
  readonly playlists: SpotifyPlaylist[];
  readonly localArtists: { name: string; trackCount: number }[];
  readonly localAlbums: LocalSearchAlbum[];
  /** Present when Spotify search ran; drives "load more" for Spotify-backed sections. */
  readonly spotifyPaging: UnifiedSearchSpotifyPaging | null;
  /** Local track ids already paired with a Spotify row in `tracks` (for merging additional Spotify pages). */
  readonly usedLocalTrackIds: readonly string[];
}

/** Search UI entity mode (Artists / Albums / Tracks). */
export type UnifiedSearchEntityType = 'artists' | 'albums' | 'tracks';

const NULL_SPOTIFY_PAGING: SpotifyPagingLinks = { next: null, previous: null };

function alphaByName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function mergeArtistRowsAlphabetically(params: {
  readonly spotifyArtists: readonly SpotifyArtist[];
  readonly localArtists: readonly { name: string; trackCount: number }[];
}): {
  readonly spotifyArtists: SpotifyArtist[];
  readonly localArtists: { name: string; trackCount: number }[];
} {
  const merged = [
    ...params.spotifyArtists.map((artist) => ({ source: 'spotify' as const, artist })),
    ...params.localArtists.map((artist) => ({ source: 'local' as const, artist })),
  ].sort((a, b) => {
    const left = a.source === 'spotify' ? a.artist.name : a.artist.name;
    const right = b.source === 'spotify' ? b.artist.name : b.artist.name;
    return alphaByName(left, right);
  });
  return {
    spotifyArtists: merged
      .filter((entry): entry is { source: 'spotify'; artist: SpotifyArtist } => entry.source === 'spotify')
      .map((entry) => entry.artist),
    localArtists: merged
      .filter(
        (entry): entry is { source: 'local'; artist: { name: string; trackCount: number } } =>
          entry.source === 'local'
      )
      .map((entry) => entry.artist),
  };
}

function mergeAlbumRowsAlphabetically(params: {
  readonly spotifyAlbums: readonly SpotifyAlbum[];
  readonly localAlbums: readonly LocalSearchAlbum[];
}): {
  readonly spotifyAlbums: SpotifyAlbum[];
  readonly localAlbums: LocalSearchAlbum[];
} {
  const merged = [
    ...params.spotifyAlbums.map((album) => ({ source: 'spotify' as const, album })),
    ...params.localAlbums.map((album) => ({ source: 'local' as const, album })),
  ].sort((a, b) => {
    const left = a.source === 'spotify' ? a.album.name : a.album.album;
    const right = b.source === 'spotify' ? b.album.name : b.album.album;
    return alphaByName(left, right);
  });
  return {
    spotifyAlbums: merged
      .filter((entry): entry is { source: 'spotify'; album: SpotifyAlbum } => entry.source === 'spotify')
      .map((entry) => entry.album),
    localAlbums: merged
      .filter((entry): entry is { source: 'local'; album: LocalSearchAlbum } => entry.source === 'local')
      .map((entry) => entry.album),
  };
}

function sortTracksAlphabetically(rows: readonly UnifiedSearchRow[]): UnifiedSearchRow[] {
  return [...rows].sort((a, b) => alphaByName(a.primaryTitle, b.primaryTitle));
}

export function getSearchDebounceMs(): number {
  return DEBOUNCE_MS;
}

export function getSearchCap(): number {
  return SEARCH_PAGE_SIZE;
}

/** Same filtering as `buildUnifiedSearch` for local tracks (for client-side merge of extra Spotify track pages). */
export function filterLocalTracksByQuery(
  locals: readonly LocalTrack[],
  query: string
): LocalTrack[] {
  return filterLocalsByQuery(locals, query);
}

/**
 * Merges a batch of Spotify tracks with local files; mutates `usedLocal` for IDs already matched.
 */
export function mergeAdditionalSpotifyTracks(
  spotifyTracks: readonly SpotifyTrack[],
  localsFiltered: readonly LocalTrack[],
  usedLocal: Set<string>
): UnifiedSearchRow[] {
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
  return rows;
}

/**
 * Split merged track rows into [Spotify-linked…] then [local-only…] (order preserved from buildUnifiedSearch).
 */
export function splitUnifiedTracksForPagination(rows: readonly UnifiedSearchRow[]): {
  readonly spotifyLinked: UnifiedSearchRow[];
  readonly localOnly: UnifiedSearchRow[];
} {
  const i = rows.findIndex((r) => r.spotify === undefined);
  if (i === -1) {
    return { spotifyLinked: [...rows], localOnly: [] };
  }
  return {
    spotifyLinked: rows.slice(0, i),
    localOnly: rows.slice(i),
  };
}

function filterLocalsByQuery(locals: readonly LocalTrack[], query: string): LocalTrack[] {
  const q = query.trim().toLowerCase();
  if (q === '') {
    return [...locals];
  }
  return locals.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.album.toLowerCase().includes(q)
  );
}

function buildUnifiedSearchFull(params: {
  spotify: SpotifySearchResults | null;
  locals: readonly LocalTrack[];
  appPlaylists: { id: string; name: string }[];
  query: string;
}): UnifiedSearchResult {
  const q = params.query.trim().toLowerCase();
  const localsFiltered = filterLocalsByQuery(params.locals, params.query);

  const spotify = params.spotify;
  const spotifyArtists = spotify?.artists ?? [];
  const spotifyAlbums = spotify?.albums ?? [];
  const spotifyTracks = spotify?.tracks ?? [];
  const spotifyPlaylistsFromApi = spotify?.playlists ?? [];

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
  const localArtistsRaw = [...localArtistMap.entries()]
    .map(([name, trackCount]) => ({ name, trackCount }))
    .filter((a) => q === '' || a.name.toLowerCase().includes(q))
    .sort((a, b) => alphaByName(a.name, b.name))
    .slice(0, MAX_UNIFIED_SECTION_ITEMS);

  const localAlbumsRaw = [...localAlbumMap.values()]
    .filter(
      (x) =>
        q === '' ||
        x.artist.toLowerCase().includes(q) ||
        x.album.toLowerCase().includes(q)
    )
    .sort((a, b) => alphaByName(a.album, b.album) || alphaByName(a.artist, b.artist))
    .slice(0, MAX_UNIFIED_SECTION_ITEMS);

  const artistsMerged = mergeArtistRowsAlphabetically({
    spotifyArtists,
    localArtists: localArtistsRaw,
  });
  const albumsMerged = mergeAlbumRowsAlphabetically({
    spotifyAlbums,
    localAlbums: localAlbumsRaw,
  });

  const usedLocal = new Set<string>();
  const spotifyRows = mergeAdditionalSpotifyTracks(spotifyTracks, localsFiltered, usedLocal);
  const rows: UnifiedSearchRow[] = [...spotifyRows];

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

  const cappedRows = sortTracksAlphabetically(rows).slice(0, MAX_UNIFIED_SECTION_ITEMS);

  const playlists: SpotifyPlaylist[] = [...spotifyPlaylistsFromApi];
  for (const p of params.appPlaylists) {
    if (q === '' || p.name.toLowerCase().includes(q)) {
      playlists.push({ id: p.id, name: p.name, owner: 'DeepCut' });
    }
  }

  const playlistCap = playlists.slice(0, MAX_UNIFIED_SECTION_ITEMS);

  return {
    artists: artistsMerged.spotifyArtists,
    albums: albumsMerged.spotifyAlbums,
    tracks: cappedRows,
    playlists: playlistCap,
    localArtists: artistsMerged.localArtists,
    localAlbums: albumsMerged.localAlbums,
    spotifyPaging: spotify?.paging ?? null,
    usedLocalTrackIds: [...usedLocal],
  };
}

function buildUnifiedSearchArtistsOnly(params: {
  spotify: SpotifySearchResults | null;
  locals: readonly LocalTrack[];
  query: string;
}): UnifiedSearchResult {
  const q = params.query.trim().toLowerCase();
  const localsFiltered = filterLocalsByQuery(params.locals, params.query);

  const localArtistMap = new Map<string, number>();
  for (const t of localsFiltered) {
    localArtistMap.set(t.artist, (localArtistMap.get(t.artist) ?? 0) + 1);
  }
  const localArtistsRaw = [...localArtistMap.entries()]
    .map(([name, trackCount]) => ({ name, trackCount }))
    .filter((a) => q === '' || a.name.toLowerCase().includes(q))
    .sort((a, b) => alphaByName(a.name, b.name))
    .slice(0, MAX_UNIFIED_SECTION_ITEMS);

  const spotify = params.spotify;
  const spotifyArtists = (spotify?.artists ?? []).slice().sort((a, b) => alphaByName(a.name, b.name));
  const artistsMerged = mergeArtistRowsAlphabetically({ spotifyArtists, localArtists: localArtistsRaw });

  return {
    artists: artistsMerged.spotifyArtists,
    albums: [],
    tracks: [],
    playlists: [],
    localArtists: artistsMerged.localArtists,
    localAlbums: [],
    spotifyPaging: spotify
      ? {
          artists: spotify.paging.artists,
          albums: NULL_SPOTIFY_PAGING,
          tracks: NULL_SPOTIFY_PAGING,
          playlists: NULL_SPOTIFY_PAGING,
        }
      : null,
    usedLocalTrackIds: [],
  };
}

function buildUnifiedSearchAlbumsOnly(params: {
  spotify: SpotifySearchResults | null;
  locals: readonly LocalTrack[];
  query: string;
}): UnifiedSearchResult {
  const q = params.query.trim().toLowerCase();
  const localsFiltered = filterLocalsByQuery(params.locals, params.query);

  const localAlbumMap = new Map<string, { artist: string; album: string; trackCount: number }>();
  for (const t of localsFiltered) {
    const albumKey = `${t.artist}\0${t.album}`;
    const cur = localAlbumMap.get(albumKey);
    if (cur !== undefined) {
      cur.trackCount += 1;
    } else {
      localAlbumMap.set(albumKey, { artist: t.artist, album: t.album, trackCount: 1 });
    }
  }
  const localAlbumsRaw = [...localAlbumMap.values()]
    .filter(
      (x) =>
        q === '' ||
        x.artist.toLowerCase().includes(q) ||
        x.album.toLowerCase().includes(q)
    )
    .sort((a, b) => alphaByName(a.album, b.album) || alphaByName(a.artist, b.artist))
    .slice(0, MAX_UNIFIED_SECTION_ITEMS);

  const spotify = params.spotify;
  const spotifyAlbums = (spotify?.albums ?? []).slice().sort((a, b) => alphaByName(a.name, b.name));
  const albumsMerged = mergeAlbumRowsAlphabetically({ spotifyAlbums, localAlbums: localAlbumsRaw });

  return {
    artists: [],
    albums: albumsMerged.spotifyAlbums,
    tracks: [],
    playlists: [],
    localArtists: [],
    localAlbums: albumsMerged.localAlbums,
    spotifyPaging: spotify
      ? {
          artists: NULL_SPOTIFY_PAGING,
          albums: spotify.paging.albums,
          tracks: NULL_SPOTIFY_PAGING,
          playlists: NULL_SPOTIFY_PAGING,
        }
      : null,
    usedLocalTrackIds: [],
  };
}

function buildUnifiedSearchTracksOnly(params: {
  spotify: SpotifySearchResults | null;
  locals: readonly LocalTrack[];
  appPlaylists: { id: string; name: string }[];
  query: string;
}): UnifiedSearchResult {
  const q = params.query.trim().toLowerCase();
  const localsFiltered = filterLocalsByQuery(params.locals, params.query);

  const spotify = params.spotify;
  const spotifyTracks = spotify?.tracks ?? [];
  const spotifyPlaylistsFromApi = spotify?.playlists ?? [];

  const usedLocal = new Set<string>();
  const spotifyRows = mergeAdditionalSpotifyTracks(spotifyTracks, localsFiltered, usedLocal);
  const rows: UnifiedSearchRow[] = [...spotifyRows];

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

  const cappedRows = sortTracksAlphabetically(rows).slice(0, MAX_UNIFIED_SECTION_ITEMS);

  const playlists: SpotifyPlaylist[] = [...spotifyPlaylistsFromApi];
  for (const p of params.appPlaylists) {
    if (q === '' || p.name.toLowerCase().includes(q)) {
      playlists.push({ id: p.id, name: p.name, owner: 'DeepCut' });
    }
  }
  const playlistCap = playlists.slice(0, MAX_UNIFIED_SECTION_ITEMS);

  return {
    artists: [],
    albums: [],
    tracks: cappedRows,
    playlists: playlistCap,
    localArtists: [],
    localAlbums: [],
    spotifyPaging: spotify
      ? {
          artists: NULL_SPOTIFY_PAGING,
          albums: NULL_SPOTIFY_PAGING,
          tracks: spotify.paging.tracks,
          playlists: spotify.paging.playlists,
        }
      : null,
    usedLocalTrackIds: [...usedLocal],
  };
}

export function buildUnifiedSearch(params: {
  spotify: SpotifySearchResults | null;
  locals: readonly LocalTrack[];
  appPlaylists: { id: string; name: string }[];
  query: string;
  entityType?: UnifiedSearchEntityType;
}): UnifiedSearchResult {
  const { spotify, locals, appPlaylists, query, entityType } = params;
  if (entityType === undefined) {
    return buildUnifiedSearchFull({ spotify, locals, appPlaylists, query });
  }
  if (entityType === 'artists') {
    return buildUnifiedSearchArtistsOnly({ spotify, locals, query });
  }
  if (entityType === 'albums') {
    return buildUnifiedSearchAlbumsOnly({ spotify, locals, query });
  }
  return buildUnifiedSearchTracksOnly({ spotify, locals, appPlaylists, query });
}
