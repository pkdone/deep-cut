import { z } from 'zod';
import { playbackSessionSchema } from '../../../domain/schemas/playback-session.js';

export const playbackSessionDocumentSchema = z.object({
  _id: z.literal('singleton'),
}).merge(playbackSessionSchema);

export type PlaybackSessionDocument = z.infer<typeof playbackSessionDocumentSchema>;
