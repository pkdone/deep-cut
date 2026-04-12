/**
 * Canonical artist enrichment payload shapes and persisted insights row re-exports.
 * Payload primitives live in `artist-enrichment-payload.ts` to avoid circular imports with `artist-insights-record`.
 */
export * from './artist-enrichment-payload.js';
export {
  artistInsightsRecordSchema,
  type ArtistInsightsRecord,
} from './artist-insights-record.js';

export type { ArtistInsightsRecord as ArtistEnrichmentCache } from './artist-insights-record.js';
