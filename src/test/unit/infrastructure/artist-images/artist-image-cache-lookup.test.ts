import { jest } from '@jest/globals';
import { getArtistImageWithCache, refreshArtistImageCache } from '../../../../infrastructure/artist-images/artist-image-cache-lookup.js';
import type { ArtistImageRepository } from '../../../../domain/repositories/artist-image-repository.js';
import type { ArtistImageCacheRecord } from '../../../../domain/schemas/artist-image-cache-record.js';

function makeRecord(overrides: Partial<ArtistImageCacheRecord> = {}): ArtistImageCacheRecord {
  return {
    enrichmentArtistKey: 'pink-floyd',
    artistName: 'Pink Floyd',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pink_Floyd_1973.jpg',
    sourcePageUrl: 'https://www.wikidata.org/wiki/Q392',
    host: 'commons.wikimedia.org',
    trustTier: 1,
    provider: 'musicbrainz_wikimedia',
    docSchemaVersion: 1,
    cachedAt: new Date('2024-01-01T00:00:00.000Z'),
    musicBrainzArtistId: '83d91898-7763-47d7-b03b-b92132375c47',
    wikidataEntityId: 'Q392',
    wikimediaFileName: 'Pink_Floyd_1973.jpg',
    ...overrides,
  };
}

function createMemoryRepo(initial: ArtistImageCacheRecord | null): ArtistImageRepository {
  let store = initial;
  return {
    async get(): Promise<ArtistImageCacheRecord | null> {
      await Promise.resolve();
      return Promise.resolve(store);
    },
    async upsert(entry: ArtistImageCacheRecord): Promise<void> {
      await Promise.resolve();
      store = entry;
      return Promise.resolve();
    },
    async delete(): Promise<void> {
      await Promise.resolve();
      store = null;
      return Promise.resolve();
    },
  };
}

describe('artist-image-cache-lookup', () => {
  it('returns cached image without resolver call', async () => {
    const cached = makeRecord();
    const repo = createMemoryRepo(cached);
    const resolver = jest.fn(async () => {
      await Promise.resolve();
      return makeRecord({ imageUrl: 'https://example.com/other.jpg' });
    });

    const result = await getArtistImageWithCache({
      repository: repo,
      resolveArtistImage: resolver,
      enrichmentArtistKey: cached.enrichmentArtistKey,
      artistDisplayName: cached.artistName,
    });

    expect(result.kind).toBe('hit');
    if (result.kind === 'hit') {
      expect(result.cached.imageUrl).toBe(cached.imageUrl);
    }
    expect(resolver).toHaveBeenCalledTimes(0);
  });

  it('stores resolved image when cache misses', async () => {
    const repo = createMemoryRepo(null);
    const resolved = makeRecord();
    const resolver = jest.fn(async () => {
      await Promise.resolve();
      return resolved;
    });

    const result = await getArtistImageWithCache({
      repository: repo,
      resolveArtistImage: resolver,
      enrichmentArtistKey: resolved.enrichmentArtistKey,
      artistDisplayName: resolved.artistName,
    });

    expect(result.kind).toBe('hit');
    if (result.kind === 'hit') {
      expect(result.cached.imageUrl).toBe(resolved.imageUrl);
    }
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('refresh falls back to existing cache when resolver misses', async () => {
    const cached = makeRecord();
    const repo = createMemoryRepo(cached);
    const resolver = jest.fn(async () => {
      await Promise.resolve();
      return null;
    });

    const result = await refreshArtistImageCache({
      repository: repo,
      resolveArtistImage: resolver,
      enrichmentArtistKey: cached.enrichmentArtistKey,
      artistDisplayName: cached.artistName,
    });

    expect(result?.imageUrl).toBe(cached.imageUrl);
    expect(resolver).toHaveBeenCalledTimes(1);
  });
});
