import { z } from 'zod';
import type { ArtistImageCacheRecord } from '../../domain/schemas/artist-image-cache-record.js';
import { hostTrustTierForUrl } from '../../shared/host-trust-tier.js';
import { normalizeArtistNameForEnrichmentKey } from '../../shared/normalize-artist-name-for-enrichment-key.js';
import { ExternalServiceError } from '../../shared/errors.js';

const MUSIC_BRAINZ_BASE_URL = 'https://musicbrainz.org/ws/2';
const WIKIDATA_ENTITY_BASE_URL = 'https://www.wikidata.org/wiki/Special:EntityData';
const WIKIDATA_PAGE_BASE_URL = 'https://www.wikidata.org/wiki';
const WIKIMEDIA_FILE_PATH_BASE_URL = 'https://commons.wikimedia.org/wiki/Special:FilePath';
const MUSIC_BRAINZ_USER_AGENT = 'DeepCut/0.1.0 ( https://github.com/deepcut )';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_MUSIC_BRAINZ_SEARCH_RESULTS = 8;

const musicBrainzSearchResponseSchema = z.object({
  artists: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      score: z.union([z.string(), z.number()]).nullish(),
      disambiguation: z.string().nullish(),
    }),
  ),
});

const musicBrainzArtistLookupSchema = z.object({
  relations: z
    .array(
      z.object({
        type: z.string().nullish(),
        url: z
          .object({
            resource: z.string().url().nullish(),
          })
          .nullish(),
      }),
    )
    .nullish(),
});

const wikidataEntityResponseSchema = z.object({
  entities: z.record(
    z.object({
      claims: z
        .record(
          z.array(
            z.object({
              mainsnak: z
                .object({
                  datavalue: z
                    .object({
                      value: z.unknown(),
                    })
                    .nullish(),
                })
                .nullish(),
            }),
          ),
        )
        .nullish(),
    }),
  ),
});

type MusicBrainzArtistSearchResult = z.infer<typeof musicBrainzSearchResponseSchema>['artists'][number];

function buildTimeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  controller.signal.addEventListener('abort', () => {
    clearTimeout(timeout);
  });
  return controller.signal;
}

