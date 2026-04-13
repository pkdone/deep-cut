import type { EvidenceSource } from '../../../domain/schemas/artist-evidence.js';
import { selectPrimaryReferenceUrl } from '../../../shared/select-primary-reference-url.js';

function src(partial: Partial<EvidenceSource> & Pick<EvidenceSource, 'sourceId' | 'snippet'>): EvidenceSource {
  return {
    sourceId: partial.sourceId,
    url: partial.url,
    title: partial.title,
    publisher: partial.publisher,
    retrievedAt: partial.retrievedAt ?? new Date(),
    sourceKind: partial.sourceKind ?? 'search_snippet',
    snippet: partial.snippet,
    ratingValue: partial.ratingValue,
    ratingScale: partial.ratingScale,
    appliesToType: partial.appliesToType,
    appliesToName: partial.appliesToName,
    confidence: partial.confidence,
  };
}

describe('selectPrimaryReferenceUrl', () => {
  it('returns undefined when no https URLs', () => {
    expect(selectPrimaryReferenceUrl([])).toBeUndefined();
    expect(
      selectPrimaryReferenceUrl([
        src({
          sourceId: 'a',
          url: 'http://example.com/x',
          snippet: 'x',
        }),
      ])
    ).toBeUndefined();
  });

  it('prefers en.wikipedia.org over other hosts', () => {
    const wiki = src({
      sourceId: 'w',
      url: 'https://en.wikipedia.org/wiki/Fugazi',
      snippet: 'Short',
    });
    const other = src({
      sourceId: 'o',
      url: 'https://example.com/article',
      snippet: 'Longer snippet text here for the other source',
    });
    expect(selectPrimaryReferenceUrl([other, wiki])).toBe('https://en.wikipedia.org/wiki/Fugazi');
  });

  it('prefers main artist article over discography list even with shorter snippet', () => {
    const main = src({
      sourceId: '1',
      url: 'https://en.wikipedia.org/wiki/Fugazi',
      snippet: 'aa',
    });
    const discog = src({
      sourceId: '2',
      url: 'https://en.wikipedia.org/wiki/Fugazi_discography',
      snippet: 'aaa',
    });
    expect(selectPrimaryReferenceUrl([discog, main])).toBe('https://en.wikipedia.org/wiki/Fugazi');
  });

  it('prefers band article over album article on Wikipedia', () => {
    const albumPage = src({
      sourceId: 'album',
      url: 'https://en.wikipedia.org/wiki/13_Songs_%28Fugazi_album%29?utm_source=openai',
      snippet: 'x'.repeat(400),
    });
    const bandPage = src({
      sourceId: 'band',
      url: 'https://en.wikipedia.org/wiki/Fugazi',
      snippet: 'short',
    });
    expect(selectPrimaryReferenceUrl([albumPage, bandPage], { artistDisplayName: 'Fugazi' })).toBe(
      'https://en.wikipedia.org/wiki/Fugazi',
    );
  });

  it('excludes Special: and File: Wikipedia paths', () => {
    const bad = src({
      sourceId: 'b',
      url: 'https://en.wikipedia.org/wiki/Special:Search',
      snippet: 'long ' + 'x'.repeat(100),
    });
    const good = src({
      sourceId: 'g',
      url: 'https://en.wikipedia.org/wiki/Rock_music',
      snippet: 'y',
    });
    expect(selectPrimaryReferenceUrl([bad, good])).toBe('https://en.wikipedia.org/wiki/Rock_music');
  });

  it('uses non-English wikipedia when no en article', () => {
    const de = src({
      sourceId: 'd',
      url: 'https://de.wikipedia.org/wiki/Fugazi',
      snippet: 'bio',
    });
    const web = src({
      sourceId: 'w',
      url: 'https://example.com/foo',
      snippet: 'bar',
    });
    expect(selectPrimaryReferenceUrl([web, de])).toBe('https://de.wikipedia.org/wiki/Fugazi');
  });

  it('skips blocklisted hosts in fallback', () => {
    const g = src({
      sourceId: 'g',
      url: 'https://www.google.com/search?q=fugazi',
      snippet: 's',
    });
    const ok = src({
      sourceId: 'o',
      url: 'https://example.com/bio',
      snippet: 't',
    });
    expect(selectPrimaryReferenceUrl([g, ok])).toBe('https://example.com/bio');
  });
});
