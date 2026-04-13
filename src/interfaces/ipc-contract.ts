import { z } from 'zod';
import { enrichmentArtistKeySchema } from '../domain/schemas/artist-enrichment.js';
import { appSettingsSchema } from '../domain/schemas/app-settings.js';
import { playbackSessionSchema } from '../domain/schemas/playback-session.js';
import { trackRefSchema } from '../domain/schemas/track-ref.js';

export const IPC_CHANNELS = {
  mongoPing: 'deepcut:mongoPing',
  getSettings: 'deepcut:getSettings',
  saveSettings: 'deepcut:saveSettings',
  pickMusicFolder: 'deepcut:pickMusicFolder',
  rescanLibrary: 'deepcut:rescanLibrary',
  getLibraryScanState: 'deepcut:getLibraryScanState',
  getLocalTracks: 'deepcut:getLocalTracks',
  spotifyStartLogin: 'deepcut:spotifyStartLogin',
  spotifyLogout: 'deepcut:spotifyLogout',
  spotifyStatus: 'deepcut:spotifyStatus',
  spotifySearch: 'deepcut:spotifySearch',
  unifiedSearch: 'deepcut:unifiedSearch',
  spotifySearchNext: 'deepcut:spotifySearchNext',
  getPlaylists: 'deepcut:getPlaylists',
  savePlaylist: 'deepcut:savePlaylist',
  deletePlaylist: 'deepcut:deletePlaylist',
  addTrackToPlaylist: 'deepcut:addTrackToPlaylist',
  getPlaybackSession: 'deepcut:getPlaybackSession',
  savePlaybackSession: 'deepcut:savePlaybackSession',
  getArtistEnrichment: 'deepcut:getArtistEnrichment',
  refreshArtistEnrichment: 'deepcut:refreshArtistEnrichment',
  resolvePlaybackArtistForEnrichment: 'deepcut:resolvePlaybackArtistForEnrichment',
  /** Run a minimal LLM request; updates cached result in main. */
  llmPing: 'deepcut:llmPing',
  /** Last llmPing result without making a network call. */
  getLlmPingResult: 'deepcut:getLlmPingResult',
  getSpotifyAccessToken: 'deepcut:getSpotifyAccessToken',
  spotifyArtistCatalog: 'deepcut:spotifyArtistCatalog',
  spotifyGetArtist: 'deepcut:spotifyGetArtist',
  spotifyGetAlbum: 'deepcut:spotifyGetAlbum',
  onLibraryUpdated: 'deepcut:onLibraryUpdated',
  /** Main → renderer: payload `{ scanning: boolean }`. */
  libraryScanState: 'deepcut:libraryScanState',
  /** Open https URL in the system default browser (main process). */
  openExternalUrl: 'deepcut:openExternalUrl',
} as const;

/** Renderer → main: open a single https URL externally. */
export const openExternalUrlPayload = z
  .string()
  .url()
  .refine((u) => {
    try {
      return new URL(u).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Only https URLs are allowed');

export const saveSettingsPayload = appSettingsSchema;
export const savePlaybackPayload = playbackSessionSchema;

export const unifiedSearchEntityTypeSchema = z.enum(['artists', 'albums', 'tracks']);

export const unifiedSearchPayload = z.object({
  query: z.string(),
  sourceFilter: z.enum(['all', 'spotify', 'local']),
  entityType: unifiedSearchEntityTypeSchema.default('artists'),
});

export const spotifySearchNextPayload = z.object({
  url: z.string().url(),
});

export const spotifySearchPayload = z.object({
  query: z.string(),
});

export const artistEnrichmentPayload = z.object({
  enrichmentArtistKey: enrichmentArtistKeySchema,
  artistName: z.string().min(1),
});

export const resolvePlaybackArtistForEnrichmentPayload = z.object({
  trackRef: trackRefSchema,
  primaryArtistDisplayName: z.string().min(1).optional(),
});

export const savePlaylistPayload = z.object({
  playlistId: z.string().uuid(),
  name: z.string().min(1),
  entries: z.array(
    z.object({
      entryId: z.string().uuid(),
      track: trackRefSchema,
      addedAt: z.coerce.date(),
    })
  ),
});

export const addTrackToPlaylistPayload = z.object({
  playlistId: z.string().uuid(),
  track: trackRefSchema,
});
