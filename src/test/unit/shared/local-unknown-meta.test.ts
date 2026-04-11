import { UNKNOWN_ALBUM, localAlbumDisplayTitle } from '../../../shared/local-unknown-meta.js';

describe('local-unknown-meta', () => {
  it('maps unknown album sentinel to Others label', () => {
    expect(localAlbumDisplayTitle(UNKNOWN_ALBUM)).toBe('Others');
  });

  it('passes through real album names', () => {
    expect(localAlbumDisplayTitle('Repeater')).toBe('Repeater');
  });
});
