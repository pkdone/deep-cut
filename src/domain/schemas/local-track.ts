import { z } from 'zod';
import { localTrackIdSchema } from './ids.js';
import { trackSourceSchema } from './source.js';

export const localTrackSchema = z.object({
  localTrackId: localTrackIdSchema,
  source: z.literal('local'),
  filePath: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  album: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  artHash: z.string().optional(),
});

export type LocalTrack = z.infer<typeof localTrackSchema>;

export { trackSourceSchema };
