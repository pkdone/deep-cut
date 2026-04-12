import type {
  SpotifyAlbum,
  SpotifyArtist,
  SpotifyPagingLinks,
  SpotifyPlaylist,
  SpotifySearchResults,
  SpotifyTrack,
} from '../../application/unified-search.js';
import { ExternalServiceError } from '../../shared/errors.js';

function pagingFrom(
  next: string | null | undefined,
  previous: string | null | undefined
): SpotifyPagingLinks {
  return {
    next: next ?? null,
    previous: previous ?? null,
  };
}

/** Maps Spotify Web API /v1/search JSON to our result shape (shared by initial search and `next` URLs). */
export function mapSpotifySearchJson(data: {
  artists?: {
    items: { id: string; name: string }[];
    next?: string | null;
    previous?: string | null;
  };
  albums?: {
    items: {
      id: string;
      name: string;
      artists: { name: string }[];
      release_date?: string;
    }[];
    next?: string | null;
    previous?: string | null;
  };
  tracks?: {
    items: {
      id: string;
      name: string;
      uri: string;
      duration_ms: number;
      artists: { name: string }[];
      album: { name: string };
    }[];
    next?: string | null;
    previous?: string | null;
  };
  playlists?: {
    items: { id: string; name: string; owner: { display_name: string } }[];
    next?: string | null;
    previous?: string | null;
  };
}): SpotifySearchResults {
  const artists: SpotifyArtist[] = (data.artists?.items ?? []).map((a) => ({
    id: a.id,
    name: a.name,
  }));
  const albums: SpotifyAlbum[] = (data.albums?.items ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    artists: a.artists.map((x) => x.name),
    releaseYear: a.release_date ? Number.parseInt(a.release_date.slice(0, 4), 10) : undefined,
  }));
  const tracks: SpotifyTrack[] = (data.tracks?.items ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    uri: t.uri,
    durationMs: t.duration_ms,
    artists: t.artists.map((x) => x.name),
    albumName: t.album.name,
  }));
  const playlists: SpotifyPlaylist[] = (data.playlists?.items ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    owner: p.owner.display_name,
  }));

  return {
    artists,
    albums,
    tracks,
    playlists,
    paging: {
      artists: pagingFrom(data.artists?.next, data.artists?.previous),
      albums: pagingFrom(data.albums?.next, data.albums?.previous),
      tracks: pagingFrom(data.tracks?.next, data.tracks?.previous),
      playlists: pagingFrom(data.playlists?.next, data.playlists?.previous),
    },
  };
}

export function assertSpotifyApiSearchUrl(url: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ExternalServiceError('Invalid Spotify search URL');
  }
  if (u.protocol !== 'https:') {
    throw new ExternalServiceError('Spotify search URL must use HTTPS');
  }
  if (u.hostname !== 'api.spotify.com') {
    throw new ExternalServiceError('Spotify search URL must target api.spotify.com');
  }
  if (!u.pathname.startsWith('/v1/')) {
    throw new ExternalServiceError('Spotify search URL must be under /v1/');
  }
}

export async function fetchSpotifySearchUrl(
  accessToken: string,
  url: string
): Promise<SpotifySearchResults> {
  assertSpotifyApiSearchUrl(url);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new ExternalServiceError(`Spotify search page failed: ${res.status}`);
  }
  const data = (await res.json()) as Parameters<typeof mapSpotifySearchJson>[0];
  return mapSpotifySearchJson(data);
}

/** Spotify Web API `type` query value for `/v1/search` (single-entity search). */
export type SpotifySearchApiEntityType = 'artist' | 'album' | 'track';

export async function spotifySearch(
  accessToken: string,
  query: string,
  spotifyType: SpotifySearchApiEntityType
): Promise<SpotifySearchResults> {
  const u = new URL('https://api.spotify.com/v1/search');
  u.searchParams.set('q', query);
  u.searchParams.set('type', spotifyType);
  u.searchParams.set('limit', '20');
  const res = await fetch(u, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new ExternalServiceError(`Spotify search failed: ${res.status}`);
  }
  const data = (await res.json()) as Parameters<typeof mapSpotifySearchJson>[0];
  return mapSpotifySearchJson(data);
}

export async function getSpotifyTrackPrimaryArtist(
  accessToken: string,
  trackId: string
): Promise<{ id: string; name: string }> {
  const res = await fetch(`https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new ExternalServiceError(`Spotify track failed: ${res.status}`);
  }
  const data = (await res.json()) as { artists?: { id: string; name: string }[] };
  const first = data.artists?.[0];
  if (first === undefined || first.id === '' || first.name === '') {
    throw new ExternalServiceError('Spotify track has no primary artist');
  }
  return { id: first.id, name: first.name };
}

export async function searchArtistFirstMatch(
  accessToken: string,
  query: string
): Promise<SpotifyArtist | null> {
  const q = query.trim();
  if (q === '') {
    return null;
  }
  const r = await spotifySearch(accessToken, q, 'artist');
  return r.artists[0] ?? null;
}

export async function getArtistTopTracks(
  accessToken: string,
  artistId: string
): Promise<{ id: string; name: string; uri: string; durationMs: number }[]> {
  const res = await fetch(
    `https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=US`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new ExternalServiceError(`Spotify artist top tracks failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    tracks: { id: string; name: string; uri: string; duration_ms: number }[];
  };
  return data.tracks.map((t) => ({
    id: t.id,
    name: t.name,
    uri: t.uri,
    durationMs: t.duration_ms,
  }));
}

export async function getArtistAlbums(accessToken: string, artistId: string): Promise<
  {
    id: string;
    name: string;
    releaseYear?: number;
  }[]
> {
  const res = await fetch(
    `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album&market=US&limit=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new ExternalServiceError(`Spotify artist albums failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    items: { id: string; name: string; release_date?: string }[];
  };
  return data.items.map((a) => ({
    id: a.id,
    name: a.name,
    releaseYear: a.release_date ? Number.parseInt(a.release_date.slice(0, 4), 10) : undefined,
  }));
}
