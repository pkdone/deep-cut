/** Fallback when album tag is missing; must match scanner output for grouping and URLs. */
export const UNKNOWN_ALBUM = 'Unknown Album';

/** UI label for {@link UNKNOWN_ALBUM} bucket (browse/search). */
export function localAlbumDisplayTitle(storedAlbum: string): string {
  return storedAlbum === UNKNOWN_ALBUM ? 'Others' : storedAlbum;
}
