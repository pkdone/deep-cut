import { normalizeArtistNameForEnrichmentKey } from '../../../shared/normalize-artist-name-for-enrichment-key.js';

describe('normalizeArtistNameForEnrichmentKey', () => {
  it('collapses whitespace and lowercases', () => {
    expect(normalizeArtistNameForEnrichmentKey('  Björk  ')).toBe('björk');
  });

  it('matches same artist after NFKC', () => {
    expect(normalizeArtistNameForEnrichmentKey('Radiohead')).toBe(normalizeArtistNameForEnrichmentKey('radiohead'));
  });

  it('returns empty for blank', () => {
    expect(normalizeArtistNameForEnrichmentKey('   ')).toBe('');
  });
});
