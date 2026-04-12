import type { ArtistEvidenceBundle } from '../../../domain/schemas/artist-evidence.js';
import { artistEvidenceBundleSchema } from '../../../domain/schemas/artist-evidence.js';
import { logWarn } from '../../../shared/app-logger.js';
import { ExternalServiceError } from '../../../shared/errors.js';
import {
  MAX_RETRIEVAL_DIGEST_CHARS,
  MAX_SNIPPET_CHARS,
  MAX_SOURCES,
} from './llm-evidence-caps.js';

/** Model for Responses API retrieval pass (web search). */
export const OPENAI_RETRIEVAL_MODEL = 'gpt-4o-mini';

function buildQueries(artistDisplayName: string): string[] {
  return [
    `${artistDisplayName} musician band biography discography`,
    `${artistDisplayName} albums songs notable releases`,
  ];
}

function extractOutputText(data: unknown): string {
  if (typeof data !== 'object' || data === null) {
    return '';
  }
  const d = data as Record<string, unknown>;
  if (typeof d.output_text === 'string' && d.output_text.length > 0) {
    return d.output_text;
  }
  const output = d.output;
  if (!Array.isArray(output)) {
    return '';
  }
  const parts: string[] = [];
  for (const item of output) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const it = item as Record<string, unknown>;
    if (it.type === 'message' && Array.isArray(it.content)) {
      for (const c of it.content) {
        if (typeof c === 'object' && c !== null && (c as { type?: string }).type === 'output_text') {
          const t = (c as { text?: string }).text;
          if (typeof t === 'string') {
            parts.push(t);
          }
        }
      }
    }
  }
  return parts.join('\n\n');
}

function extractSourceUrls(data: unknown): { url: string; title?: string }[] {
  const out: { url: string; title?: string }[] = [];
  if (typeof data !== 'object' || data === null) {
    return out;
  }
  const output = (data as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return out;
  }
  for (const item of output) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const it = item as Record<string, unknown>;
    if (it.type === 'web_search_call' && typeof it.action === 'object' && it.action !== null) {
      const sources = (it.action as { sources?: { url?: string; title?: string }[] }).sources;
      if (Array.isArray(sources)) {
        for (const s of sources) {
          const row = s as { url?: unknown; title?: unknown };
          if (typeof row.url === 'string' && row.url.length > 0) {
            out.push({
              url: row.url,
              title: typeof row.title === 'string' ? row.title : undefined,
            });
          }
        }
      }
    }
  }
  return out.slice(0, MAX_SOURCES);
}

/**
 * Retrieve web-grounded text about an artist via OpenAI Responses API + web_search tool.
 */
export async function retrieveArtistEvidenceOpenAi(params: {
  apiKey: string;
  enrichmentArtistKey: string;
  artistDisplayName: string;
}): Promise<ArtistEvidenceBundle> {
  const queries = buildQueries(params.artistDisplayName);
  const input = [
    'You are a research assistant. Use web search to find current, verifiable information about the musical artist below.',
    `Artist: ${params.artistDisplayName}`,
    '',
    'Summarize in plain text (no JSON): background, notable studio albums with approximate years if known,',
    'notable songs, live or compilation releases if relevant, and key band members if applicable.',
    'Prefer reputable sources; note uncertainty.',
  ].join('\n');

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_RETRIEVAL_MODEL,
      input,
      tools: [{ type: 'web_search' }],
      tool_choice: 'auto',
      include: ['web_search_call.action.sources'],
    }),
  });

  const rawText = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(rawText) as unknown;
  } catch {
    throw new ExternalServiceError(`OpenAI retrieval returned non-JSON: ${res.status}`);
  }

  if (!res.ok) {
    logWarn('OpenAI retrieval HTTP error', { status: res.status, body: rawText.slice(0, 800) });
    throw new ExternalServiceError(`OpenAI retrieval error: ${res.status}`);
  }

  let digest = extractOutputText(data);
  if (digest.length === 0) {
    digest =
      typeof data === 'object' && data !== null && 'error' in data
        ? JSON.stringify(data)
        : rawText;
  }
  digest = digest.slice(0, MAX_RETRIEVAL_DIGEST_CHARS);

  const urls = extractSourceUrls(data);
  const retrievedAt = new Date();
  const sources = urls.map((u, i) => ({
    sourceId: `openai-${String(i)}`,
    url: u.url,
    title: u.title,
    retrievedAt,
    sourceKind: 'search_snippet' as const,
    snippet: u.title ?? u.url.slice(0, MAX_SNIPPET_CHARS),
  }));

  const warnings: string[] = [];
  if (digest.length < 400) {
    warnings.push('Retrieval returned very little text; synthesis may be weak.');
  }

  const candidate = {
    artistKey: params.enrichmentArtistKey,
    artistDisplayName: params.artistDisplayName,
    requestedAt: retrievedAt,
    retrievalProvider: 'openai' as const,
    retrievalQueries: queries,
    sources,
    normalizedSynopsisFacts: digest.split('\n').filter((l) => l.trim().length > 0).slice(0, 80),
    normalizedAlbumHints: [],
    normalizedTrackHints: [],
    warnings,
    status: digest.length >= 200 ? ('ok' as const) : ('degraded' as const),
    retrievalDigest: digest,
  };

  return artistEvidenceBundleSchema.parse(candidate);
}
