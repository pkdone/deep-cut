const FEAT_PATTERN =
  /\s+(?:feat\.?|ft\.?|featuring|with)\s+/i;
const SPLIT_PATTERN = /[/&,]+/;

/**
 * Takes a local file artist tag and returns a short query string for catalog artist search
 * (first primary artist; strips common collaboration suffixes).
 */
export function normalizeLocalArtistTagForSearch(tag: string): string {
  const t = tag.trim();
  if (t === '') {
    return '';
  }
  const beforeFeat = t.split(FEAT_PATTERN)[0]?.trim() ?? t;
  const segment = beforeFeat.split(SPLIT_PATTERN)[0]?.trim() ?? beforeFeat;
  return segment;
}
