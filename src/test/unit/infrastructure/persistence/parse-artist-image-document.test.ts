import { parseArtistImageDocument } from '../../../../infrastructure/persistence/parse-artist-image-document.js';

describe('parseArtistImageDocument', () => {
  it('parses valid artist image cache records', () => {
    const parsed = parseArtistImageDocument({
      enrichmentArtistKey: 'pink-floyd',
      artistName: 'Pink Floyd',
      imageUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pink_Floyd_1973.jpg',
      sourcePageUrl: 'https://www.wikidata.org/wiki/Q392',
      host: 'commons.wikimedia.org',
      trustTier: 1,
      provider: 'musicbrainz_wikimedia',
      docSchemaVersion: 1,
      cachedAt: new Date().toISOString(),
      musicBrainzArtistId: '83d91898-7763-47d7-b03b-b92132375c47',
      wikidataEntityId: 'Q392',
      wikimediaFileName: 'Pink_Floyd_1973.jpg',
    });

    expect(parsed.artistName).toBe('Pink Floyd');
    expect(parsed.provider).toBe('musicbrainz_wikimedia');
  });
});
