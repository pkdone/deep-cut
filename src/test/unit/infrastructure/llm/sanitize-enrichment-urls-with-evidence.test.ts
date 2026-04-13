import type { ArtistEvidenceBundle } from '../../../../domain/schemas/artist-evidence.js';
import type { ArtistEnrichmentPayload } from '../../../../domain/schemas/artist-enrichment-payload.js';
import {
  collectEvidenceUrlCorpus,
  isUrlAllowedByEvidence,
  sanitizeEnrichmentUrlsWithEvidence,
  stripTrackingParamsFromUrl,
} from '../../../../infrastructure/llm/grounded/sanitize-enrichment-urls-with-evidence.js';

const synopsis320 =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Curabitur pretium tincidunt lacus cras placerat augue ut sagittis. Integer vitae magna vel risus dapibus pharetra nec vel ipsum.';

const tenTopTracks = Array.from({ length: 10 }, (_, i) => ({
  title: `Song ${String(i + 1)}`,
  rank: i + 1,
  releaseYear: 1990 + i,
  primaryReference: undefined,
}));

function minimalBundle(overrides: Partial<ArtistEvidenceBundle>): ArtistEvidenceBundle {
  const base: ArtistEvidenceBundle = {
    artistKey: 'k',
    artistDisplayName: 'Artist',
    requestedAt: new Date(),
    retrievalProvider: 'openai',
    retrievalQueries: ['q'],
    sources: [],
    referenceCandidates: [],
    imageCandidates: [],
    normalizedSynopsisFacts: [],
    normalizedAlbumHints: [],
    normalizedTrackHints: [],
    warnings: [],
    status: 'ok',
    retrievalDigest: '',
  };
  return { ...base, ...overrides };
}

