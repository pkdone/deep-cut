import type {
  ArtistEvidenceBundle,
  EvidenceImageCandidate,
  EvidenceReferenceCandidate,
  EvidenceTargetReferenceBucket,
} from '../../../domain/schemas/artist-evidence.js';
import type {
  ArtistEnrichmentPartialPayload,
} from '../../../domain/schemas/artist-insights-record.js';
import type {
  ArtistEnrichmentPayload,
  ArtistEnrichmentSelectionPayload,
  ArtistEnrichmentRankedAlbumSelection,
  ArtistEnrichmentTopTrackSelection,
  ArtistReferenceSelection,
  EnrichmentCategorizedAlbumEntrySelection,
} from '../../../domain/schemas/artist-enrichment-payload.js';
import { rankImageCandidates } from '../../../shared/rank-image-candidates.js';
import { rankReferenceCandidates } from '../../../shared/rank-reference-candidates.js';
import { normalizeArtistNameForEnrichmentKey } from '../../../shared/normalize-artist-name-for-enrichment-key.js';

type AnySelectionRow =
  | ArtistEnrichmentRankedAlbumSelection
  | ArtistEnrichmentTopTrackSelection
  | EnrichmentCategorizedAlbumEntrySelection;

function referenceMap(
  candidates: readonly EvidenceReferenceCandidate[],
): ReadonlyMap<string, EvidenceReferenceCandidate> {
  return new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
}

function imageMap(
  candidates: readonly EvidenceImageCandidate[],
): ReadonlyMap<string, EvidenceImageCandidate> {
  return new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
}

function findBucket(
  buckets: readonly EvidenceTargetReferenceBucket[],
  targetName: string,
): EvidenceTargetReferenceBucket | undefined {
  const target = normalizeArtistNameForEnrichmentKey(targetName);
  return buckets.find(
    (bucket) => normalizeArtistNameForEnrichmentKey(bucket.targetName) === target,
  );
}

function resolveReference(
  candidates: readonly EvidenceReferenceCandidate[],
  selectedCandidateId: string | null | undefined,
  target: { kind: 'artist' | 'album' | 'track'; displayName: string },
): ArtistEnrichmentPayload['rankedAlbums'][number]['primaryReference'] | undefined {
  const ranked = rankReferenceCandidates(candidates, target);
  const candidateById = referenceMap(candidates);
  const selectedCandidate =
    selectedCandidateId != null ? candidateById.get(selectedCandidateId) : undefined;
  const topRanked = ranked.length > 0 ? ranked[0] : undefined;
  let preferred = selectedCandidate ?? topRanked;

  if (target.kind !== 'artist') {
    const topWikipedia = ranked.find(
      (candidate) => candidate.host === 'wikipedia.org' || candidate.host.endsWith('.wikipedia.org'),
    );
    const preferredIsWikipedia = preferred != null &&
      (preferred.host === 'wikipedia.org' || preferred.host.endsWith('.wikipedia.org'));
    if (topWikipedia != null && !preferredIsWikipedia) {
      preferred = topWikipedia;
    }
  }

  if (preferred == null) {
    return undefined;
  }
  const isEligible = ranked.some((candidate) => candidate.candidateId === preferred.candidateId);
  if (!isEligible) {
    return undefined;
  }
  return {
    candidateId: preferred.candidateId,
    url: preferred.url,
    title: preferred.title,
    host: preferred.host,
    trustTier: preferred.trustTier,
  };
}

function resolveHeroImage(
  candidates: readonly EvidenceImageCandidate[],
  artistDisplayName: string,
  selectedCandidateId: string | null | undefined,
): ArtistEnrichmentPayload['artistHeroImage'] | undefined {
  const ranked = rankImageCandidates(candidates, artistDisplayName);
  const candidateById = imageMap(candidates);
  const preferred = selectedCandidateId != null ? candidateById.get(selectedCandidateId) : ranked[0];
  if (preferred == null) {
    return undefined;
  }
  const isEligible = ranked.some((candidate) => candidate.candidateId === preferred.candidateId);
  if (!isEligible) {
    return undefined;
  }
  return {
    candidateId: preferred.candidateId,
    imageUrl: preferred.imageUrl,
    sourcePageUrl: preferred.sourcePageUrl,
    title: preferred.title,
    periodHint: preferred.periodHint,
    host: preferred.host,
    trustTier: preferred.trustTier,
  };
}

function resolveRankedRow<T extends AnySelectionRow>(
  bucket: EvidenceTargetReferenceBucket | undefined,
  row: T,
  targetKind: 'album' | 'track',
): T & { primaryReference: ArtistEnrichmentPayload['rankedAlbums'][number]['primaryReference'] } {
  return {
    ...row,
    primaryReference:
      resolveReference(bucket?.candidates ?? [], row.primaryReferenceCandidateId, {
        kind: targetKind,
        displayName: 'name' in row ? row.name : row.title,
      }) ?? undefined,
  };
}

