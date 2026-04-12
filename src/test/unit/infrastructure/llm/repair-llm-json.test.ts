import { repairMalformedLlmJsonQuotes } from '../../../../infrastructure/llm/repair-llm-json.js';

describe('repairMalformedLlmJsonQuotes', () => {
  it('fixes spurious backslashes before quotes (model double-escape)', () => {
    const bad =
      '{"synopsis":"x","rankedAlbums":[{"name":\\\\"Instrument Soundtrack\\\\","releaseYear":1999,"rank":1}]}';
    const fixed = repairMalformedLlmJsonQuotes(bad);
    expect(() => {
      JSON.parse(fixed);
    }).not.toThrow();
    const o: { rankedAlbums: { name: string }[] } = JSON.parse(fixed) as {
      rankedAlbums: { name: string }[];
    };
    expect(o.rankedAlbums[0].name).toBe('Instrument Soundtrack');
  });

  it('does not alter valid escaped quotes inside strings (single backslash)', () => {
    const ok = '{"synopsis":"She said \\"hello\\" to the crowd."}';
    const out = repairMalformedLlmJsonQuotes(ok);
    expect(out).toBe(ok);
    const parsed: { synopsis: string } = JSON.parse(out) as { synopsis: string };
    expect(parsed.synopsis).toBe('She said "hello" to the crowd.');
  });
});
