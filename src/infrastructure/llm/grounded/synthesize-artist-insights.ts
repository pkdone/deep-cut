import {
  artistEnrichmentPartialPayloadSchema,
  type ArtistEnrichmentPartialPayload,
} from '../../../domain/schemas/artist-insights-record.js';
import {
  artistEnrichmentPayloadSchema,
  type ArtistEnrichmentPayload,
} from '../../../domain/schemas/artist-enrichment-payload.js';
import type { ArtistEvidenceBundle } from '../../../domain/schemas/artist-evidence.js';
import type { LlmProvider } from '../../../domain/schemas/app-settings.js';
import { ANTHROPIC_MESSAGES_MODEL } from '../anthropic-messages-model.js';
import { repairMalformedLlmJsonQuotes } from '../repair-llm-json.js';
import { logError, logInfo } from '../../../shared/app-logger.js';
import { ExternalServiceError } from '../../../shared/errors.js';
import { ENRICHMENT_JSON_INSTRUCTION } from './enrichment-json-instruction.js';

const OPENAI_SYNTHESIS_MODEL = 'gpt-4.1-mini';

function extractJson(s: string): string {
  const t = s.trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return t.slice(start, end + 1);
  }
  return t;
}

async function callOpenAiSynthesis(apiKey: string, user: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_SYNTHESIS_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You output only valid JSON for music artist summaries. Use standard JSON string quoting. Obey the evidence-only rule in the user message.',
        },
        { role: 'user', content: user },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new ExternalServiceError(`OpenAI synthesis error: ${res.status} ${t}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]?.message?.content ?? '';
}

async function callAnthropicSynthesis(apiKey: string, user: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MESSAGES_MODEL,
      max_tokens: 8192,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new ExternalServiceError(`Anthropic synthesis error: ${res.status} ${t}`);
  }
  const data = (await res.json()) as {
    content: { type: string; text: string }[];
  };
  const block = data.content.find((c) => c.type === 'text');
  return block?.text ?? '';
}

function parseJsonFromModel(raw: string): unknown {
  const extracted = extractJson(raw);
  try {
    return JSON.parse(extracted);
  } catch (first) {
    try {
      return JSON.parse(repairMalformedLlmJsonQuotes(extracted));
    } catch (second) {
      logError('LLM synthesis JSON parse failed', {
        error: String(second),
        afterRepair: true,
        firstError: String(first),
        raw: raw.slice(0, 500),
      });
      throw new ExternalServiceError('Artist synthesis returned invalid JSON');
    }
  }
}

export type SynthesisAttemptResult =
  | { kind: 'full'; payload: ArtistEnrichmentPayload }
  | { kind: 'partial'; payload: ArtistEnrichmentPartialPayload; warnings: string[] };

export async function synthesizeArtistInsightsFromEvidence(params: {
  provider: Exclude<LlmProvider, 'none'>;
  apiKey: string;
  artistDisplayName: string;
  evidence: ArtistEvidenceBundle;
  retryOnce: boolean;
}): Promise<{ result: SynthesisAttemptResult; synthesisModel: string; attempts: number }> {
  const synthesisModel =
    params.provider === 'openai' ? OPENAI_SYNTHESIS_MODEL : ANTHROPIC_MESSAGES_MODEL;

  const userPrompt = [
    `Artist: ${params.artistDisplayName}`,
    '',
    'Evidence (from web retrieval; treat as sole factual basis for discography and background):',
    params.evidence.retrievalDigest.slice(0, 100_000),
    '',
    'Produce JSON only as specified. rankedAlbums must be studio albums only; topTracks must be exactly ten distinct songs with ranks 1–10.',
    '',
    ENRICHMENT_JSON_INSTRUCTION,
  ].join('\n');

  const callModel = async (): Promise<string> =>
    params.provider === 'openai'
      ? callOpenAiSynthesis(params.apiKey, userPrompt)
      : callAnthropicSynthesis(params.apiKey, userPrompt);

  const toResult = (parsed: unknown): SynthesisAttemptResult | null => {
    const full = artistEnrichmentPayloadSchema.safeParse(parsed);
    if (full.success) {
      return { kind: 'full', payload: full.data };
    }
    const partial = artistEnrichmentPartialPayloadSchema.safeParse(parsed);
    if (partial.success) {
      return {
        kind: 'partial',
        payload: partial.data,
        warnings: [
          'Full validation failed; showing partial insights.',
          ...full.error.issues.map((i) => i.message),
        ],
      };
    }
    return null;
  };

  let attempts = 0;

  const runOnce = async (): Promise<SynthesisAttemptResult> => {
    attempts += 1;
    logInfo('Artist synthesis attempt', { attempt: attempts, provider: params.provider });
    const raw = await callModel();
    const parsed = parseJsonFromModel(raw);
    const outcome = toResult(parsed);
    if (outcome !== null) {
      return outcome;
    }
    throw new ExternalServiceError('Artist synthesis JSON did not match full or partial schema');
  };

  try {
    const result = await runOnce();
    return { result, synthesisModel, attempts };
  } catch (first) {
    if (!params.retryOnce) {
      throw first;
    }
    const result = await runOnce();
    return { result, synthesisModel, attempts };
  }
}
