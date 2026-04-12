import type { ArtistInsightsRecord } from '../../domain/schemas/artist-insights-record.js';
import {
  artistEnrichmentCacheV4Schema,
  artistInsightsRecordSchema,
} from '../../domain/schemas/artist-insights-record.js';

/**
 * Parse MongoDB document into `ArtistInsightsRecord`, migrating legacy v4 rows.
 */
export function parseArtistInsightsDocument(raw: unknown): ArtistInsightsRecord {
  const v4 = artistEnrichmentCacheV4Schema.safeParse(raw);
  if (v4.success) {
    const d = v4.data;
    return {
      enrichmentArtistKey: d.enrichmentArtistKey,
      artistName: d.artistName,
      payload: d.payload,
      partialPayload: undefined,
      validationStatus: 'valid',
      warnings: [],
      cachedAt: d.cachedAt,
      provider: d.provider,
      docSchemaVersion: 4,
      evidence: undefined,
      retrievalModel: undefined,
      synthesisModel: undefined,
      lastRetrievalAt: undefined,
      lastSynthesisAt: undefined,
    };
  }

  const v5 = artistInsightsRecordSchema.safeParse(raw);
  if (v5.success) {
    return v5.data;
  }

  throw v5.error;
}
