/** PRD: 30-day artist enrichment cache */
export const ENRICHMENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function isEnrichmentFresh(cachedAt: Date): boolean {
  return Date.now() - cachedAt.getTime() < ENRICHMENT_TTL_MS;
}
