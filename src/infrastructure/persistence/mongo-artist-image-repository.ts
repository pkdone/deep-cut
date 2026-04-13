import type { Collection } from 'mongodb';
import type { ArtistImageRepository } from '../../domain/repositories/artist-image-repository.js';
import type { ArtistImageCacheRecord } from '../../domain/schemas/artist-image-cache-record.js';
import { artistImageCacheRecordSchema } from '../../domain/schemas/artist-image-cache-record.js';
import { COLLECTIONS } from './mongo-collections.js';
import { parseArtistImageDocument } from './parse-artist-image-document.js';

export class MongoArtistImageRepository implements ArtistImageRepository {
  static collectionName = COLLECTIONS.artistImage;

  constructor(private readonly coll: Collection) {}

  async get(enrichmentArtistKey: string): Promise<ArtistImageCacheRecord | null> {
    const doc = await this.coll.findOne({ enrichmentArtistKey });
    if (doc == null) {
      return null;
    }
    return parseArtistImageDocument(doc);
  }

  async upsert(entry: ArtistImageCacheRecord): Promise<void> {
    const parsed = artistImageCacheRecordSchema.parse(entry);
    await this.coll.replaceOne({ enrichmentArtistKey: parsed.enrichmentArtistKey }, parsed, {
      upsert: true,
    });
  }

  async delete(enrichmentArtistKey: string): Promise<void> {
    await this.coll.deleteOne({ enrichmentArtistKey });
  }
}
