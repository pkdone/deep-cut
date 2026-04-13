import { parseArtistInsightsDocument } from '../../../../infrastructure/persistence/parse-artist-insights-document.js';

const synopsis320 =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Curabitur pretium tincidunt lacus cras placerat augue ut sagittis. Integer vitae magna vel risus dapibus pharetra nec vel ipsum.';

const tenTopTracks = Array.from({ length: 10 }, (_, i) => ({
  title: `Song ${String(i + 1)}`,
  rank: i + 1,
  releaseYear: 1990 + i,
  primaryReference: undefined,
}));

describe('parseArtistInsightsDocument', () => {
  it('parses current insights records', () => {
    const raw = {
      enrichmentArtistKey: 'key1',
      artistName: 'Artist',
      payload: {
        synopsis: synopsis320,
        rankedAlbums: [{ name: 'LP', releaseYear: 1990, rank: 1, primaryReference: undefined }],
        topTracks: tenTopTracks,
        liveAlbums: [],
        bestOfCompilations: [],
        raritiesCompilations: [],
        bandMembers: [],
        artistHeroImage: undefined,
      },
      partialPayload: undefined,
      validationStatus: 'valid',
      warnings: [],
      cachedAt: new Date().toISOString(),
      provider: 'openai',
      docSchemaVersion: 8,
      evidence: undefined,
      retrievalModel: undefined,
      synthesisModel: undefined,
      lastRetrievalAt: undefined,
      lastSynthesisAt: undefined,
      primaryReference: undefined,
    };
    const r = parseArtistInsightsDocument(raw);
    expect(r.validationStatus).toBe('valid');
    expect(r.docSchemaVersion).toBe(8);
    expect(r.payload?.synopsis).toBe(synopsis320);
  });
});
