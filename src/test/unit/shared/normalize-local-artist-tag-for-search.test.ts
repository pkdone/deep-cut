import { normalizeLocalArtistTagForSearch } from '../../../shared/normalize-local-artist-tag-for-search.js';

describe('normalizeLocalArtistTagForSearch', () => {
  it('returns first segment before feat', () => {
    expect(normalizeLocalArtistTagForSearch('Radiohead feat. Thom Yorke')).toBe('Radiohead');
  });

  it('returns first segment before slash', () => {
    expect(normalizeLocalArtistTagForSearch('Artist A / Artist B')).toBe('Artist A');
  });

  it('trims whitespace', () => {
    expect(normalizeLocalArtistTagForSearch('  Björk  ')).toBe('Björk');
  });

  it('returns empty for blank', () => {
    expect(normalizeLocalArtistTagForSearch('   ')).toBe('');
  });
});
