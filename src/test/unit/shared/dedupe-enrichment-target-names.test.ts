import { dedupeEnrichmentTargetNames } from '../../../shared/dedupe-enrichment-target-names.js';

describe('dedupeEnrichmentTargetNames', () => {
  it('returns empty for empty input', () => {
    expect(dedupeEnrichmentTargetNames([])).toEqual([]);
  });

  it('drops duplicate normalized keys keeping first display string', () => {
    expect(dedupeEnrichmentTargetNames(['Foo', 'foo', 'FOO'])).toEqual(['Foo']);
  });

  it('treats whitespace variants as duplicates', () => {
    expect(dedupeEnrichmentTargetNames(['  The Wall  ', 'The Wall'])).toEqual(['  The Wall  ']);
  });

  it('keeps distinct titles', () => {
    expect(dedupeEnrichmentTargetNames(['A', 'B', 'A'])).toEqual(['A', 'B']);
  });

  it('skips empty-only names', () => {
    expect(dedupeEnrichmentTargetNames(['', '   ', 'x'])).toEqual(['x']);
  });
});