async function fetchJson<T>(url: string, schema: z.ZodType<T>, headers?: HeadersInit): Promise<T> {
  const res = await fetch(url, {
    headers,
    signal: buildTimeoutSignal(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new ExternalServiceError(
      `Artist image provider request failed: ${res.status} ${body.slice(0, 200)}`,
    );
  }
  const raw = (await res.json()) as unknown;
  return schema.parse(raw);
}

function scoreMusicBrainzCandidate(
  artist: MusicBrainzArtistSearchResult,
  normalizedDisplayName: string,
): number {
  const apiScore = Number(artist.score ?? '0');
  const normalizedCandidate = normalizeArtistNameForEnrichmentKey(artist.name);
  let score = Number.isFinite(apiScore) ? apiScore : 0;
  if (normalizedCandidate === normalizedDisplayName) {
    score += 60;
  } else if (normalizedCandidate.includes(normalizedDisplayName)) {
    score += 20;
  }
  if ((artist.disambiguation ?? '').length === 0) {
    score += 5;
  }
  return score;
}

function extractWikidataEntityId(relations: z.infer<typeof musicBrainzArtistLookupSchema>['relations']): string | null {
  if (relations == null) {
    return null;
  }
  for (const relation of relations) {
    const isWikidata = relation.type === 'wikidata';
    const resource = relation.url?.resource ?? '';
    if (!isWikidata || resource.length === 0) {
      continue;
    }
    const parsed = /^https?:\/\/www\.wikidata\.org\/wiki\/(Q\d+)$/i.exec(resource);
    if (parsed != null) {
      return parsed[1];
    }
  }
  return null;
}

function extractWikimediaFileName(entityJson: z.infer<typeof wikidataEntityResponseSchema>, entityId: string): string | null {
  const entities = entityJson.entities as Record<
    string,
    z.infer<typeof wikidataEntityResponseSchema>['entities'][string] | undefined
  >;
  const entity = entities[entityId];
  if (entity == null) {
    return null;
  }
  const p18Claims = entity.claims?.P18;
  if (p18Claims == null || p18Claims.length === 0) {
    return null;
  }
  for (const claim of p18Claims) {
    const value = claim.mainsnak?.datavalue?.value;
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return null;
}

async function findBestMusicBrainzArtist(artistDisplayName: string): Promise<MusicBrainzArtistSearchResult | null> {
  const query = encodeURIComponent(`artist:${artistDisplayName}`);
  const searchUrl =
    `${MUSIC_BRAINZ_BASE_URL}/artist/?fmt=json&limit=${String(MAX_MUSIC_BRAINZ_SEARCH_RESULTS)}` +
    `&query=${query}`;
  const parsed = await fetchJson(searchUrl, musicBrainzSearchResponseSchema, {
    Accept: 'application/json',
    'User-Agent': MUSIC_BRAINZ_USER_AGENT,
  });
  if (parsed.artists.length === 0) {
    return null;
  }
  const normalizedDisplayName = normalizeArtistNameForEnrichmentKey(artistDisplayName);
  const ranked = [...parsed.artists].sort(
    (a, b) =>
      scoreMusicBrainzCandidate(b, normalizedDisplayName) -
      scoreMusicBrainzCandidate(a, normalizedDisplayName),
  );
  return ranked[0] ?? null;
}

async function findWikidataEntityIdForMusicBrainzArtist(musicBrainzArtistId: string): Promise<string | null> {
  const lookupUrl = `${MUSIC_BRAINZ_BASE_URL}/artist/${musicBrainzArtistId}?fmt=json&inc=url-rels`;
  const parsed = await fetchJson(lookupUrl, musicBrainzArtistLookupSchema, {
    Accept: 'application/json',
    'User-Agent': MUSIC_BRAINZ_USER_AGENT,
  });
  return extractWikidataEntityId(parsed.relations);
}

async function resolveWikimediaFileNameFromWikidata(entityId: string): Promise<string | null> {
  const entityUrl = `${WIKIDATA_ENTITY_BASE_URL}/${entityId}.json`;
  const parsed = await fetchJson(entityUrl, wikidataEntityResponseSchema, {
    Accept: 'application/json',
  });
  return extractWikimediaFileName(parsed, entityId);
}

/**
 * Resolve an artist hero image from public no-login providers only.
 */
export async function resolveArtistImageFromPublicSources(params: {
  enrichmentArtistKey: string;
  artistDisplayName: string;
}): Promise<ArtistImageCacheRecord | null> {
  const displayName = params.artistDisplayName.trim();
  if (displayName === '') {
    return null;
  }
  const artist = await findBestMusicBrainzArtist(displayName);
  if (artist == null) {
    return null;
  }
  const wikidataEntityId = await findWikidataEntityIdForMusicBrainzArtist(artist.id);
  if (wikidataEntityId == null) {
    return null;
  }
  const wikimediaFileName = await resolveWikimediaFileNameFromWikidata(wikidataEntityId);
  if (wikimediaFileName == null) {
    return null;
  }
  const imageUrl = `${WIKIMEDIA_FILE_PATH_BASE_URL}/${encodeURIComponent(wikimediaFileName)}`;
  const host = new URL(imageUrl).hostname.toLowerCase();
  return {
    enrichmentArtistKey: params.enrichmentArtistKey,
    artistName: displayName,
    imageUrl,
    sourcePageUrl: `${WIKIDATA_PAGE_BASE_URL}/${wikidataEntityId}`,
    host,
    trustTier: hostTrustTierForUrl(imageUrl),
    provider: 'musicbrainz_wikimedia',
    docSchemaVersion: 1,
    cachedAt: new Date(),
    musicBrainzArtistId: artist.id,
    wikidataEntityId,
    wikimediaFileName,
  };
}
