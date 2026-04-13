import { jest } from '@jest/globals';
import { resolveArtistImageFromPublicSources } from '../../../../infrastructure/artist-images/resolve-artist-image.js';

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('resolveArtistImageFromPublicSources', () => {
  const originalFetch = global.fetch;
  const toUrlString = (input: RequestInfo | URL): string => {
    if (input instanceof URL) {
      return input.toString();
    }
    if (typeof input === 'string') {
      return input;
    }
    return input.url;
  };

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('resolves image via MusicBrainz, Wikidata, Wikimedia chain', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      await Promise.resolve();
      const url = toUrlString(input);
      if (url.includes('musicbrainz.org/ws/2/artist/?')) {
        return createJsonResponse({
          artists: [{ id: 'mbid-1', name: 'Pink Floyd', score: '100', disambiguation: '' }],
        });
      }
      if (url.includes('musicbrainz.org/ws/2/artist/mbid-1')) {
        return createJsonResponse({
          relations: [{ type: 'wikidata', url: { resource: 'https://www.wikidata.org/wiki/Q392' } }],
        });
      }
      if (url.includes('wikidata.org/wiki/Special:EntityData/Q392.json')) {
        return createJsonResponse({
          entities: {
            Q392: {
              claims: {
                P18: [{ mainsnak: { datavalue: { value: 'Pink_Floyd_1973.jpg' } } }],
              },
            },
          },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    const result = await resolveArtistImageFromPublicSources({
      enrichmentArtistKey: 'pink-floyd',
      artistDisplayName: 'Pink Floyd',
    });

    expect(result).not.toBeNull();
    expect(result?.provider).toBe('musicbrainz_wikimedia');
    expect(result?.wikidataEntityId).toBe('Q392');
    expect(result?.imageUrl).toContain('Special:FilePath/Pink_Floyd_1973.jpg');
  });

  it('returns null when no MusicBrainz artists are found', async () => {
    global.fetch = jest.fn(async () => {
      await Promise.resolve();
      return createJsonResponse({ artists: [] });
    }) as typeof fetch;
    const result = await resolveArtistImageFromPublicSources({
      enrichmentArtistKey: 'missing',
      artistDisplayName: 'Unknown Artist',
    });
    expect(result).toBeNull();
  });
});
