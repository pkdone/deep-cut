import type {
  SpotifyAlbum,
  SpotifyArtist,
  SpotifyPlaylist,
  SpotifySearchResults,
  SpotifyTrack,
} from '../../application/unified-search.js';
import { ExternalServiceError } from '../../shared/errors.js';

export async function spotifySearch(
  accessToken: string,
  query: string
): Promise<SpotifySearchResults> {
  const u = new URL('https://api.spotify.com/v1/search');
  u.searchParams.set('q', query);
  u.searchParams.set('type', 'artist,album,track,playlist');
  u.searchParams.set('limit', '20');
  const res = await fetch(u, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new ExternalServiceError(`Spotify search failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    artists?: { items: { id: string; name: string }[] };
    albums?: {
      items: {
        id: string;
        name: string;
        artists: { name: string }[];
        release_date?: string;
      }[];
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
    };
    playlists?: { items: { id: string; name: string; owner: { display_name: string } }[] };
  };

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

  return { artists, albums, tracks, playlists };
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
