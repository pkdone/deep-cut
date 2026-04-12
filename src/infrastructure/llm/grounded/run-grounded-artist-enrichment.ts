import type { ArtistInsightsRecord } from '../../../domain/schemas/artist-insights-record.js';
import type { LlmProvider } from '../../../domain/schemas/app-settings.js';
import { logInfo } from '../../../shared/app-logger.js';
import { retrieveArtistEvidenceAnthropic } from './anthropic-retrieval.js';
import { retrieveArtistEvidenceOpenAi } from './openai-retrieval.js';
import { synthesizeArtistInsightsFromEvidence } from './synthesize-artist-insights.js';
import { ANTHROPIC_MESSAGES_MODEL } from '../anthropic-messages-model.js';
import { OPENAI_RETRIEVAL_MODEL } from './openai-retrieval.js';

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

  const { result, synthesisModel } = await synthesizeArtistInsightsFromEvidence({
    provider: params.provider,
    apiKey: params.apiKey,
    artistDisplayName: params.artistDisplayName,
    evidence,
    retryOnce: true,
  });

  const now = new Date();
  const base = {
    enrichmentArtistKey: params.enrichmentArtistKey,
    artistName: params.artistDisplayName,
    cachedAt: now,
    provider: params.provider,
    docSchemaVersion: 5,
    evidence,
    retrievalModel,
    synthesisModel,
    lastRetrievalAt: evidence.requestedAt,
    lastSynthesisAt: now,
  };

  if (result.kind === 'full') {
    return {
      ...base,
      payload: result.payload,
      partialPayload: undefined,
      validationStatus: 'valid',
      warnings: [...evidence.warnings],
    };
  }

  return {
    ...base,
    payload: undefined,
    partialPayload: result.payload,
    validationStatus: 'partial',
    warnings: [...evidence.warnings, ...result.warnings],
  };
}
