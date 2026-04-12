import type { Collection } from 'mongodb';
import type { ArtistEnrichmentRepository } from '../../domain/repositories/artist-enrichment-repository.js';
import type { ArtistEnrichmentCache } from '../../domain/schemas/artist-enrichment.js';
import { artistEnrichmentCacheSchema } from '../../domain/schemas/artist-enrichment.js';
import { COLLECTIONS } from './mongo-collections.js';

/**
 * Mongo-backed cache for LLM artist insights, keyed by catalog artist id (v1: Spotify API artist id).
 */
export class MongoArtistEnrichmentRepository implements ArtistEnrichmentRepository {
  static collectionName = COLLECTIONS.artistEnrichment;

  constructor(private readonly coll: Collection) {}

  async get(enrichmentArtistKey: string): Promise<ArtistEnrichmentCache | null> {
    const doc = await this.coll.findOne({ enrichmentArtistKey });
    return doc ? artistEnrichmentCacheSchema.parse(doc) : null;
  }

  async upsert(entry: ArtistEnrichmentCache): Promise<void> {
    const parsed = artistEnrichmentCacheSchema.parse(entry);
    await this.coll.replaceOne({ enrichmentArtistKey: parsed.enrichmentArtistKey }, parsed, {
      upsert: true,
    });
  }

  async delete(enrichmentArtistKey: string): Promise<void> {
    await this.coll.deleteOne({ enrichmentArtistKey });
  }
}
