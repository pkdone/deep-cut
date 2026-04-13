import { type ArtistReferenceSelection, artistReferenceSelectionSchema } from '../../../domain/schemas/artist-enrichment-payload.js';
import type { ArtistEvidenceBundle } from '../../../domain/schemas/artist-evidence.js';
import type { LlmProvider } from '../../../domain/schemas/app-settings.js';
import { ANTHROPIC_MESSAGES_MODEL } from '../anthropic-messages-model.js';
import { repairMalformedLlmJsonQuotes } from '../repair-llm-json.js';
import { ExternalServiceError } from '../../../shared/errors.js';

const OPENAI_SELECTION_MODEL = 'gpt-4.1-mini';

function extractJson(s: string): string {
  const t = s.trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return t.slice(start, end + 1);
  }
  return t;
}

function parseJsonFromModel(raw: string): unknown {
  const extracted = extractJson(raw);
  try {
    return JSON.parse(extracted);
  } catch {
    return JSON.parse(repairMalformedLlmJsonQuotes(extracted));
  }
}

async function callOpenAiSelection(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_SELECTION_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You output only valid JSON. Select candidate IDs only from the supplied bucketed candidate lists. Leave fields null when uncertain.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new ExternalServiceError(`OpenAI selection error: ${res.status} ${t}`);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? '';
}

async function callAnthropicSelection(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MESSAGES_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new ExternalServiceError(`Anthropic selection error: ${res.status} ${t}`);
  }
  const data = (await res.json()) as { content: { type: string; text: string }[] };
  return data.content.find((c) => c.type === 'text')?.text ?? '';
}

export async function selectEnrichmentReferencesFromBuckets(params: {
  provider: Exclude<LlmProvider, 'none'>;
  apiKey: string;
  artistDisplayName: string;
  evidence: ArtistEvidenceBundle;
}): Promise<{ selection: ArtistReferenceSelection; selectionModel: string }> {
  const selectionModel =
    params.provider === 'openai' ? OPENAI_SELECTION_MODEL : ANTHROPIC_MESSAGES_MODEL;
  const prompt = [
    `Artist: ${params.artistDisplayName}`,
    '',
    'Choose candidate IDs only from the bucket that matches the target. Do not reuse one generic source across many rows.',
    'For album and track rows, leave the candidate null if the bucket lacks a clearly item-specific page.',
    'For album/track rows, strongly prefer item-specific Wikipedia candidates when available and clearly matched.',
    'For the artist heading, choose only from artistReferenceCandidates.',
    'For the hero image, choose only from artistImageCandidates.',
    '',
    'artistReferenceCandidates:',
    JSON.stringify(
      params.evidence.artistReferenceCandidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        title: candidate.title,
        host: candidate.host,
        candidateKind: candidate.candidateKind,
      })),
    ),
    '',
    'artistImageCandidates:',
    JSON.stringify(
      params.evidence.artistImageCandidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        title: candidate.title,
        host: candidate.host,
        periodHint: candidate.periodHint,
      })),
    ),
    '',
    'albumReferenceBuckets:',
    JSON.stringify(
      params.evidence.albumReferenceBuckets.map((bucket) => ({
        targetName: bucket.targetName,
        candidates: bucket.candidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          url: candidate.url,
          title: candidate.title,
          host: candidate.host,
          candidateKind: candidate.candidateKind,
          appliesToName: candidate.appliesToName,
        })),
      })),
    ),
    '',
    'trackReferenceBuckets:',
    JSON.stringify(
      params.evidence.trackReferenceBuckets.map((bucket) => ({
        targetName: bucket.targetName,
        candidates: bucket.candidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          url: candidate.url,
          title: candidate.title,
          host: candidate.host,
          candidateKind: candidate.candidateKind,
          appliesToName: candidate.appliesToName,
        })),
      })),
    ),
    '',
    'Return JSON with exactly these keys:',
    '- artistPrimaryReferenceCandidateId',
    '- artistHeroImageCandidateId',
    '- albumSelections: array of { targetName, primaryReferenceCandidateId? }',
    '- trackSelections: array of { targetName, primaryReferenceCandidateId? }',
  ].join('\n');

  const raw =
    params.provider === 'openai'
      ? await callOpenAiSelection(params.apiKey, prompt)
      : await callAnthropicSelection(params.apiKey, prompt);
  const parsed = parseJsonFromModel(raw);
  const selection = artistReferenceSelectionSchema.parse(parsed);
  return { selection, selectionModel };
}
