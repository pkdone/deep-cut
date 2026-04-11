import { z } from 'zod';
import { playlistIdSchema } from './ids.js';
import { trackRefSchema } from './track-ref.js';

export const playlistEntrySchema = z.object({
  entryId: z.string().uuid(),
  track: trackRefSchema,
  addedAt: z.coerce.date(),
});

export const playlistSchema = z.object({
  playlistId: playlistIdSchema,
  name: z.string().min(1).max(256),
  entries: z.array(playlistEntrySchema),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Playlist = z.infer<typeof playlistSchema>;
export type PlaylistEntry = z.infer<typeof playlistEntrySchema>;
