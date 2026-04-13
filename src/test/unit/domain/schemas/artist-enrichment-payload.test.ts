import {
  artistEnrichmentPayloadSchema,
  bandMemberEntrySchema,
} from '../../../../domain/schemas/artist-enrichment.js';

const synopsis320 =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Curabitur pretium tincidunt lacus cras placerat augue ut sagittis. Integer vitae magna vel risus dapibus pharetra nec vel ipsum.';

const tenTopTracks = Array.from({ length: 10 }, (_, i) => ({
  title: `Song ${String(i + 1)}`,
  rank: i + 1,
  releaseYear: 1990 + i,
  primaryReference: undefined,
}));

describe('artistEnrichmentPayloadSchema', () => {
  it('accepts ranked categorized albums and band members with tenure periods', () => {
    const parsed = artistEnrichmentPayloadSchema.parse({
      synopsis: synopsis320,
      rankedAlbums: [
        { name: 'First LP', releaseYear: 1988, rank: 1, primaryReference: undefined },
        { name: 'Second LP', releaseYear: 1990, rank: 2, primaryReference: undefined },
      ],
      topTracks: tenTopTracks,
      liveAlbums: [
        { name: 'Live at the Club', releaseYear: 2001, rank: 1, primaryReference: undefined },
      ],
      bestOfCompilations: [
        { name: 'Greatest Hits', releaseYear: 2010, rank: 1, primaryReference: undefined },
        { name: 'Early Years', releaseYear: 2005, rank: 2, primaryReference: undefined },
      ],
      raritiesCompilations: [],
      bandMembers: [
        {
          name: 'Jane Doe',
          instruments: ['vocals', 'guitar'],
          periods: [{ startYear: 1987, endYear: 2003 }],
        },
        {
          name: 'Boomer',
          instruments: ['bass'],
          periods: [
            { startYear: 1990, endYear: 1995 },
            { startYear: 1998, endYear: 2001 },
          ],
        },
        {
          name: 'Still Here',
          instruments: ['drums'],
          periods: [{ startYear: 2010, endYear: null }],
        },
      ],
      artistHeroImage: undefined,
    });
    expect(parsed.liveAlbums[0]?.rank).toBe(1);
    expect(parsed.bandMembers[1]?.periods).toHaveLength(2);
  });

  it('rejects synopsis shorter than minimum', () => {
    expect(() =>
      artistEnrichmentPayloadSchema.parse({
        synopsis: 'Too short.',
        rankedAlbums: [],
        topTracks: tenTopTracks,
        liveAlbums: [],
        bestOfCompilations: [],
        raritiesCompilations: [],
        bandMembers: [
          {
            name: 'X',
            instruments: [],
            periods: [{ startYear: 2000, endYear: 2010 }],
          },
        ],
        artistHeroImage: undefined,
      })
    ).toThrow();
  });

  it('rejects live album list with more than three entries', () => {
    expect(() =>
      artistEnrichmentPayloadSchema.parse({
        synopsis: synopsis320,
        rankedAlbums: [],
        topTracks: tenTopTracks,
        liveAlbums: [
          { name: 'A', releaseYear: 2000, rank: 1, primaryReference: undefined },
          { name: 'B', releaseYear: 2001, rank: 2, primaryReference: undefined },
          { name: 'C', releaseYear: 2002, rank: 3, primaryReference: undefined },
          { name: 'D', releaseYear: 2003, rank: 1, primaryReference: undefined },
        ],
        bestOfCompilations: [],
        raritiesCompilations: [],
        bandMembers: [
          {
            name: 'X',
            instruments: [],
            periods: [{ startYear: 2000, endYear: 2010 }],
          },
        ],
        artistHeroImage: undefined,
      })
    ).toThrow();
  });

  it('rejects topTracks without exactly ten items', () => {
    expect(() =>
      artistEnrichmentPayloadSchema.parse({
        synopsis: synopsis320,
        rankedAlbums: [],
        topTracks: tenTopTracks.slice(0, 9),
        liveAlbums: [],
        bestOfCompilations: [],
        raritiesCompilations: [],
        bandMembers: [
          {
            name: 'X',
            instruments: [],
            periods: [{ startYear: 2000, endYear: 2010 }],
          },
        ],
        artistHeroImage: undefined,
      })
    ).toThrow();
  });

  it('rejects tenure when endYear is before startYear', () => {
    expect(() =>
      bandMemberEntrySchema.parse({
        name: 'Bad',
        instruments: [],
        periods: [{ startYear: 2000, endYear: 1990 }],
      })
    ).toThrow();
  });
});
