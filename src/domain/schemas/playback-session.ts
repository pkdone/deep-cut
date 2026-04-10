import { z } from 'zod';
import { playlistIdSchema } from './ids.js';
import { trackRefSchema } from './track-ref.js';

export const playbackContextSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('playlist'), playlistId: playlistIdSchema }),
  z.object({ kind: z.literal('album'), albumKey: z.string().min(1) }),
  z.object({ kind: z.literal('none') }),
]);

export const playbackSessionSchema = z.object({
  currentTrack: trackRefSchema.nullable(),
  positionMs: z.number().int().nonnegative(),
  context: playbackContextSchema,
  updatedAt: z.coerce.date(),
});

export type PlaybackSession = z.infer<typeof playbackSessionSchema>;
export type PlaybackContext = z.infer<typeof playbackContextSchema>;
