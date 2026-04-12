/**
 * Stable Mongo/cache key for artist enrichment: one display string maps to one key.
 * Collisions (e.g. two different artists normalizing the same) are accepted for v1.
 */
export function normalizeArtistNameForEnrichmentKey(displayName: string): string {
  const t = displayName.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (t === '') {
    return '';
  }
  return t.toLocaleLowerCase('en-US');
}
