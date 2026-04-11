const NEW_PLAYLIST_PREFIX = 'New Playlist #';

/**
 * Returns a unique name `New Playlist #n` where `n` is the smallest positive integer
 * not already used by a playlist whose name matches that pattern (case-sensitive per existing names).
 */
export function uniqueNewPlaylistName(existingNames: readonly string[]): string {
  const used = new Set<number>();
  const re = /^New Playlist #(\d+)$/;
  for (const raw of existingNames) {
    const m = re.exec(raw.trim());
    if (m) {
      used.add(Number.parseInt(m[1], 10));
    }
  }
  let n = 1;
  while (used.has(n)) {
    n += 1;
  }
  return `${NEW_PLAYLIST_PREFIX}${n}`;
}
