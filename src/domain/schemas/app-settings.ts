import { z } from 'zod';

export const llmProviderSchema = z.enum(['openai', 'anthropic', 'none']);

export const appSettingsSchema = z.object({
  localMusicFolders: z.array(z.string().min(1)),
  llmProvider: llmProviderSchema,
  openaiApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  spotifyClientId: z.string().optional(),
  spotifyClientSecret: z.string().optional(),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;
export type LlmProvider = z.infer<typeof llmProviderSchema>;
