import { bigramSimilarity, normaliseForMatch, tracksLikelySameSong } from '../../../../domain/services/fuzzy-match.js';

describe('fuzzy-match', () => {
  it('normalises strings', () => {
    expect(normaliseForMatch('  The Beatles ')).toBe('thebeatles');
  });

  it('computes bigram similarity', () => {
    expect(bigramSimilarity('hello', 'hello')).toBe(1);
    expect(bigramSimilarity('abc', 'xyz')).toBeLessThan(0.5);
  });

  it('matches similar track titles', () => {
    expect(
      tracksLikelySameSong({
        titleA: 'Hey Jude',
        artistA: 'The Beatles',
        titleB: 'Hey Jude',
        artistB: 'Beatles',
      })
    ).toBe(true);
  });
});
