import type { EvidenceImageCandidate } from '../domain/schemas/artist-evidence.js';
import { scoreImageCandidateMatch } from './match-work-candidate.js';

/**
 * Rank image candidates for the artist hero photo. Lower trust tier wins among
 * equally relevant images.
 */
export function rankImageCandidates(
  candidates: readonly EvidenceImageCandidate[],
  artistDisplayName: string,
): EvidenceImageCandidate[] {
  return [...candidates].sort((a, b) => {
    const matchDiff = scoreImageCandidateMatch(b, artistDisplayName) -
      scoreImageCandidateMatch(a, artistDisplayName);
    if (matchDiff !== 0) {
      return matchDiff;
    }
    const trustDiff = a.trustTier - b.trustTier;
    if (trustDiff !== 0) {
      return trustDiff;
    }
    return a.imageUrl.localeCompare(b.imageUrl);
  });
}
