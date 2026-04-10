import type { Collection } from 'mongodb';
import type { PlaylistRepository } from '../../domain/repositories/playlist-repository.js';
import type { Playlist } from '../../domain/schemas/playlist.js';
import { playlistSchema } from '../../domain/schemas/playlist.js';
import { COLLECTIONS } from './mongo-collections.js';

export class MongoPlaylistRepository implements PlaylistRepository {
  static collectionName = COLLECTIONS.playlists;

  constructor(private readonly coll: Collection) {}

  async findAll(): Promise<readonly Playlist[]> {
    const docs = await this.coll.find({}).toArray();
    return docs.map((d) => playlistSchema.parse(d));
  }

  async findById(id: string): Promise<Playlist | null> {
    const doc = await this.coll.findOne({ playlistId: id });
    return doc ? playlistSchema.parse(doc) : null;
  }

  async save(playlist: Playlist): Promise<void> {
    const parsed = playlistSchema.parse(playlist);
    await this.coll.replaceOne({ playlistId: parsed.playlistId }, parsed, { upsert: true });
  }

  async deleteById(id: string): Promise<void> {
    await this.coll.deleteOne({ playlistId: id });
  }
}
