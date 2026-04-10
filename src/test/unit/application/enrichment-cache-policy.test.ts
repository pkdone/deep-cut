import { ENRICHMENT_TTL_MS, isEnrichmentFresh } from '../../../application/enrichment-cache-policy.js';

describe('enrichment-cache-policy', () => {
  it('has 30 day ttl', () => {
    expect(ENRICHMENT_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('detects fresh cache', () => {
    expect(isEnrichmentFresh(new Date())).toBe(true);
    expect(isEnrichmentFresh(new Date(Date.now() - ENRICHMENT_TTL_MS - 1000))).toBe(false);
  });
});
