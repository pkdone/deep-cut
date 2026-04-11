import type { Collection } from 'mongodb';
import type { ArtistEnrichmentRepository } from '../../domain/repositories/artist-enrichment-repository.js';
import type { ArtistEnrichmentCache } from '../../domain/schemas/artist-enrichment.js';
import { artistEnrichmentCacheSchema } from '../../domain/schemas/artist-enrichment.js';
import { COLLECTIONS } from './mongo-collections.js';

export class MongoArtistEnrichmentRepository implements ArtistEnrichmentRepository {
  static collectionName = COLLECTIONS.artistEnrichment;

  constructor(private readonly coll: Collection) {}

  async get(spotifyArtistId: string): Promise<ArtistEnrichmentCache | null> {
    const doc = await this.coll.findOne({ spotifyArtistId });
    return doc ? artistEnrichmentCacheSchema.parse(doc) : null;
  }

  async upsert(entry: ArtistEnrichmentCache): Promise<void> {
    const parsed = artistEnrichmentCacheSchema.parse(entry);
    await this.coll.replaceOne({ spotifyArtistId: parsed.spotifyArtistId }, parsed, {
      upsert: true,
    });
  }

  async delete(spotifyArtistId: string): Promise<void> {
    await this.coll.deleteOne({ spotifyArtistId });
  }
}
