import { z } from 'zod';
import { localTrackIdSchema, spotifyIdSchema } from './ids.js';
import type { TrackSource } from './source.js';
import { trackSourceSchema } from './source.js';

export const trackRefSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('spotify'),
    spotifyUri: z.string().min(1),
    spotifyId: spotifyIdSchema,
  }),
  z.object({
    source: z.literal('local'),
    localTrackId: localTrackIdSchema,
    filePath: z.string().min(1),
  }),
]);

export type TrackRef = z.infer<typeof trackRefSchema>;

export function trackRefSource(ref: TrackRef): TrackSource {
  return ref.source;
}

export { trackSourceSchema };
