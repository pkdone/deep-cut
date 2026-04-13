import type { EvidenceReferenceCandidate } from '../domain/schemas/artist-evidence.js';
import { scoreWorkCandidateMatch } from './match-work-candidate.js';
import { isWikipediaUrlGenericArtistOrDiscographyPage } from './wikipedia-article-reference-tier.js';

type ReferenceTarget = {
  readonly kind: 'artist' | 'album' | 'track';
  readonly displayName: string;
};

/**
 * Sorts candidates from best to worst for a given artist/album/track target.
 * Wikipedia release/song pages are preferred, while generic artist/discography pages
 * are filtered out for non-artist targets.
 */
export function rankReferenceCandidates(
  candidates: readonly EvidenceReferenceCandidate[],
  target: ReferenceTarget,
): EvidenceReferenceCandidate[] {
  return [...candidates]
    .filter((candidate) => {
      if (target.kind === 'artist') {
        return true;
      }
      if (isWikipediaUrlGenericArtistOrDiscographyPage(candidate.url, target.displayName)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const matchDiff = scoreWorkCandidateMatch(b, target.displayName) -
        scoreWorkCandidateMatch(a, target.displayName);
      if (matchDiff !== 0) {
        return matchDiff;
      }
      const trustDiff = a.trustTier - b.trustTier;
      if (trustDiff !== 0) {
        return trustDiff;
      }
      return a.url.localeCompare(b.url);
    });
}
