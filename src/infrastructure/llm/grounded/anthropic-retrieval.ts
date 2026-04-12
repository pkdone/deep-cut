import type { ArtistEvidenceBundle } from '../../../domain/schemas/artist-evidence.js';
import { artistEvidenceBundleSchema } from '../../../domain/schemas/artist-evidence.js';
import { ANTHROPIC_MESSAGES_MODEL } from '../anthropic-messages-model.js';
import { logWarn } from '../../../shared/app-logger.js';
import { ExternalServiceError } from '../../../shared/errors.js';
import {
  MAX_RETRIEVAL_DIGEST_CHARS,
  MAX_SNIPPET_CHARS,
  MAX_SOURCES,
} from './llm-evidence-caps.js';

const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
} as const;

function buildQueries(artistDisplayName: string): string[] {
  return [
    `${artistDisplayName} musician biography discography`,
    `${artistDisplayName} albums songs`,
  ];
}

function extractAssistantText(data: unknown): string {
  if (typeof data !== 'object' || data === null) {
    return '';
  }
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return '';
  }
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block !== 'object' || block === null) {
      continue;
    }
    const b = block as { type?: string; text?: string };
    if (b.type === 'text' && typeof b.text === 'string') {
      parts.push(b.text);
    }
  }
  return parts.join('\n\n');
}

/**
 * Retrieve web-grounded text via Anthropic Messages API + web search tool.
 */
export async function retrieveArtistEvidenceAnthropic(params: {
  apiKey: string;
  enrichmentArtistKey: string;
  artistDisplayName: string;
}): Promise<ArtistEvidenceBundle> {
  const queries = buildQueries(params.artistDisplayName);
  const prompt = [
    'Use web search to find current information about this musical artist.',
    `Artist: ${params.artistDisplayName}`,
    '',
    'Reply in plain prose only (no JSON). Cover: background, notable studio albums with years if known,',
    'notable songs, key members if a band, and any relevant live or compilation highlights.',
  ].join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': params.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MESSAGES_MODEL,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
      tools: [WEB_SEARCH_TOOL],
    }),
  });

  const rawText = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(rawText) as unknown;
  } catch {
    throw new ExternalServiceError(`Anthropic retrieval returned non-JSON: ${res.status}`);
  }

  if (!res.ok) {
    logWarn('Anthropic retrieval HTTP error', { status: res.status, body: rawText.slice(0, 800) });
    throw new ExternalServiceError(`Anthropic retrieval error: ${res.status}`);
  }

  let digest = extractAssistantText(data);
  digest = digest.slice(0, MAX_RETRIEVAL_DIGEST_CHARS);

  const retrievedAt = new Date();
  const warnings: string[] = [];
  if (digest.length < 400) {
    warnings.push('Retrieval returned very little text; synthesis may be weak.');
  }

  const sources = Array.from({ length: Math.min(1, MAX_SOURCES) }, (_, i) => ({
    sourceId: `anthropic-${String(i)}`,
    retrievedAt,
    sourceKind: 'search_snippet' as const,
    snippet: digest.slice(0, MAX_SNIPPET_CHARS),
  }));

  const candidate = {
    artistKey: params.enrichmentArtistKey,
    artistDisplayName: params.artistDisplayName,
    requestedAt: retrievedAt,
    retrievalProvider: 'anthropic' as const,
    retrievalQueries: queries,
    sources,
    normalizedSynopsisFacts: digest.split('\n').filter((l) => l.trim().length > 0).slice(0, 80),
    normalizedAlbumHints: [],
    normalizedTrackHints: [],
    warnings,
    status: digest.length >= 200 ? ('ok' as const) : ('degraded' as const),
    retrievalDigest: digest.length > 0 ? digest : 'No retrieval text returned.',
  };

  return artistEvidenceBundleSchema.parse(candidate);
}
