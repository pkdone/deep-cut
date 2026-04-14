import { z } from 'zod';
import { playlistIdSchema } from './ids.js';
import { trackRefSchema } from './track-ref.js';

export const playlistEntrySchema = z.object({
  entryId: z.string().uuid(),
  track: trackRefSchema,
  addedAt: z.coerce.date(),
});

export const playlistNodeTypeSchema = z.enum(['folder', 'playlist']);
export const playlistNodeIdSchema = z.string().uuid();

const playlistTreeNodeShape = z.object({
  nodeId: playlistNodeIdSchema,
  name: z.string().min(1).max(256),
  type: playlistNodeTypeSchema,
  playlistId: playlistIdSchema.optional(),
  order: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export interface PlaylistTreeNode extends z.infer<typeof playlistTreeNodeShape> {
  children: PlaylistTreeNode[];
}

export const playlistTreeNodeSchema: z.ZodType<PlaylistTreeNode> = playlistTreeNodeShape.extend({
  children: z.lazy(() => z.array(playlistTreeNodeSchema)).default([]),
});

export const playlistTreeSchema = z.array(playlistTreeNodeSchema);

export const playlistSchema = z.object({
  playlistId: playlistIdSchema,
  name: z.string().min(1).max(256),
  entries: z.array(playlistEntrySchema),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Playlist = z.infer<typeof playlistSchema>;
export type PlaylistEntry = z.infer<typeof playlistEntrySchema>;
