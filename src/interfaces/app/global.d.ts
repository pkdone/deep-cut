import type { SpotifySearchResults } from '../../application/unified-search.js';
import type { AppSettings } from '../../domain/schemas/app-settings.js';
import type { PlaybackSession } from '../../domain/schemas/playback-session.js';
import type { Playlist } from '../../domain/schemas/playlist.js';
import type { TrackRef } from '../../domain/schemas/track-ref.js';

export interface UnifiedSearchPayload {
  query: string;
  sourceFilter: 'all' | 'spotify' | 'local';
}

export interface ArtistEnrichmentPayload {
  spotifyArtistId: string;
  artistName: string;
}

export interface DeepcutApi {
  mongoPing: () => Promise<{ ok: boolean }>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (s: AppSettings) => Promise<{ ok: boolean }>;
  pickMusicFolder: () => Promise<string | null>;
  rescanLibrary: () => Promise<{ ok: boolean }>;
  getLocalTracks: () => Promise<unknown[]>;
  spotifyStartLogin: () => Promise<{ ok: boolean; expiresAtMs: number }>;
  spotifyLogout: () => Promise<{ ok: boolean }>;
  spotifyStatus: () => Promise<{ connected: boolean; expiresAtMs: number }>;
  unifiedSearch: (p: UnifiedSearchPayload) => Promise<unknown>;
  spotifySearchNext: (p: { url: string }) => Promise<SpotifySearchResults>;
  getPlaylists: () => Promise<Playlist[]>;
  savePlaylist: (p: unknown) => Promise<{ ok: boolean }>;
  deletePlaylist: (id: string) => Promise<{ ok: boolean }>;
  addTrackToPlaylist: (p: { playlistId: string; track: TrackRef }) => Promise<{ ok: boolean }>;
  getPlaybackSession: () => Promise<PlaybackSession | null>;
  savePlaybackSession: (p: PlaybackSession) => Promise<{ ok: boolean }>;
  getArtistEnrichment: (
    p: ArtistEnrichmentPayload
  ) => Promise<
    | { kind: 'miss' }
    | { kind: 'stale'; cached: unknown }
    | { kind: 'hit'; cached: unknown }
  >;
  refreshArtistEnrichment: (
    p: ArtistEnrichmentPayload
  ) => Promise<{ ok: boolean; cached: unknown }>;
  getSpotifyAccessToken: () => Promise<string | null>;
  spotifyArtistCatalog: (artistId: string) => Promise<{
    albums: { id: string; name: string; releaseYear?: number }[];
    topTracks: { id: string; name: string; uri: string; durationMs: number }[];
  }>;
  spotifyGetArtist: (id: string) => Promise<{ id: string; name: string } | null>;
  spotifyGetAlbum: (id: string) => Promise<{
    id: string;
    name: string;
    artists: { name: string }[];
    tracks: { items: { id: string; name: string; uri: string; duration_ms: number }[] };
  } | null>;
  onLibraryUpdated: (cb: () => void) => () => void;
}

declare global {
  interface Window {
    deepcut: DeepcutApi;
  }
}

export {};
