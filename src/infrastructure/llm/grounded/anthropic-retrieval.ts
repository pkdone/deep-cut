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
import {
  createImageCandidate,
  createReferenceCandidate,
  createSourceFromReferenceCandidate,
} from './normalize-retrieval-candidates.js';

const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
} as const;

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
    `${artistDisplayName} albums songs`,
    `${artistDisplayName} official site`,
    `${artistDisplayName} site:discogs.com`,
    `${artistDisplayName} site:allmusic.com`,
    `${artistDisplayName} site:britannica.com`,
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

function collectUrlsFromDigest(digest: string): { url: string; title?: string }[] {
  return [...digest.matchAll(/https:\/\/[^\s"'<>]+/giu)]
    .map((m, i) => ({
      url: m[0].replace(/[.),]+$/u, ''),
      title: `Anthropic source ${String(i + 1)}`,
    }))
    .slice(0, MAX_SOURCES);
}

function collectImageCandidatesFromDigest(
  digest: string,
): { imageUrl: string; title?: string; periodHint?: string }[] {
  return [...digest.matchAll(/https:\/\/[^\s"'<>]+/giu)]
    .map((m) => m[0].replace(/[.),]+$/u, ''))
    .filter((url) => /\.(?:png|jpe?g|webp|gif)(?:$|\?)/iu.test(url))
    .slice(0, MAX_SOURCES)
    .map((imageUrl, i) => ({
      imageUrl,
      title: `Anthropic image ${String(i + 1)}`,
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
      title: row.title ?? `Anthropic source image ${String(i + 1)}`,
      periodHint,
    }));
}

async function runAnthropicWebSearch(params: {
  apiKey: string;
  prompt: string;
}): Promise<{ digest: string; urls: { url: string; title?: string }[] }> {
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
      messages: [{ role: 'user', content: params.prompt }],
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
  return {
    digest,
    urls: collectUrlsFromDigest(digest),
  };
}

function buildBucketPrompt(params: {
  artistDisplayName: string;
  targetLabel: string;
  queries: readonly string[];
  instructions: string[];
}): string {
  return [
    'Use web search to find current information about this musical artist target.',
    `Artist: ${params.artistDisplayName}`,
    `Target: ${params.targetLabel}`,
    '',
    ...params.instructions,
    '',
    `Search ideas: ${params.queries.join(' | ')}`,
  ].join('\n');
}

export async function retrieveTargetedEnrichmentBucketsAnthropic(params: {
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
  const artistSearch = await runAnthropicWebSearch({
    apiKey: params.apiKey,
    prompt: buildBucketPrompt({
      artistDisplayName: params.artistDisplayName,
      targetLabel: 'artist primary reference',
      queries: artistQueries,
      instructions: [
        'Find the best artist or band biography / overview pages.',
        'Reject album, EP, discography, and song pages.',
        'Reply in plain prose and include useful page URLs inline when relevant.',
      ],
    }),
  });
  retrievalQueries.push(...artistQueries);
  const artistReferenceCandidates = artistSearch.urls.map((u, i) =>
    createReferenceCandidate({
      candidateId: `anthropic-artist-ref-${String(i)}`,
      url: u.url,
      title: u.title,
      snippet: artistSearch.digest.slice(0, MAX_SNIPPET_CHARS),
      sourceProvider: 'anthropic',
      appliesToName: params.artistDisplayName,
    }),
  );

  const imageQueries = [
    `${params.artistDisplayName} classic era photo`,
    `${params.artistDisplayName} iconic photo`,
    `${params.artistDisplayName} early live photo`,
    `${params.artistDisplayName} site:wikimedia.org`,
  ];
  const imageSearch = await runAnthropicWebSearch({
    apiKey: params.apiKey,
    prompt: buildBucketPrompt({
      artistDisplayName: params.artistDisplayName,
      targetLabel: 'artist hero image',
      queries: imageQueries,
      instructions: [
        'Find image or media pages that could provide a classic-period artist photo.',
        'Prefer Wikimedia Commons file pages or direct upload.wikimedia.org image assets.',
        'When possible, include direct https image URLs inline in the prose.',
      ],
    }),
  });
  retrievalQueries.push(...imageQueries);
  const digestImageCandidates = collectImageCandidatesFromDigest(imageSearch.digest);
  const sourceImageCandidates = collectImageCandidatesFromSourceUrls(
    imageSearch.urls,
    imageSearch.digest,
  );
  const rawImageCandidates = [...sourceImageCandidates, ...digestImageCandidates]
    .slice(0, MAX_SOURCES * 2);
  const artistImageCandidates = rawImageCandidates.map((u, i) =>
    {
      try {
        return createImageCandidate({
          candidateId: `anthropic-artist-img-${String(i)}`,
          imageUrl: u.imageUrl,
          title: u.title,
          periodHint: u.periodHint,
          sourceProvider: 'anthropic',
        });
      } catch {
        return null;
      }
    },
  ).filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

  const albumReferenceBuckets = [];
  for (const albumName of params.albumNames) {
    const queries = [
      `${params.artistDisplayName} ${albumName}`,
      `${params.artistDisplayName} ${albumName} wikipedia`,
      `${params.artistDisplayName} ${albumName} site:discogs.com`,
      `${params.artistDisplayName} ${albumName} site:allmusic.com`,
    ];
    const search = await runAnthropicWebSearch({
      apiKey: params.apiKey,
      prompt: buildBucketPrompt({
        artistDisplayName: params.artistDisplayName,
        targetLabel: `album reference for ${albumName}`,
        queries,
        instructions: [
          'Find pages specifically about this album or release.',
          'Prefer item-specific Wikipedia pages when available; otherwise use Discogs, AllMusic, or official pages.',
          'Do not prefer generic artist biography or discography pages when an album-specific page exists.',
          'Reply in plain prose and include useful page URLs inline when relevant.',
        ],
      }),
    });
    retrievalQueries.push(...queries);
    albumReferenceBuckets.push({
      targetName: albumName,
      candidates: search.urls.map((u, i) =>
        createReferenceCandidate({
          candidateId: `anthropic-album-${albumName}-${String(i)}`,
          url: u.url,
          title: u.title,
          snippet: search.digest.slice(0, MAX_SNIPPET_CHARS),
          sourceProvider: 'anthropic',
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
    const search = await runAnthropicWebSearch({
      apiKey: params.apiKey,
      prompt: buildBucketPrompt({
        artistDisplayName: params.artistDisplayName,
        targetLabel: `track reference for ${trackName}`,
        queries,
        instructions: [
          'Find pages specifically about this song or track.',
          'Prefer item-specific Wikipedia song/track pages when available; otherwise use reputable editorial pages.',
          'Do not choose generic artist biography, discography, or album overview pages unless they are the only evidence and still clearly song-specific.',
          'Reply in plain prose and include useful page URLs inline when relevant.',
        ],
      }),
    });
    retrievalQueries.push(...queries);
    trackReferenceBuckets.push({
      targetName: trackName,
      candidates: search.urls.map((u, i) =>
        createReferenceCandidate({
          candidateId: `anthropic-track-${trackName}-${String(i)}`,
          url: u.url,
          title: u.title,
          snippet: search.digest.slice(0, MAX_SNIPPET_CHARS),
          sourceProvider: 'anthropic',
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
    'Focus only on the artist overview needed to summarize the artist and identify notable albums, songs, and band members.',
    'Use multiple independent sources and prioritize consensus over any single publication.',
    'When evidence supports it, include the full core studio discography (including later-period releases), not only the earliest well-known albums.',
    'Also include notable live releases and compilation/rarities releases when present in sources.',
    '',
    'Reply in plain prose only (no JSON). Cover: background, notable studio albums with years if known,',
    'notable songs, key members if a band, and any relevant live or compilation highlights.',
    '',
    `Search ideas: ${queries.join(' | ')}`,
  ].join('\n');
  const { digest, urls } = await runAnthropicWebSearch({
    apiKey: params.apiKey,
    prompt,
  });

  const retrievedAt = new Date();
  const warnings: string[] = [];
  if (digest.length < 400) {
    warnings.push('Retrieval returned very little text; synthesis may be weak.');
  }

  const referenceCandidates = urls.map((u, i) =>
    createReferenceCandidate({
      candidateId: `anthropic-ref-${String(i)}`,
      url: u.url,
      title: u.title,
      snippet: digest.slice(0, MAX_SNIPPET_CHARS),
      sourceProvider: 'anthropic',
    }),
  );
  const imageCandidates = collectImageCandidatesFromDigest(digest).map((u, i) =>
    createImageCandidate({
      candidateId: `anthropic-img-${String(i)}`,
      imageUrl: u.imageUrl,
      title: u.title,
      periodHint: u.periodHint,
      sourceProvider: 'anthropic',
    }),
  );
  const sources =
    referenceCandidates.length > 0
      ? referenceCandidates.map((candidate) => createSourceFromReferenceCandidate(candidate, retrievedAt))
      : [
          {
            sourceId: 'anthropic-snippet-0',
            retrievedAt,
            sourceKind: 'search_snippet' as const,
            snippet: digest.slice(0, MAX_SNIPPET_CHARS),
          },
        ];

  const candidate = {
    artistKey: params.enrichmentArtistKey,
    artistDisplayName: params.artistDisplayName,
    requestedAt: retrievedAt,
    retrievalProvider: 'anthropic' as const,
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
    retrievalDigest: digest.length > 0 ? digest : 'No retrieval text returned.',
  };

  return artistEvidenceBundleSchema.parse(candidate);
}