export function resolveSelectionPayloadToEnrichmentPayload(
  selection: ArtistEnrichmentSelectionPayload,
  referenceSelection: ArtistReferenceSelection,
  evidence: ArtistEvidenceBundle,
): ArtistEnrichmentPayload {
  const albumSelectionMap = new Map(
    referenceSelection.albumSelections.map((selectionRow) => [
      normalizeArtistNameForEnrichmentKey(selectionRow.targetName),
      selectionRow.primaryReferenceCandidateId,
    ]),
  );
  const trackSelectionMap = new Map(
    referenceSelection.trackSelections.map((selectionRow) => [
      normalizeArtistNameForEnrichmentKey(selectionRow.targetName),
      selectionRow.primaryReferenceCandidateId,
    ]),
  );

  return {
    synopsis: selection.synopsis,
    rankedAlbums: selection.rankedAlbums.map((row) =>
      resolveRankedRow(
        findBucket(evidence.albumReferenceBuckets, row.name),
        {
          ...row,
          primaryReferenceCandidateId:
            albumSelectionMap.get(normalizeArtistNameForEnrichmentKey(row.name)) ??
            row.primaryReferenceCandidateId,
        },
        'album',
      ),
    ),
    topTracks: selection.topTracks.map((row) =>
      resolveRankedRow(
        findBucket(evidence.trackReferenceBuckets, row.title),
        {
          ...row,
          primaryReferenceCandidateId:
            trackSelectionMap.get(normalizeArtistNameForEnrichmentKey(row.title)) ??
            row.primaryReferenceCandidateId,
        },
        'track',
      ),
    ),
    liveAlbums: selection.liveAlbums.map((row) =>
      resolveRankedRow(findBucket(evidence.albumReferenceBuckets, row.name), row, 'album'),
    ),
    bestOfCompilations: selection.bestOfCompilations.map((row) =>
      resolveRankedRow(findBucket(evidence.albumReferenceBuckets, row.name), row, 'album'),
    ),
    raritiesCompilations: selection.raritiesCompilations.map((row) =>
      resolveRankedRow(findBucket(evidence.albumReferenceBuckets, row.name), row, 'album'),
    ),
    bandMembers: selection.bandMembers,
    artistHeroImage:
      resolveHeroImage(
        evidence.artistImageCandidates,
        evidence.artistDisplayName,
        referenceSelection.artistHeroImageCandidateId,
      ) ??
      undefined,
  };
}

export function resolveSelectionPayloadToPartialEnrichmentPayload(
  selection: ArtistEnrichmentSelectionPayload,
  referenceSelection: ArtistReferenceSelection,
  evidence: ArtistEvidenceBundle,
): ArtistEnrichmentPartialPayload {
  return resolveSelectionPayloadToEnrichmentPayload(selection, referenceSelection, evidence);
}

export function resolveArtistPrimaryReference(
  referenceSelection: ArtistReferenceSelection,
  evidence: ArtistEvidenceBundle,
): ArtistEnrichmentPayload['rankedAlbums'][number]['primaryReference'] | undefined {
  return resolveReference(
    evidence.artistReferenceCandidates,
    referenceSelection.artistPrimaryReferenceCandidateId,
    {
      kind: 'artist',
      displayName: evidence.artistDisplayName,
    },
  );
}

type EnrichmentBodyWithResolvedRefs = ArtistEnrichmentPayload | ArtistEnrichmentPartialPayload;

/**
 * Applies stage-2 bucket selections onto an already synthesized stage-1 payload.
 * This is the normal path for the multi-stage pipeline.
 */
export function applyReferenceSelectionToPayload(
  payload: EnrichmentBodyWithResolvedRefs,
  referenceSelection: ArtistReferenceSelection,
  evidence: ArtistEvidenceBundle,
): EnrichmentBodyWithResolvedRefs {
  const albumSelectionMap = new Map(
    referenceSelection.albumSelections.map((selectionRow) => [
      normalizeArtistNameForEnrichmentKey(selectionRow.targetName),
      selectionRow.primaryReferenceCandidateId,
    ]),
  );
  const trackSelectionMap = new Map(
    referenceSelection.trackSelections.map((selectionRow) => [
      normalizeArtistNameForEnrichmentKey(selectionRow.targetName),
      selectionRow.primaryReferenceCandidateId,
    ]),
  );

  return {
    ...payload,
    rankedAlbums: payload.rankedAlbums.map((row) => ({
      ...row,
      primaryReference:
        resolveReference(
          findBucket(evidence.albumReferenceBuckets, row.name)?.candidates ?? [],
          albumSelectionMap.get(normalizeArtistNameForEnrichmentKey(row.name)),
          {
            kind: 'album',
            displayName: row.name,
          },
        ) ?? undefined,
    })),
    topTracks: payload.topTracks.map((row) => ({
      ...row,
      primaryReference:
        resolveReference(
          findBucket(evidence.trackReferenceBuckets, row.title)?.candidates ?? [],
          trackSelectionMap.get(normalizeArtistNameForEnrichmentKey(row.title)),
          {
            kind: 'track',
            displayName: row.title,
          },
        ) ?? undefined,
    })),
    liveAlbums: payload.liveAlbums.map((row) => ({ ...row, primaryReference: undefined })),
    bestOfCompilations: payload.bestOfCompilations.map((row) => ({
      ...row,
      primaryReference: undefined,
    })),
    raritiesCompilations: payload.raritiesCompilations.map((row) => ({
      ...row,
      primaryReference: undefined,
    })),
    artistHeroImage:
      resolveHeroImage(
        evidence.artistImageCandidates,
        evidence.artistDisplayName,
        referenceSelection.artistHeroImageCandidateId,
      ) ?? undefined,
  };
}
