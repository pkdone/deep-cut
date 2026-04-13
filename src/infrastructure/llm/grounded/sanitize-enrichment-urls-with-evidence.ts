import type { ArtistEnrichmentPartialPayload } from '../../../domain/schemas/artist-insights-record.js';
import type { ArtistEnrichmentPayload } from '../../../domain/schemas/artist-enrichment-payload.js';
import type { ArtistEvidenceBundle } from '../../../domain/schemas/artist-evidence.js';
import { isWikipediaUrlGenericArtistOrDiscographyPage } from '../../../shared/wikipedia-article-reference-tier.js';

/** Strips utm_* params and normalizes for comparison. */
export function stripTrackingParamsFromUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') {
      return url;
    }
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('utm_')) {
        u.searchParams.delete(key);
      }
    }
    const qs = u.searchParams.toString();
    if (qs.length === 0) {
      return `${u.origin}${u.pathname}${u.hash}`;
    }
    return `${u.origin}${u.pathname}?${qs}${u.hash}`;
  } catch {
    return url;
  }
}

function normalizeUrlForEvidenceMatch(url: string): string {
  return stripTrackingParamsFromUrl(url).toLowerCase();
}

const HTTPS_IN_TEXT =
  /https:\/\/[a-z0-9][-a-z0-9+.]*(?:\.[a-z0-9][-a-z0-9+.]*|:)\/[^\s"'<>]*[a-z0-9/]/giu;

/**
 * Collects normalized https URLs from retrieval sources and from URLs embedded in the digest text.
 */
export function collectEvidenceUrlCorpus(bundle: ArtistEvidenceBundle): Set<string> {
  const out = new Set<string>();
  for (const s of bundle.sources) {
    if (s.url != null && s.url.length > 0) {
      try {
        const u = new URL(s.url);
        if (u.protocol === 'https:') {
          out.add(normalizeUrlForEvidenceMatch(s.url));
        }
      } catch {
        continue;
      }
    }
  }
  const digest = bundle.retrievalDigest;
  for (const m of digest.matchAll(HTTPS_IN_TEXT)) {
    let raw = m[0];
    while (raw.endsWith(')') || raw.endsWith('.')) {
      raw = raw.slice(0, -1);
    }
    try {
      const u = new URL(raw);
      if (u.protocol === 'https:') {
        out.add(normalizeUrlForEvidenceMatch(raw));
      }
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * Returns true if the URL is https and its normalized form matches the evidence corpus
 * (exact after normalization, or contained in a longer corpus URL / digest fragment).
 */
export function isUrlAllowedByEvidence(url: string | null | undefined, corpus: Set<string>): boolean {
  if (url == null || url.length === 0) {
    return false;
  }
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') {
      return false;
    }
  } catch {
    return false;
  }
  const n = normalizeUrlForEvidenceMatch(url);
  if (corpus.has(n)) {
    return true;
  }
  for (const c of corpus) {
    if (c.includes(n) || n.includes(c)) {
      return true;
    }
  }
  return false;
}

function sanitizeResolvedReference<T extends { primaryReference?: { url: string } | null }>(
  row: T,
  targetName?: string,
): T {
  if (row.primaryReference == null) {
    return row;
  }
  const cleaned = stripTrackingParamsFromUrl(row.primaryReference.url);
  if (isWikipediaUrlGenericArtistOrDiscographyPage(cleaned, targetName)) {
    return { ...row, primaryReference: undefined };
  }
  return {
    ...row,
    primaryReference: {
      ...row.primaryReference,
      url: cleaned,
    },
  };
}

/**
 * Clears payload URLs that were not present in retrieval evidence (anti-hallucination).
 */
export function sanitizeEnrichmentUrlsWithEvidence(
  payload: ArtistEnrichmentPayload | ArtistEnrichmentPartialPayload,
  _bundle: ArtistEvidenceBundle,
): ArtistEnrichmentPayload | ArtistEnrichmentPartialPayload {
  const mapRows = <
    T extends { primaryReference?: { url: string } | null },
  >(
    rows: readonly T[],
    getTargetName: (row: T) => string | undefined,
  ): T[] => rows.map((row) => sanitizeResolvedReference(row, getTargetName(row)));

  let artistHeroImage = payload.artistHeroImage;
  if (artistHeroImage != null) {
    artistHeroImage = {
      ...artistHeroImage,
      imageUrl: stripTrackingParamsFromUrl(artistHeroImage.imageUrl),
      sourcePageUrl:
        artistHeroImage.sourcePageUrl != null
          ? stripTrackingParamsFromUrl(artistHeroImage.sourcePageUrl)
          : undefined,
    };
  }

  return {
    ...payload,
    rankedAlbums: mapRows(payload.rankedAlbums, (row) => row.name),
    topTracks: mapRows(payload.topTracks, (row) => row.title),
    liveAlbums: mapRows(payload.liveAlbums, (row) => row.name),
    bestOfCompilations: mapRows(payload.bestOfCompilations, (row) => row.name),
    raritiesCompilations: mapRows(payload.raritiesCompilations, (row) => row.name),
    artistHeroImage,
  };
}
