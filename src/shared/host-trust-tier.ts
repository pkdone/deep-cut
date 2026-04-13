import type { EnrichmentCandidateTrustTier } from '../domain/schemas/artist-enrichment-reference.js';

function endsWithAny(host: string, suffixes: readonly string[]): boolean {
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/**
 * Stable long-term trust tier for external reference and image candidates.
 * Lower numbers are preferred.
 */
export function hostTrustTierForUrl(url: string): EnrichmentCandidateTrustTier {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (endsWithAny(host, ['wikipedia.org', 'wikimedia.org'])) {
      return 1;
    }
    if (endsWithAny(host, ['britannica.com', 'bandcamp.com'])) {
      return 2;
    }
    if (endsWithAny(host, ['discogs.com', 'allmusic.com'])) {
      return 3;
    }
    if (
      endsWithAny(host, [
        'pitchfork.com',
        'rollingstone.com',
        'theguardian.com',
        'nme.com',
        'stereogum.com',
      ])
    ) {
      return 4;
    }
    return 5;
  } catch {
    return 5;
  }
}
