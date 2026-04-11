import { z } from 'zod';
import { appSettingsSchema } from '../domain/schemas/app-settings.js';
import { playbackSessionSchema } from '../domain/schemas/playback-session.js';
import { trackRefSchema } from '../domain/schemas/track-ref.js';

export const IPC_CHANNELS = {
  mongoPing: 'deepcut:mongoPing',
  getSettings: 'deepcut:getSettings',
  saveSettings: 'deepcut:saveSettings',
  pickMusicFolder: 'deepcut:pickMusicFolder',
  rescanLibrary: 'deepcut:rescanLibrary',
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
  getSpotifyAccessToken: 'deepcut:getSpotifyAccessToken',
  spotifyArtistCatalog: 'deepcut:spotifyArtistCatalog',
  spotifyGetArtist: 'deepcut:spotifyGetArtist',
  spotifyGetAlbum: 'deepcut:spotifyGetAlbum',
  onLibraryUpdated: 'deepcut:onLibraryUpdated',
} as const;

export const saveSettingsPayload = appSettingsSchema;
export const savePlaybackPayload = playbackSessionSchema;

export const unifiedSearchPayload = z.object({
  query: z.string(),
  sourceFilter: z.enum(['all', 'spotify', 'local']),
});

export const spotifySearchNextPayload = z.object({
  url: z.string().url(),
});

export const spotifySearchPayload = z.object({
  query: z.string(),
});

export const artistEnrichmentPayload = z.object({
  spotifyArtistId: z.string().min(1),
  artistName: z.string().min(1),
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
