import { z } from 'zod';
import { playlistIdSchema } from './ids.js';

export const llmProviderSchema = z.enum(['openai', 'anthropic', 'none']);

export const appSettingsSchema = z.object({
  localMusicFolders: z.array(z.string().min(1)),
  llmProvider: llmProviderSchema,
  openaiApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  spotifyClientId: z.string().optional(),
  spotifyClientSecret: z.string().optional(),
  /** Last playlist selected in Search “Add to playlist”; cleared if that playlist is deleted. */
  lastAddToPlaylistId: playlistIdSchema.optional(),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;
export type LlmProvider = z.infer<typeof llmProviderSchema>;
