import { artistEnrichmentPayloadSchema } from '../../domain/schemas/artist-enrichment.js';
import type { ArtistEnrichmentCache } from '../../domain/schemas/artist-enrichment.js';
import type { LlmProvider } from '../../domain/schemas/app-settings.js';
import { getArtistAlbums, getArtistTopTracks } from '../spotify/spotify-api.js';
import { logError } from '../../shared/app-logger.js';
import { ExternalServiceError } from '../../shared/errors.js';

const ENRICHMENT_JSON_INSTRUCTION = `Return a single JSON object with keys: synopsis (string), albums (array of {name, releaseYear, rank}), topTracks (array of exactly 10 {title, rank}). Ranks start at 1.`;

export async function fetchArtistEnrichment(params: {
  provider: Exclude<LlmProvider, 'none'>;
  apiKey: string;
  accessToken: string;
  spotifyArtistId: string;
  artistName: string;
}): Promise<ArtistEnrichmentCache> {
  const albums = await getArtistAlbums(params.accessToken, params.spotifyArtistId);
  const top = await getArtistTopTracks(params.accessToken, params.spotifyArtistId);
  const context = [
    `Artist: ${params.artistName}`,
    `Albums (from Spotify): ${albums.map((a) => `${a.name} (${a.releaseYear ?? '?'})`).join('; ')}`,
    `Top tracks (from Spotify): ${top.map((t) => t.name).join('; ')}`,
  ].join('\n');

  const userPrompt = `${context}\n\n${ENRICHMENT_JSON_INSTRUCTION}`;

  let raw: string;
  if (params.provider === 'openai') {
    raw = await callOpenAi(params.apiKey, userPrompt);
  } else {
    raw = await callAnthropic(params.apiKey, userPrompt);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch (e) {
    logError('LLM JSON parse failed', { error: String(e), raw: raw.slice(0, 500) });
    throw new ExternalServiceError('Artist enrichment returned invalid JSON');
  }

  const payload = artistEnrichmentPayloadSchema.parse(parsed);

  return {
    spotifyArtistId: params.spotifyArtistId,
    artistName: params.artistName,
    payload,
    cachedAt: new Date(),
    provider: params.provider,
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
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You output only valid JSON for music artist summaries.' },
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
      model: 'claude-3-5-haiku-20241022',
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
