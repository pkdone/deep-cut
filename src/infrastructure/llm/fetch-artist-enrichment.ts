import { artistEnrichmentPayloadSchema } from '../../domain/schemas/artist-enrichment.js';
import type { ArtistEnrichmentCache } from '../../domain/schemas/artist-enrichment.js';
import type { LlmProvider } from '../../domain/schemas/app-settings.js';
import { ANTHROPIC_MESSAGES_MODEL } from './anthropic-messages-model.js';
import { repairMalformedLlmJsonQuotes } from './repair-llm-json.js';
import { logError } from '../../shared/app-logger.js';
import { ExternalServiceError } from '../../shared/errors.js';

/** OpenAI Chat Completions model id for artist enrichment when provider is OpenAI (GPT-4.1 mini). */
const OPENAI_ENRICHMENT_MODEL = 'gpt-4.1-mini';

const ENRICHMENT_JSON_INSTRUCTION = [
  'Return a single JSON object with exactly these keys:',
  '- synopsis: string, one opening paragraph of 6 to 8 sentences; each sentence must be fairly long and substantive; no bullet lists inside synopsis; at least ~320 characters total.',
  '- rankedAlbums: array of { name, releaseYear, rank } — notable studio albums only (original studio LPs and core studio releases), ranked by significance (rank 1 = most important). Do not put live albums, compilations, soundtracks, or rarities collections here — use the other arrays for those. Include up to 20 entries; sort ranks from 1 upward without gaps where possible.',
  '- topTracks: array of exactly 10 objects { title, rank, releaseYear? } — ranks 1 through 10 exactly once each; include releaseYear when known for that recording (optional).',
  '- liveAlbums: at most 3 objects { name, releaseYear, rank } — ranks 1–3 within this list only; official live or concert releases.',
  '- bestOfCompilations: at most 3 objects { name, releaseYear, rank } — ranks 1–3 within this list; greatest-hits or anthologies.',
  '- raritiesCompilations: at most 3 objects { name, releaseYear, rank } — ranks 1–3 within this list; B-sides, outtakes, rarities collections.',
  '- bandMembers: array of { name, instruments, periods } — instruments is string array (e.g. ["vocals","guitar"]). periods is non-empty array of { startYear, endYear } where endYear may be null if still in the band; use multiple objects for boomerang members (e.g. 1990–1995 then 1998–2001). Order members from most significant first.',
  'IMPORTANT: rankedAlbums (studio albums only) and topTracks are required — populate rankedAlbums and exactly 10 topTracks. Fill live/best-of/rarities when fitting releases exist, each with distinct ranks 1..n within that array.',
  'releaseYear is a number (e.g. 1993). Base everything on general knowledge; the app does not supply an external catalog.',
  'Strict JSON only: wrap strings with a single " character; never write \\" before an opening or closing quote — that is invalid JSON.',
].join(' ');

export async function fetchArtistEnrichment(params: {
  provider: Exclude<LlmProvider, 'none'>;
  apiKey: string;
  enrichmentArtistKey: string;
  artistDisplayName: string;
}): Promise<ArtistEnrichmentCache> {
  const userPrompt = [
    `Artist: ${params.artistDisplayName}`,
    '',
    'Produce JSON only as specified. rankedAlbums must be studio albums only — important original studio releases (do not duplicate titles from liveAlbums, bestOfCompilations, or raritiesCompilations); topTracks must be exactly ten distinct songs with ranks 1–10. Classify releases carefully: live recordings belong in liveAlbums; career-spanning hits sets and anthologies in bestOfCompilations; B-sides, demos, and rarities box sets in raritiesCompilations. For solo artists or one core member, bandMembers may have one entry or a short list as appropriate.',
    '',
    ENRICHMENT_JSON_INSTRUCTION,
  ].join('\n');

  let raw: string;
  if (params.provider === 'openai') {
    raw = await callOpenAi(params.apiKey, userPrompt);
  } else {
    raw = await callAnthropic(params.apiKey, userPrompt);
  }

  const extracted = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted);
  } catch (first) {
    try {
      parsed = JSON.parse(repairMalformedLlmJsonQuotes(extracted));
    } catch (second) {
      logError('LLM JSON parse failed', {
        error: String(second),
        afterRepair: true,
        firstError: String(first),
        raw: raw.slice(0, 500),
      });
      throw new ExternalServiceError('Artist enrichment returned invalid JSON');
    }
  }

  const payload = artistEnrichmentPayloadSchema.parse(parsed);

  return {
    enrichmentArtistKey: params.enrichmentArtistKey,
    artistName: params.artistDisplayName,
    payload,
    cachedAt: new Date(),
    provider: params.provider,
    docSchemaVersion: 4,
  };
}

function extractJson(s: string): string {
  const t = s.trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return t.slice(start, end + 1);
  }
  return t;
}

async function callOpenAi(apiKey: string, user: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_ENRICHMENT_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You output only valid JSON for music artist summaries. Use standard JSON string quoting: a double quote to start and end each string; do not emit \\" at string boundaries.',
        },
        { role: 'user', content: user },
      ],
      temperature: 0.4,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new ExternalServiceError(`OpenAI error: ${res.status} ${t}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]?.message?.content ?? '';
}

async function callAnthropic(apiKey: string, user: string): Promise<string> {
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
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new ExternalServiceError(`Anthropic error: ${res.status} ${t}`);
  }
  const data = (await res.json()) as {
    content: { type: string; text: string }[];
  };
  const block = data.content.find((c) => c.type === 'text');
  return block?.text ?? '';
}
