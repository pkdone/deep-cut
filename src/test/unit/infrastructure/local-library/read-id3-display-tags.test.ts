import type { ICommonTagsResult } from 'music-metadata';
import {
  displayAlbumFromCommon,
  displayArtistFromCommon,
  displayTitleFromCommon,
} from '../../../../infrastructure/local-library/read-id3-display-tags.js';

function common(overrides: Partial<ICommonTagsResult>): ICommonTagsResult {
  return {
    track: { no: null, of: null },
    disk: { no: null, of: null },
    ...overrides,
  };
}

describe('read-id3-display-tags', () => {
  it('joins artists array with comma-space', () => {
    expect(
      displayArtistFromCommon(
        common({
          artists: ['Alpha', 'Beta'],
        })
      )
    ).toBe('Alpha, Beta');
  });

  it('uses albumartist when artist and artists are missing', () => {
    expect(
      displayArtistFromCommon(
        common({
          albumartist: 'Various Artists',
        })
      )
    ).toBe('Various Artists');
  });

  it('prefers artists over single artist string', () => {
    expect(
      displayArtistFromCommon(
        common({
          artist: 'Solo',
          artists: ['A', 'B'],
        })
      )
    ).toBe('A, B');
  });

  it('uses single artist when artists empty', () => {
    expect(
      displayArtistFromCommon(
        common({
          artist: 'Fugazi',
          artists: [],
        })
      )
    ).toBe('Fugazi');
  });

  it('returns Unknown Artist when no artist fields', () => {
    expect(displayArtistFromCommon(common({}))).toBe('Unknown Artist');
  });

  it('uses album when present', () => {
    expect(
      displayAlbumFromCommon(
        common({
          album: 'Repeater',
        })
      )
    ).toBe('Repeater');
  });

  it('returns Unknown Album when album missing', () => {
    expect(displayAlbumFromCommon(common({}))).toBe('Unknown Album');
  });

  it('uses title when present', () => {
    expect(
      displayTitleFromCommon(
        common({
          title: 'Waiting Room',
        }),
        'fallback'
      )
    ).toBe('Waiting Room');
  });

  it('uses fallback basename when title missing', () => {
    expect(displayTitleFromCommon(common({}), 'track_01')).toBe('track_01');
  });
});
