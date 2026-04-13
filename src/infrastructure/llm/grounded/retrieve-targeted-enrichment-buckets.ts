import type { ArtistEvidenceBundle } from '../../../domain/schemas/artist-evidence.js';
import type { LlmProvider } from '../../../domain/schemas/app-settings.js';
import { retrieveTargetedEnrichmentBucketsAnthropic } from './anthropic-retrieval.js';
import { retrieveTargetedEnrichmentBucketsOpenAi } from './openai-retrieval.js';
import { MAX_SOURCES } from './llm-evidence-caps.js';

type TargetedRetrievalInput = {
  provider: Exclude<LlmProvider, 'none'>;
  apiKey: string;
  artistDisplayName: string;
  albumNames: readonly string[];
  trackNames: readonly string[];
};

/**
 * Stage 2 targeted retrieval that builds artist/image/album/track buckets after stage 1 summary generation.
 */
export async function retrieveTargetedEnrichmentBuckets(
  params: TargetedRetrievalInput,
): Promise<Pick<
  ArtistEvidenceBundle,
  | 'retrievalQueries'
  | 'sources'
  | 'artistReferenceCandidates'
  | 'artistImageCandidates'
  | 'albumReferenceBuckets'
  | 'trackReferenceBuckets'
  | 'referenceCandidates'
  | 'imageCandidates'
  | 'retrievalDigest'
  | 'warnings'
>> {
  const targeted =
    params.provider === 'openai'
      ? await retrieveTargetedEnrichmentBucketsOpenAi(params)
      : await retrieveTargetedEnrichmentBucketsAnthropic(params);

  const dedupedSources = [];
  const seenSourceUrls = new Set<string>();
  for (const source of targeted.sources) {
    const key = source.url ?? `${source.sourceKind}:${source.sourceId}`;
    if (seenSourceUrls.has(key)) {
      continue;
    }
    seenSourceUrls.add(key);
    dedupedSources.push(source);
    if (dedupedSources.length >= MAX_SOURCES * 6) {
      break;
    }
  }

  const dedupedReferenceCandidates = [];
  const seenReferenceUrls = new Set<string>();
  for (const candidate of targeted.referenceCandidates) {
    if (seenReferenceUrls.has(candidate.url)) {
      continue;
    }
    seenReferenceUrls.add(candidate.url);
    dedupedReferenceCandidates.push(candidate);
    if (dedupedReferenceCandidates.length >= MAX_SOURCES * 8) {
      break;
    }
  }

  const dedupedImageCandidates = [];
  const seenImageUrls = new Set<string>();
  for (const candidate of targeted.imageCandidates) {
    if (seenImageUrls.has(candidate.imageUrl)) {
      continue;
    }
    seenImageUrls.add(candidate.imageUrl);
    dedupedImageCandidates.push(candidate);
    if (dedupedImageCandidates.length >= MAX_SOURCES * 3) {
      break;
    }
  }

  return {
    ...targeted,
    sources: dedupedSources,
    referenceCandidates: dedupedReferenceCandidates,
    imageCandidates: dedupedImageCandidates,
  };
}