describe('sanitize-enrichment-urls-with-evidence', () => {
  it('stripTrackingParamsFromUrl removes utm_*', () => {
    expect(
      stripTrackingParamsFromUrl('https://example.com/a?utm_source=x&b=1'),
    ).toBe('https://example.com/a?b=1');
  });

  it('collectEvidenceUrlCorpus includes source URLs and URLs in digest text', () => {
    const good = 'https://upload.wikimedia.org/wikipedia/commons/1/2/photo.jpg';
    const bundle = minimalBundle({
      sources: [
        {
          sourceId: 's1',
          url: 'https://en.wikipedia.org/wiki/Test_Band',
          retrievedAt: new Date(),
          sourceKind: 'search_snippet',
          snippet: 'x',
        },
      ],
      retrievalDigest: `See also ${good} for more.`,
    });
    const c = collectEvidenceUrlCorpus(bundle);
    expect(c.has('https://en.wikipedia.org/wiki/test_band')).toBe(true);
    expect(isUrlAllowedByEvidence(good, c)).toBe(true);
  });

  it('sanitizeEnrichmentUrlsWithEvidence keeps work-level Wikipedia URLs, strips utm, and drops bad URLs', () => {
    const allowed = 'https://en.wikipedia.org/wiki/Test_Album_(album)';
    const bundle = minimalBundle({
      sources: [
        {
          sourceId: 's1',
          url: allowed,
          retrievedAt: new Date(),
          sourceKind: 'search_snippet',
          snippet: 'x',
        },
      ],
      retrievalDigest: 'text',
    });
    const payload: ArtistEnrichmentPayload = {
      synopsis: synopsis320,
      rankedAlbums: [
        {
          name: 'Test Album',
          releaseYear: 1990,
          rank: 1,
          primaryReference: {
            candidateId: 'ref-1',
            url: `${allowed}?utm_source=openai`,
            host: 'en.wikipedia.org',
            trustTier: 1,
          },
        },
      ],
      topTracks: tenTopTracks.map((t, i) =>
        i === 0
          ? {
              ...t,
              primaryReference: {
                candidateId: 'bad',
                url: 'https://evil.example/phish',
                host: 'evil.example',
                trustTier: 5,
              },
            }
          : { ...t, primaryReference: undefined },
      ),
      liveAlbums: [],
      bestOfCompilations: [],
      raritiesCompilations: [],
      bandMembers: [
        {
          name: 'M',
          instruments: [],
          periods: [{ startYear: 2000, endYear: 2010 }],
        },
      ],
      artistHeroImage: {
        candidateId: 'img-1',
        imageUrl: 'https://upload.wikimedia.org/x/y.jpg',
        host: 'upload.wikimedia.org',
        trustTier: 1,
      },
    };
    const out = sanitizeEnrichmentUrlsWithEvidence(payload, bundle);
    expect(out.rankedAlbums[0]?.primaryReference?.url).toBe(allowed);
    expect(out.topTracks[0]?.primaryReference?.url).toBe('https://evil.example/phish');
    expect(out.artistHeroImage?.imageUrl).toBe('https://upload.wikimedia.org/x/y.jpg');
  });

  it('drops Wikipedia discography URLs from per-row links even when in evidence', () => {
    const discog = 'https://en.wikipedia.org/wiki/Fugazi_discography';
    const bundle = minimalBundle({
      sources: [
        {
          sourceId: 's1',
          url: discog,
          retrievedAt: new Date(),
          sourceKind: 'search_snippet',
          snippet: 'x',
        },
      ],
      retrievalDigest: '',
    });
    const payload: ArtistEnrichmentPayload = {
      synopsis: synopsis320,
      rankedAlbums: [
        {
          name: 'Repeater',
          releaseYear: 1990,
          rank: 1,
          primaryReference: {
            candidateId: 'discog',
            url: `${discog}?utm_source=openai`,
            host: 'en.wikipedia.org',
            trustTier: 1,
          },
        },
      ],
      topTracks: tenTopTracks,
      liveAlbums: [],
      bestOfCompilations: [],
      raritiesCompilations: [],
      bandMembers: [
        {
          name: 'M',
          instruments: [],
          periods: [{ startYear: 2000, endYear: 2010 }],
        },
      ],
    };
    const out = sanitizeEnrichmentUrlsWithEvidence(payload, bundle);
    expect(out.rankedAlbums[0]?.primaryReference).toBeUndefined();
  });

  it('keeps plain Wikipedia work title URLs when title matches the row target', () => {
    const workUrl = 'https://en.wikipedia.org/wiki/In_on_the_Kill_Taker';
    const bundle = minimalBundle({
      sources: [
        {
          sourceId: 's1',
          url: workUrl,
          retrievedAt: new Date(),
          sourceKind: 'search_snippet',
          snippet: 'x',
        },
      ],
      retrievalDigest: '',
    });
    const payload: ArtistEnrichmentPayload = {
      synopsis: synopsis320,
      rankedAlbums: [
        {
          name: 'In on the Kill Taker',
          releaseYear: 1993,
          rank: 1,
          primaryReference: {
            candidateId: 'work',
            url: `${workUrl}?utm_source=openai`,
            host: 'en.wikipedia.org',
            trustTier: 1,
          },
        },
      ],
      topTracks: tenTopTracks,
      liveAlbums: [],
      bestOfCompilations: [],
      raritiesCompilations: [],
      bandMembers: [
        {
          name: 'M',
          instruments: [],
          periods: [{ startYear: 2000, endYear: 2010 }],
        },
      ],
    };
    const out = sanitizeEnrichmentUrlsWithEvidence(payload, bundle);
    expect(out.rankedAlbums[0]?.primaryReference?.url).toBe(workUrl);
  });

  it('allows hero image URL when it appears only in retrievalDigest', () => {
    const img = 'https://upload.wikimedia.org/wikipedia/commons/a/b/face.jpg';
    const bundle = minimalBundle({
      sources: [],
      retrievalDigest: `Portrait: ${img}`,
    });
    const payload: ArtistEnrichmentPayload = {
      synopsis: synopsis320,
      rankedAlbums: [],
      topTracks: tenTopTracks,
      liveAlbums: [],
      bestOfCompilations: [],
      raritiesCompilations: [],
      bandMembers: [
        {
          name: 'M',
          instruments: [],
          periods: [{ startYear: 2000, endYear: 2010 }],
        },
      ],
      artistHeroImage: {
        candidateId: 'img',
        imageUrl: img,
        host: 'upload.wikimedia.org',
        trustTier: 1,
      },
    };
    const out = sanitizeEnrichmentUrlsWithEvidence(payload, bundle);
    expect(out.artistHeroImage?.imageUrl).toBe(img);
  });
});
