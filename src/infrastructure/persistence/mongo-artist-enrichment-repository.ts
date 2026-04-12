import type { Collection } from 'mongodb';
import type { ArtistEnrichmentRepository } from '../../domain/repositories/artist-enrichment-repository.js';
import type { ArtistEnrichmentCache } from '../../domain/schemas/artist-enrichment.js';
import { artistInsightsRecordSchema } from '../../domain/schemas/artist-insights-record.js';
import { COLLECTIONS } from './mongo-collections.js';
import { parseArtistInsightsDocument } from './parse-artist-insights-document.js';

/**
 * Mongo-backed cache for LLM artist insights, keyed by normalized artist key.
 */
export class MongoArtistEnrichmentRepository implements ArtistEnrichmentRepository {
  static collectionName = COLLECTIONS.artistEnrichment;

  constructor(private readonly coll: Collection) {}

  async get(enrichmentArtistKey: string): Promise<ArtistEnrichmentCache | null> {
    const doc = await this.coll.findOne({ enrichmentArtistKey });
    if (!doc) {
      return null;
    }
    return parseArtistInsightsDocument(doc);
  }

  async upsert(entry: ArtistEnrichmentCache): Promise<void> {
    const parsed = artistInsightsRecordSchema.parse(entry);
    await this.coll.replaceOne({ enrichmentArtistKey: parsed.enrichmentArtistKey }, parsed, {
      upsert: true,
    });
  }

  async delete(enrichmentArtistKey: string): Promise<void> {
    await this.coll.deleteOne({ enrichmentArtistKey });
  }
}
