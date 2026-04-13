import type {
  EvidenceImageCandidate,
  EvidenceReferenceCandidate,
} from '../domain/schemas/artist-evidence.js';
import { normalizeArtistNameForEnrichmentKey } from './normalize-artist-name-for-enrichment-key.js';

function normalizeLooseName(value: string | null | undefined): string {
  if (value == null) {
    return '';
  }
  return normalizeArtistNameForEnrichmentKey(value.replace(/\([^)]*\)/gu, ' '));
}

/**
 * Score a candidate against a desired work title. Higher is better.
 * Exact appliesToName wins, then title containment, then generic fallback.
 */
export function scoreWorkCandidateMatch(
  candidate: EvidenceReferenceCandidate,
  workTitle: string,
): number {
  const target = normalizeLooseName(workTitle);
  if (target.length === 0) {
    return 0;
  }
  const applies = normalizeLooseName(candidate.appliesToName);
  const title = normalizeLooseName(candidate.title);
  if (applies === target) {
    return 4;
  }
  if (title === target) {
    return 3;
  }
  if (applies.includes(target) || target.includes(applies)) {
    return 2;
  }
  if (title.includes(target) || target.includes(title)) {
    return 1;
  }
  return 0;
}

/**
 * Score an image candidate for artist relevance and classic-period hints.
 */
export function scoreImageCandidateMatch(
  candidate: EvidenceImageCandidate,
  artistDisplayName: string,
): number {
  const artist = normalizeLooseName(artistDisplayName);
  const title = normalizeLooseName(candidate.title);
  const hint = normalizeLooseName(candidate.periodHint);
  let score = 0;
  if (title.includes(artist) || artist.includes(title)) {
    score += 3;
  }
  if (hint.includes('classic') || hint.includes('early') || hint.includes('iconic')) {
    score += 2;
  }
  return score;
}
