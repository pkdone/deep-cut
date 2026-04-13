import type { ArtistInsightsRecord } from '../../../domain/schemas/artist-insights-record.js';
import type { LlmProvider } from '../../../domain/schemas/app-settings.js';
import { logInfo } from '../../../shared/app-logger.js';
import { retrieveArtistEvidenceAnthropic } from './anthropic-retrieval.js';
import { retrieveArtistEvidenceOpenAi } from './openai-retrieval.js';
import { synthesizeArtistInsightsFromEvidence } from './synthesize-artist-insights.js';
import { ANTHROPIC_MESSAGES_MODEL } from '../anthropic-messages-model.js';
import { OPENAI_RETRIEVAL_MODEL } from './openai-retrieval.js';
import { sanitizeEnrichmentUrlsWithEvidence } from './sanitize-enrichment-urls-with-evidence.js';
import { retrieveTargetedEnrichmentBuckets } from './retrieve-targeted-enrichment-buckets.js';
import { selectEnrichmentReferencesFromBuckets } from './select-enrichment-references.js';
import {
  applyReferenceSelectionToPayload,
  resolveArtistPrimaryReference,
} from './resolve-enrichment-candidates.js';

/**
 * Full grounded pipeline: web retrieval → synthesis → persisted aggregate (caller upserts).
 */
export async function runGroundedArtistEnrichment(params: {
  provider: Exclude<LlmProvider, 'none'>;
  apiKey: string;
  enrichmentArtistKey: string;
  artistDisplayName: string;
}): Promise<ArtistInsightsRecord> {
  logInfo('Grounded enrichment: retrieval start', {
    provider: params.provider,
    artistKey: params.enrichmentArtistKey,
  });

  const evidence =
    params.provider === 'openai'
      ? await retrieveArtistEvidenceOpenAi({
          apiKey: params.apiKey,
          enrichmentArtistKey: params.enrichmentArtistKey,
          artistDisplayName: params.artistDisplayName,
        })
      : await retrieveArtistEvidenceAnthropic({
          apiKey: params.apiKey,
          enrichmentArtistKey: params.enrichmentArtistKey,
          artistDisplayName: params.artistDisplayName,
        });

  const retrievalModel =
    params.provider === 'openai' ? OPENAI_RETRIEVAL_MODEL : ANTHROPIC_MESSAGES_MODEL;

  logInfo('Grounded enrichment: synthesis start', {
    provider: params.provider,
    evidenceStatus: evidence.status,
  });

  const stage1 = await synthesizeArtistInsightsFromEvidence({
    provider: params.provider,
    apiKey: params.apiKey,
    artistDisplayName: params.artistDisplayName,
    evidence,
    retryOnce: true,
  });

  const stage1Payload =
    stage1.result.kind === 'full' ? stage1.result.payload : stage1.result.payload;

  const targeted = await retrieveTargetedEnrichmentBuckets({
    provider: params.provider,
    apiKey: params.apiKey,
    artistDisplayName: params.artistDisplayName,
    albumNames: [
      ...stage1Payload.rankedAlbums.map((row) => row.name),
      ...stage1Payload.liveAlbums.map((row) => row.name),
      ...stage1Payload.bestOfCompilations.map((row) => row.name),
      ...stage1Payload.raritiesCompilations.map((row) => row.name),
    ],
    trackNames: stage1Payload.topTracks.map((row) => row.title),
  });

  const mergedEvidence = {
    ...evidence,
    retrievalQueries: [...evidence.retrievalQueries, ...targeted.retrievalQueries],
    sources: targeted.sources.length > 0 ? targeted.sources : evidence.sources,
    artistReferenceCandidates: targeted.artistReferenceCandidates,
    artistImageCandidates: targeted.artistImageCandidates,
    albumReferenceBuckets: targeted.albumReferenceBuckets,
    trackReferenceBuckets: targeted.trackReferenceBuckets,
    referenceCandidates: targeted.referenceCandidates,
    imageCandidates: targeted.imageCandidates,
    retrievalDigest: [evidence.retrievalDigest, targeted.retrievalDigest]
      .filter((part) => part.length > 0)
      .join('\n\n')
      .slice(0, 120_000),
    warnings: [...evidence.warnings, ...targeted.warnings],
  };


  const { selection: referenceSelection } = await selectEnrichmentReferencesFromBuckets({
    provider: params.provider,
    apiKey: params.apiKey,
    artistDisplayName: params.artistDisplayName,
    evidence: mergedEvidence,
  });


  const now = new Date();
  const primaryReference = resolveArtistPrimaryReference(referenceSelection, mergedEvidence);
  const base = {
    enrichmentArtistKey: params.enrichmentArtistKey,
    artistName: params.artistDisplayName,
    cachedAt: now,
    provider: params.provider,
    docSchemaVersion: 8,
    evidence: mergedEvidence,
    retrievalModel,
    synthesisModel: stage1.synthesisModel,
    lastRetrievalAt: mergedEvidence.requestedAt,
    lastSynthesisAt: now,
    primaryReference,
  };

  if (stage1.result.kind === 'full') {
    const resolvedPayload = applyReferenceSelectionToPayload(
      stage1.result.payload,
      referenceSelection,
      mergedEvidence,
    );
    const payload = sanitizeEnrichmentUrlsWithEvidence(
      resolvedPayload,
      mergedEvidence,
    );

    return {
      ...base,
      payload,
      partialPayload: undefined,
      validationStatus: 'valid',
      warnings: [...mergedEvidence.warnings],
    };
  }

  const resolvedPartialPayload = applyReferenceSelectionToPayload(
    stage1.result.payload,
    referenceSelection,
    mergedEvidence,
  );
  const partialPayload = sanitizeEnrichmentUrlsWithEvidence(
    resolvedPartialPayload,
    mergedEvidence,
  );
  return {
    ...base,
    payload: undefined,
    partialPayload,
    validationStatus: 'partial',
    warnings: [...mergedEvidence.warnings, ...stage1.result.warnings],
  };
}
