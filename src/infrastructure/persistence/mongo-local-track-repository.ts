import type { Collection } from 'mongodb';
import type { LocalTrackRepository } from '../../domain/repositories/local-track-repository.js';
import type { LocalTrack } from '../../domain/schemas/local-track.js';
import { localTrackSchema } from '../../domain/schemas/local-track.js';
import { COLLECTIONS } from './mongo-collections.js';

export class MongoLocalTrackRepository implements LocalTrackRepository {
  static collectionName = COLLECTIONS.localTracks;

  constructor(private readonly coll: Collection) {}

  async findAll(): Promise<readonly LocalTrack[]> {
    const docs = await this.coll.find({}).toArray();
    return docs.map((d) => localTrackSchema.parse(d));
  }

  async findByLocalTrackId(localTrackId: string): Promise<LocalTrack | null> {
    const doc = await this.coll.findOne({ localTrackId });
    return doc !== null ? localTrackSchema.parse(doc) : null;
  }

  async upsertMany(tracks: readonly LocalTrack[]): Promise<void> {
    for (const t of tracks) {
      const existing = await this.coll.findOne({ filePath: t.filePath });
      const parsedExisting = existing !== null ? localTrackSchema.safeParse(existing) : null;
      const localTrackId =
        parsedExisting?.success === true ? parsedExisting.data.localTrackId : t.localTrackId;
      const parsed = localTrackSchema.parse({ ...t, localTrackId });
      await this.coll.replaceOne({ filePath: parsed.filePath }, parsed, { upsert: true });
    }
  }

  async removeByIds(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.coll.deleteMany({ localTrackId: { $in: [...ids] } });
  }
}
