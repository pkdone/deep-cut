import { artistEnrichmentPartialPayloadSchema } from '../../../../domain/schemas/artist-insights-record.js';
import { artistEnrichmentSelectionPayloadSchema } from '../../../../domain/schemas/artist-enrichment-payload.js';
import {
  normalizeArtistSynthesisJson,
  unwrapArtistSynthesisObject,
} from '../../../../infrastructure/llm/grounded/normalize-artist-synthesis-json.js';

const synopsis320 =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Curabitur pretium tincidunt lacus cras placerat augue ut sagittis. Integer vitae magna vel risus dapibus pharetra nec vel ipsum.';

describe('normalizeArtistSynthesisJson', () => {
  it('unwraps a nested payload and coerces numeric strings', () => {
    const raw = {
      data: {
        synopsis: synopsis320,
        rankedAlbums: [
          {
            name: 'A',
            releaseYear: '1988',
            rank: '1',
            primaryReferenceCandidateId: 'ref-1',
          },
        ],
        topTracks: Array.from({ length: 11 }, (_, i) => ({
          title: `T${String(i)}`,
          rank: String(i + 1),
          releaseYear: '1990',
          primaryReferenceCandidateId: `track-${String(i)}`,
        })),
        liveAlbums: [{ name: 'Live', releaseYear: '2000', rank: '5' }],
        bestOfCompilations: [],
        raritiesCompilations: [],
        bandMembers: [
          {
            name: 'Member',
            instruments: 'vocals, guitar',
            periods: [{ startYear: '1990', endYear: '1995' }],
          },
        ],
      },
    };
    const n = normalizeArtistSynthesisJson(raw);
    expect(n).not.toBeNull();
    expect(typeof n).toBe('object');
    const full = artistEnrichmentSelectionPayloadSchema.safeParse(n);
    expect(full.success).toBe(true);
    if (full.success) {
      expect(full.data.topTracks).toHaveLength(10);
      expect(full.data.liveAlbums[0]?.rank).toBeLessThanOrEqual(3);
    }
  });

  it('repairs endYear before startYear in band periods', () => {
    const n = normalizeArtistSynthesisJson({
      synopsis: synopsis320,
      rankedAlbums: [],
      topTracks: Array.from({ length: 10 }, (_, i) => ({
        title: `Song ${String(i + 1)}`,
        rank: i + 1,
        releaseYear: 1990,
      })),
      liveAlbums: [],
      bestOfCompilations: [],
      raritiesCompilations: [],
      bandMembers: [
        {
          name: 'X',
          instruments: [],
          periods: [{ startYear: 2000, endYear: 1990 }],
        },
      ],
    });
    const partial = artistEnrichmentPartialPayloadSchema.safeParse(n);
    expect(partial.success).toBe(true);
  });

  it('drops band members with no valid periods', () => {
    const n = normalizeArtistSynthesisJson({
      synopsis: synopsis320,
      rankedAlbums: [],
      topTracks: Array.from({ length: 10 }, (_, i) => ({
        title: `Song ${String(i + 1)}`,
        rank: i + 1,
      })),
      liveAlbums: [],
      bestOfCompilations: [],
      raritiesCompilations: [],
      bandMembers: [{ name: 'Bad', instruments: [], periods: [] }],
    });
    const partial = artistEnrichmentPartialPayloadSchema.safeParse(n);
    expect(partial.success).toBe(true);
    if (partial.success) {
      expect(partial.data.bandMembers).toHaveLength(0);
    }
  });
});

describe('unwrapArtistSynthesisObject', () => {
  it('returns inner object when wrapped under artist', () => {
    const inner = { synopsis: 'x' };
    expect(unwrapArtistSynthesisObject({ artist: inner })).toBe(inner);
  });
});
