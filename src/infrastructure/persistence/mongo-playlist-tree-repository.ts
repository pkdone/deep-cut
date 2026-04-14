import type { Collection } from 'mongodb';
import { z } from 'zod';
import type { PlaylistTreeNode } from '../../domain/schemas/playlist.js';
import { playlistTreeSchema } from '../../domain/schemas/playlist.js';
import { COLLECTIONS } from './mongo-collections.js';

const playlistTreeDocumentSchema = z.object({
  _id: z.literal('singleton'),
  nodes: playlistTreeSchema,
  updatedAt: z.coerce.date(),
});

type PlaylistTreeDocument = z.infer<typeof playlistTreeDocumentSchema>;

export class MongoPlaylistTreeRepository {
  static collectionName = COLLECTIONS.playlistTree;

  constructor(private readonly coll: Collection) {}

  async getTree(): Promise<PlaylistTreeNode[]> {
    const doc = await this.coll.findOne({ _id: 'singleton' });
    if (doc === null) {
      return [];
    }
    const parsed = playlistTreeDocumentSchema.parse(doc);
    return parsed.nodes;
  }

  async saveTree(nodes: PlaylistTreeNode[]): Promise<void> {
    const next: PlaylistTreeDocument = playlistTreeDocumentSchema.parse({
      _id: 'singleton',
      nodes,
      updatedAt: new Date(),
    });
    await this.coll.replaceOne({ _id: 'singleton' }, next, { upsert: true });
  }
}
