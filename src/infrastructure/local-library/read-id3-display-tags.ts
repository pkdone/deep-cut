import type { ICommonTagsResult } from 'music-metadata';
import { UNKNOWN_ALBUM } from '../../shared/local-unknown-meta.js';

const UNKNOWN_ARTIST = 'Unknown Artist';

/**
 * Derives a single display artist string from music-metadata common tags:
 * joined `artists`, else `artist`, else `albumartist`, else a fixed fallback.
 */
export function displayArtistFromCommon(common: ICommonTagsResult): string {
  const parts = common.artists?.map((a) => a.trim()).filter((a) => a.length > 0);
  if (parts !== undefined && parts.length > 0) {
    return parts.join(', ');
  }
  const single = common.artist?.trim();
  if (single !== undefined && single.length > 0) {
    return single;
  }
  const albumArtist = common.albumartist?.trim();
  if (albumArtist !== undefined && albumArtist.length > 0) {
    return albumArtist;
  }
  return UNKNOWN_ARTIST;
}

/**
 * Album title from common tags, or a fixed fallback when missing.
 */
export function displayAlbumFromCommon(common: ICommonTagsResult): string {
  const al = common.album?.trim();
  if (al !== undefined && al.length > 0) {
    return al;
  }
  return UNKNOWN_ALBUM;
}

/**
 * Track title from common tags, or basename when the file has no title tag.
 */
export function displayTitleFromCommon(common: ICommonTagsResult, fallbackBasename: string): string {
  const t = common.title?.trim();
  if (t !== undefined && t.length > 0) {
    return t;
  }
  return fallbackBasename;
}
