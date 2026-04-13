import type { ArtistInsightsRecord } from '../../domain/schemas/artist-insights-record.js';
import { artistInsightsRecordSchema } from '../../domain/schemas/artist-insights-record.js';

/**
 * Parse MongoDB document into `ArtistInsightsRecord`.
 */
export function parseArtistInsightsDocument(raw: unknown): ArtistInsightsRecord {
  const parsed = artistInsightsRecordSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }

  throw parsed.error;
}
