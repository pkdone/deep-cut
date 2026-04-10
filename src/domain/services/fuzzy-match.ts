/**
 * Normalisation and similarity for Spotify ↔ local duplicate detection (PRD fuzzy matching).
 */

const NON_ALNUM = /[^a-z0-9]+/g;

export function normaliseForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .replace(NON_ALNUM, '')
    .trim();
}

/** Jaccard similarity on character bigrams (cheap fuzzy signal). */
export function bigramSimilarity(a: string, b: string): number {
  const na = normaliseForMatch(a);
  const nb = normaliseForMatch(b);
  if (na.length === 0 && nb.length === 0) {
    return 1;
  }
  if (na.length === 0 || nb.length === 0) {
    return 0;
  }
  if (na === nb) {
    return 1;
  }
  const bigrams = (t: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (let i = 0; i < t.length - 1; i++) {
      const bg = t.slice(i, i + 2);
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };
  const A = bigrams(na);
  const B = bigrams(nb);
  let inter = 0;
  for (const [k, v] of A) {
    const w = B.get(k);
    if (w !== undefined) {
      inter += Math.min(v, w);
    }
  }
  const sumA = [...A.values()].reduce((s, n) => s + n, 0);
  const sumB = [...B.values()].reduce((s, n) => s + n, 0);
  const union = sumA + sumB - inter;
  return union === 0 ? 0 : inter / union;
}

export function tracksLikelySameSong(params: {
  titleA: string;
  artistA: string;
  titleB: string;
  artistB: string;
}): boolean {
  const t = bigramSimilarity(params.titleA, params.titleB);
  const a = bigramSimilarity(params.artistA, params.artistB);
  return t >= 0.55 && a >= 0.55;
}
