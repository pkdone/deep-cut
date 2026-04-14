import { z } from 'zod';
import { playlistIdSchema } from './ids.js';

export const llmProviderSchema = z.enum(['openai', 'anthropic', 'none']);
export const spotifyPlaybackModeSchema = z.enum(['connect', 'web-sdk']);

export const appSettingsSchema = z.object({
  localMusicFolders: z.array(z.string().min(1)),
  llmProvider: llmProviderSchema,
  openaiApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  spotifyClientId: z.string().optional(),
  spotifyClientSecret: z.string().optional(),
  /** Playback strategy for Spotify tracks. */
  spotifyPlaybackMode: spotifyPlaybackModeSchema.optional(),
  /**
   * When false, Now Playing only reads cached insights and does not auto-refresh on cache miss.
   * Manual refresh remains available.
   */
  nowPlayingAutoRefreshOnMiss: z.boolean().optional(),
  /** One-time setup prompt dismissal marker. */
  firstRunWizardCompleted: z.boolean().optional(),
  /** Last playlist selected in Search “Add to playlist”; cleared if that playlist is deleted. */
  lastAddToPlaylistId: playlistIdSchema.optional(),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;
export type LlmProvider = z.infer<typeof llmProviderSchema>;
export type SpotifyPlaybackMode = z.infer<typeof spotifyPlaybackModeSchema>;
