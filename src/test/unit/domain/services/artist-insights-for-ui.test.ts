import {
  artistInsightsBodyForUi,
  artistInsightsWarningsForUi,
} from '../../../../domain/services/artist-insights-for-ui.js';
import type { ArtistInsightsRecord } from '../../../../domain/schemas/artist-insights-record.js';

const synopsis320 =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Curabitur pretium tincidunt lacus cras placerat augue ut sagittis. Integer vitae magna vel risus dapibus pharetra nec vel ipsum.';

const tenTopTracks = Array.from({ length: 10 }, (_, i) => ({
  title: `Song ${String(i + 1)}`,
  rank: i + 1,
  releaseYear: 1990 + i,
}));

describe('artistInsightsBodyForUi', () => {
  it('returns full payload when validation is valid', () => {
    const cache: ArtistInsightsRecord = {
      enrichmentArtistKey: 'k',
      artistName: 'A',
      payload: {
        synopsis: synopsis320,
        rankedAlbums: [],
        topTracks: tenTopTracks,
        liveAlbums: [],
        bestOfCompilations: [],
        raritiesCompilations: [],
        bandMembers: [],
      },
      partialPayload: undefined,
      validationStatus: 'valid',
      warnings: [],
      cachedAt: new Date(),
      provider: 'openai',
      docSchemaVersion: 5,
    };
    const body = artistInsightsBodyForUi(cache);
    expect(body?.synopsis).toBe(synopsis320);
  });

  it('returns partial payload when validation is partial', () => {
    const cache: ArtistInsightsRecord = {
      enrichmentArtistKey: 'k',
      artistName: 'A',
      payload: undefined,
      partialPayload: {
        synopsis: 'short',
        rankedAlbums: [],
        topTracks: [],
        liveAlbums: [],
        bestOfCompilations: [],
        raritiesCompilations: [],
        bandMembers: [],
      },
      validationStatus: 'partial',
      warnings: ['w'],
      cachedAt: new Date(),
      provider: 'anthropic',
      docSchemaVersion: 5,
    };
    const body = artistInsightsBodyForUi(cache);
    expect(body?.synopsis).toBe('short');
    expect(artistInsightsWarningsForUi(cache)).toEqual(['w']);
  });
});
