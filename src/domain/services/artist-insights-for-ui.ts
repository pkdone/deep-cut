import type { ArtistEnrichmentCache } from '../schemas/artist-enrichment.js';
import type { ArtistEnrichmentPartialPayload } from '../schemas/artist-insights-record.js';
import type { ArtistEnrichmentPayload } from '../schemas/artist-enrichment-payload.js';

/**
 * Resolves the payload object to render on Now Playing (full or partial grounded synthesis).
 */
export function artistInsightsBodyForUi(
  cache: ArtistEnrichmentCache
): ArtistEnrichmentPayload | ArtistEnrichmentPartialPayload | null {
  if (cache.validationStatus === 'valid' && cache.payload != null) {
    return cache.payload;
  }
  if (cache.partialPayload != null) {
    return cache.partialPayload;
  }
  if (cache.payload != null) {
    return cache.payload;
  }
  return null;
}

export function artistInsightsWarningsForUi(cache: ArtistEnrichmentCache): readonly string[] {
  return cache.warnings;
}
