import { createImageCandidate } from '../../../../infrastructure/llm/grounded/normalize-retrieval-candidates.js';

describe('normalize-retrieval-candidates', () => {
  it('converts Wikimedia file pages into direct Special:FilePath image URLs', () => {
    const candidate = createImageCandidate({
      candidateId: 'img-1',
      imageUrl:
        'https://commons.wikimedia.org/wiki/File%3AGuitarist_Guy_Piccioto_of_Fugazi_c1990s.jpg?utm_source=openai',
      sourceProvider: 'openai',
    });
    expect(candidate.sourcePageUrl).toBe(
      'https://commons.wikimedia.org/wiki/File%3AGuitarist_Guy_Piccioto_of_Fugazi_c1990s.jpg',
    );
    expect(candidate.imageUrl).toBe(
      'https://commons.wikimedia.org/wiki/Special:FilePath/Guitarist%20Guy%20Piccioto%20of%20Fugazi%20c1990s.jpg',
    );
  });

  it('preserves a direct image asset URL', () => {
    const candidate = createImageCandidate({
      candidateId: 'img-2',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Fugazi_live.jpg',
      sourceProvider: 'openai',
    });
    expect(candidate.imageUrl).toBe('https://upload.wikimedia.org/wikipedia/commons/a/ab/Fugazi_live.jpg');
    expect(candidate.sourcePageUrl).toBeUndefined();
  });

  it('converts Wikimedia thumbnail image URLs to Special:FilePath URLs', () => {
    const candidate = createImageCandidate({
      candidateId: 'img-3',
      imageUrl:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Guitarist_Guy_Piccioto_of_Fugazi_c1990s.jpg/733px-Guitarist_Guy_Piccioto_of_Fugazi_c1990s.jpg',
      sourceProvider: 'openai',
    });
    expect(candidate.imageUrl).toBe(
      'https://commons.wikimedia.org/wiki/Special:FilePath/Guitarist_Guy_Piccioto_of_Fugazi_c1990s.jpg',
    );
  });

  it('rejects non-image URLs that cannot be normalized to an asset', () => {
    expect(() =>
      createImageCandidate({
        candidateId: 'img-4',
        imageUrl: 'https://example.com/not-an-image',
        sourceProvider: 'openai',
      })
    ).toThrow('Image candidate requires a direct image asset URL');
  });
});
