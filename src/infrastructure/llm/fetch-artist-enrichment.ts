import type { ArtistEnrichmentCache } from '../../domain/schemas/artist-enrichment.js';
import type { LlmProvider } from '../../domain/schemas/app-settings.js';
import { runGroundedArtistEnrichment } from './grounded/run-grounded-artist-enrichment.js';

/**
 * Grounded artist enrichment: web retrieval then evidence-only JSON synthesis (OpenAI or Anthropic).
 */
export async function fetchArtistEnrichment(params: {
  provider: Exclude<LlmProvider, 'none'>;
  apiKey: string;
  enrichmentArtistKey: string;
  artistDisplayName: string;
}): Promise<ArtistEnrichmentCache> {
  return runGroundedArtistEnrichment({
    provider: params.provider,
    apiKey: params.apiKey,
    enrichmentArtistKey: params.enrichmentArtistKey,
    artistDisplayName: params.artistDisplayName,
  });
}
