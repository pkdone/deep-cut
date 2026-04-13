import {
  isWikipediaUrlGenericArtistOrDiscographyPage,
} from '../../../shared/wikipedia-article-reference-tier.js';

describe('wikipedia-article-reference-tier', () => {
  it('treats discography and plain artist titles as generic for per-row links', () => {
    expect(
      isWikipediaUrlGenericArtistOrDiscographyPage(
        'https://en.wikipedia.org/wiki/Fugazi_discography',
      ),
    ).toBe(true);
    expect(
      isWikipediaUrlGenericArtistOrDiscographyPage('https://en.wikipedia.org/wiki/Fugazi'),
    ).toBe(true);
  });

  it('does not treat album/song article titles as generic', () => {
    expect(
      isWikipediaUrlGenericArtistOrDiscographyPage(
        'https://en.wikipedia.org/wiki/Repeater_(album)',
      ),
    ).toBe(false);
    expect(
      isWikipediaUrlGenericArtistOrDiscographyPage(
        'https://en.wikipedia.org/wiki/Merchandise_(song)',
      ),
    ).toBe(false);
  });

  it('allows a plain Wikipedia title when it matches the target work', () => {
    expect(
      isWikipediaUrlGenericArtistOrDiscographyPage(
        'https://en.wikipedia.org/wiki/In_on_the_Kill_Taker',
        'In on the Kill Taker',
      ),
    ).toBe(false);
    expect(
      isWikipediaUrlGenericArtistOrDiscographyPage(
        'https://en.wikipedia.org/wiki/Red_Medicine',
        'Red Medicine',
      ),
    ).toBe(false);
  });
});
