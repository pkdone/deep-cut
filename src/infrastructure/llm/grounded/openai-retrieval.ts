import type { ArtistEvidenceBundle } from '../../../domain/schemas/artist-evidence.js';
import { artistEvidenceBundleSchema } from '../../../domain/schemas/artist-evidence.js';
import { logWarn } from '../../../shared/app-logger.js';
import { ExternalServiceError } from '../../../shared/errors.js';
import {
  MAX_RETRIEVAL_DIGEST_CHARS,
  MAX_SNIPPET_CHARS,
  MAX_SOURCES,
} from './llm-evidence-caps.js';
import {
  createImageCandidate,
  createReferenceCandidate,
  createSourceFromReferenceCandidate,
} from './normalize-retrieval-candidates.js';

/** Model for Responses API retrieval pass (web search). */
export const OPENAI_RETRIEVAL_MODEL = 'gpt-4o-mini';

function buildQueries(artistDisplayName: string): string[] {
  return [
    `${artistDisplayName} wikipedia band biography`,
    `${artistDisplayName} complete studio album discography wikipedia`,
    `${artistDisplayName} live albums compilation albums`,
    `${artistDisplayName} best albums ranked`,
    `${artistDisplayName} best songs ranked`,
    `${artistDisplayName} site:rateyourmusic.com`,
    `${artistDisplayName} classic era photo`,
    `${artistDisplayName} iconic photo`,
    `${artistDisplayName} albums songs notable releases`,
    `${artistDisplayName} official site`,
    `${artistDisplayName} site:discogs.com`,
    `${artistDisplayName} site:allmusic.com`,
    `${artistDisplayName} site:britannica.com`,
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

function collectImageCandidatesFromText(
  digest: string,
): { imageUrl: string; title?: string; periodHint?: string }[] {
  const urls = [...digest.matchAll(/https:\/\/[^\s"'<>]+/giu)]
    .map((m) => m[0].replace(/[.),]+$/u, ''))
    .filter((url) => /\.(?:png|jpe?g|webp|gif)(?:$|\?)/iu.test(url));
  return urls.map((imageUrl, i) => ({
    imageUrl,
    title: `Image candidate ${String(i + 1)}`,
    periodHint: digest.toLowerCase().includes('classic') ? 'classic' : undefined,
  }));
}

function collectImageCandidatesFromSourceUrls(
  urls: readonly { url: string; title?: string }[],
  digest: string,
): { imageUrl: string; title?: string; periodHint?: string }[] {
  const periodHint = digest.toLowerCase().includes('classic') ? 'classic' : undefined;
  return urls
    .filter((row) =>
      /\.(?:png|jpe?g|webp|gif)(?:$|\?)/iu.test(row.url) ||
      /\/wiki\/file(?::|%3a)/iu.test(row.url) ||
      /\/wikipedia\/commons\/thumb\//iu.test(row.url)
    )
    .map((row, i) => ({
      imageUrl: row.url,
      title: row.title ?? `Image source ${String(i + 1)}`,
      periodHint,
    }));
}

async function runOpenAiWebSearch(params: {
  apiKey: string;
  input: string;
}): Promise<{ digest: string; urls: { url: string; title?: string }[] }> {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_RETRIEVAL_MODEL,
      input: params.input,
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
  return {
    digest: digest.slice(0, MAX_RETRIEVAL_DIGEST_CHARS),
    urls: extractSourceUrls(data),
  };
}

function buildBucketPrompt(params: {
  artistDisplayName: string;
  targetLabel: string;
  queries: readonly string[];
  instructions: string[];
}): string {
  return [
    'You are a research assistant. Use web search to find current, verifiable information for the target below.',
    `Artist: ${params.artistDisplayName}`,
    `Target: ${params.targetLabel}`,
    '',
    ...params.instructions,
    '',
    `Search ideas: ${params.queries.join(' | ')}`,
  ].join('\n');
}

export async function retrieveTargetedEnrichmentBucketsOpenAi(params: {
  apiKey: string;
  artistDisplayName: string;
  albumNames: readonly string[];
  trackNames: readonly string[];
}): Promise<{
  retrievalQueries: string[];
  artistReferenceCandidates: Awaited<ReturnType<typeof createReferenceCandidate>>[];
  artistImageCandidates: Awaited<ReturnType<typeof createImageCandidate>>[];
  albumReferenceBuckets: { targetName: string; candidates: Awaited<ReturnType<typeof createReferenceCandidate>>[] }[];
  trackReferenceBuckets: { targetName: string; candidates: Awaited<ReturnType<typeof createReferenceCandidate>>[] }[];
  referenceCandidates: Awaited<ReturnType<typeof createReferenceCandidate>>[];
  imageCandidates: Awaited<ReturnType<typeof createImageCandidate>>[];
  sources: ReturnType<typeof createSourceFromReferenceCandidate>[];
  retrievalDigest: string;
  warnings: string[];
}> {
  const retrievalQueries: string[] = [];
  const warnings: string[] = [];

  const artistQueries = [
    `${params.artistDisplayName} wikipedia band biography`,
    `${params.artistDisplayName} official site`,
    `${params.artistDisplayName} britannica`,
  ];
  const artistSearch = await runOpenAiWebSearch({
    apiKey: params.apiKey,
    input: buildBucketPrompt({
      artistDisplayName: params.artistDisplayName,
      targetLabel: 'artist primary reference',
      queries: artistQueries,
      instructions: [
        'Find the best artist or band biography / overview pages.',
        'Reject album, EP, discography, and song pages.',
        'Reply in plain prose and include useful page URLs in the text when relevant.',
      ],
    }),
  });
  retrievalQueries.push(...artistQueries);
  const artistReferenceCandidates = artistSearch.urls.slice(0, MAX_SOURCES).map((u, i) =>
    createReferenceCandidate({
      candidateId: `openai-artist-ref-${String(i)}`,
      url: u.url,
      title: u.title,
      snippet: u.title ?? u.url.slice(0, MAX_SNIPPET_CHARS),
      sourceProvider: 'openai',
      appliesToName: params.artistDisplayName,
    }),
  );

  const imageQueries = [
    `${params.artistDisplayName} classic era photo`,
    `${params.artistDisplayName} iconic photo`,
    `${params.artistDisplayName} early live photo`,
    `${params.artistDisplayName} site:wikimedia.org`,
  ];
  const imageSearch = await runOpenAiWebSearch({
    apiKey: params.apiKey,
    input: buildBucketPrompt({
      artistDisplayName: params.artistDisplayName,
      targetLabel: 'artist hero image',
      queries: imageQueries,
      instructions: [
        'Find image or media pages that could provide a classic-period artist photo.',
        'Prefer Wikimedia Commons file pages or direct upload.wikimedia.org image assets.',
        'When possible, include direct https image URLs in the prose, especially from Wikimedia image hosts.',
      ],
    }),
  });
  retrievalQueries.push(...imageQueries);
  const digestImageCandidates = collectImageCandidatesFromText(imageSearch.digest);
  const sourceImageCandidates = collectImageCandidatesFromSourceUrls(
    imageSearch.urls,
    imageSearch.digest,
  );
  const rawImageCandidates = [...sourceImageCandidates, ...digestImageCandidates]
    .slice(0, MAX_SOURCES * 2);
  const artistImageCandidates = rawImageCandidates
    .flatMap((u, i) => {
      try {
        return [
          createImageCandidate({
            candidateId: `openai-artist-img-${String(i)}`,
            imageUrl: u.imageUrl,
            title: u.title,
            periodHint: u.periodHint,
            sourceProvider: 'openai',
          }),
        ];
      } catch {
        return [];
      }
    });

  const albumReferenceBuckets = [];
  for (const albumName of params.albumNames) {
    const queries = [
      `${params.artistDisplayName} ${albumName}`,
      `${params.artistDisplayName} ${albumName} wikipedia`,
      `${params.artistDisplayName} ${albumName} site:discogs.com`,
      `${params.artistDisplayName} ${albumName} site:allmusic.com`,
    ];
    const search = await runOpenAiWebSearch({
      apiKey: params.apiKey,
      input: buildBucketPrompt({
        artistDisplayName: params.artistDisplayName,
        targetLabel: `album reference for ${albumName}`,
        queries,
        instructions: [
          'Find pages specifically about this album or release.',
          'Prefer item-specific Wikipedia pages when available; otherwise use Discogs, AllMusic, or official pages.',
          'Do not prefer generic artist biography or discography pages when an album-specific page exists.',
          'Reply in plain prose and include useful page URLs in the text when relevant.',
        ],
      }),
    });
    retrievalQueries.push(...queries);
    albumReferenceBuckets.push({
      targetName: albumName,
      candidates: search.urls.slice(0, MAX_SOURCES).map((u, i) =>
        createReferenceCandidate({
          candidateId: `openai-album-${albumName}-${String(i)}`,
          url: u.url,
          title: u.title,
          snippet: u.title ?? u.url.slice(0, MAX_SNIPPET_CHARS),
          sourceProvider: 'openai',
          appliesToName: albumName,
        }),
      ),
    });
  }

  const trackReferenceBuckets = [];
  for (const trackName of params.trackNames) {
    const queries = [
      `${params.artistDisplayName} ${trackName}`,
      `${params.artistDisplayName} ${trackName} wikipedia`,
      `${params.artistDisplayName} ${trackName} lyrics meaning review`,
    ];
    const search = await runOpenAiWebSearch({
      apiKey: params.apiKey,
      input: buildBucketPrompt({
        artistDisplayName: params.artistDisplayName,
        targetLabel: `track reference for ${trackName}`,
        queries,
        instructions: [
          'Find pages specifically about this song or track.',
          'Prefer item-specific Wikipedia song/track pages when available; otherwise use reputable editorial pages.',
          'Do not choose generic artist biography, discography, or album overview pages unless they are the only evidence and still clearly song-specific.',
          'Reply in plain prose and include useful page URLs in the text when relevant.',
        ],
      }),
    });
    retrievalQueries.push(...queries);
    trackReferenceBuckets.push({
      targetName: trackName,
      candidates: search.urls.slice(0, MAX_SOURCES).map((u, i) =>
        createReferenceCandidate({
          candidateId: `openai-track-${trackName}-${String(i)}`,
          url: u.url,
          title: u.title,
          snippet: u.title ?? u.url.slice(0, MAX_SNIPPET_CHARS),
          sourceProvider: 'openai',
          appliesToName: trackName,
        }),
      ),
    });
  }

  const referenceCandidates = [
    ...artistReferenceCandidates,
    ...albumReferenceBuckets.flatMap((bucket) => bucket.candidates),
    ...trackReferenceBuckets.flatMap((bucket) => bucket.candidates),
  ];
  const imageCandidates = [...artistImageCandidates];
  const sources = referenceCandidates.map((candidate) =>
    createSourceFromReferenceCandidate(candidate, new Date()),
  );
  const retrievalDigest = [
    artistSearch.digest,
    imageSearch.digest,
    ...albumReferenceBuckets.map((bucket) =>
      `${bucket.targetName}: ${bucket.candidates.map((candidate) => candidate.url).join(' ')}`,
    ),
    ...trackReferenceBuckets.map((bucket) =>
      `${bucket.targetName}: ${bucket.candidates.map((candidate) => candidate.url).join(' ')}`,
    ),
  ]
    .filter((part) => part.length > 0)
    .join('\n\n')
    .slice(0, MAX_RETRIEVAL_DIGEST_CHARS);

  if (artistReferenceCandidates.length === 0) {
    warnings.push('Targeted artist reference retrieval returned no structured candidates.');
  }
  if (artistImageCandidates.length === 0) {
    warnings.push('Targeted artist image retrieval returned no structured image candidates.');
  }

  return {
    retrievalQueries,
    artistReferenceCandidates,
    artistImageCandidates,
    albumReferenceBuckets,
    trackReferenceBuckets,
    referenceCandidates,
    imageCandidates,
    sources,
    retrievalDigest,
    warnings,
  };
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
    'Focus only on the artist overview needed to summarize the artist and identify notable albums, songs, and band members.',
    'Do not try to solve per-track links, per-album links, or hero images in this stage.',
    'Use multiple independent sources and prioritize consensus over any single publication.',
    'When evidence supports it, include the full core studio discography (including later-period releases), not only the earliest well-known albums.',
    'Also include notable live releases and compilation/rarities releases when present in sources.',
    '',
    'Reply in plain prose only (no JSON). Cover: background, notable studio albums with years if known,',
    'notable songs, live or compilation releases if relevant, and key band members if applicable.',
    'Prefer reputable overview sources and note uncertainty.',
    '',
    `Search ideas: ${queries.join(' | ')}`,
  ].join('\n');
  const { digest, urls } = await runOpenAiWebSearch({
    apiKey: params.apiKey,
    input,
  });
  const retrievedAt = new Date();
  const referenceCandidates = urls.map((u, i) =>
    createReferenceCandidate({
      candidateId: `openai-ref-${String(i)}`,
      url: u.url,
      title: u.title,
      snippet: u.title ?? u.url.slice(0, MAX_SNIPPET_CHARS),
      sourceProvider: 'openai',
    }),
  );
  const imageCandidates = collectImageCandidatesFromText(digest)
    .slice(0, MAX_SOURCES)
    .map((u, i) =>
      createImageCandidate({
        candidateId: `openai-img-${String(i)}`,
        imageUrl: u.imageUrl,
        title: u.title,
        periodHint: u.periodHint,
        sourceProvider: 'openai',
      }),
    );
  const sources = referenceCandidates.map((candidate) =>
    createSourceFromReferenceCandidate(candidate, retrievedAt),
  );

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
    artistReferenceCandidates: [],
    artistImageCandidates: [],
    albumReferenceBuckets: [],
    trackReferenceBuckets: [],
    referenceCandidates,
    imageCandidates,
    normalizedSynopsisFacts: digest.split('\n').filter((l) => l.trim().length > 0).slice(0, 80),
    normalizedAlbumHints: [],
    normalizedTrackHints: [],
    warnings,
    status: digest.length >= 200 ? ('ok' as const) : ('degraded' as const),
    retrievalDigest: digest,
  };

  return artistEvidenceBundleSchema.parse(candidate);
}
