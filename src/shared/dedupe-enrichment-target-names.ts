import { normalizeArtistNameForEnrichmentKey } from './normalize-artist-name-for-enrichment-key.js';

/**
 * Deduplicates album or track display names for targeted enrichment retrieval.
 * Keeps the first-seen spelling per normalized key (see {@link normalizeArtistNameForEnrichmentKey})
 * so bucket `targetName` still matches synthesis rows via the same normalization at resolve time.
 */
export function dedupeEnrichmentTargetNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const key = normalizeArtistNameForEnrichmentKey(name);
    if (key.length === 0) {
      continue;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(name);
  }
  return out;
}
