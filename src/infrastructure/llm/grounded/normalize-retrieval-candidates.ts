import type {
  EvidenceImageCandidate,
  EvidenceReferenceCandidate,
  EvidenceSource,
} from '../../../domain/schemas/artist-evidence.js';
import { hostTrustTierForUrl } from '../../../shared/host-trust-tier.js';
import { classifyWikipediaArticleTitle, decodeWikipediaArticleTitleFromPathname } from '../../../shared/wikipedia-article-reference-tier.js';

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('utm_')) {
        u.searchParams.delete(key);
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}

function decodeUrlComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractWikimediaFileNameFromWikiPage(url: URL): string | null {
  if (!url.hostname.toLowerCase().endsWith('wikimedia.org')) {
    return null;
  }
  const decodedPath = decodeUrlComponent(url.pathname);
  if (!decodedPath.toLowerCase().startsWith('/wiki/file:')) {
    return null;
  }
  const decodedTitle = decodeWikipediaArticleTitleFromPathname(decodedPath);
  const match = /^file:(.+)$/iu.exec(decodedTitle);
  if (match == null) {
    return null;
  }
  const fileName = match[1].trim();
  return fileName.length > 0 ? fileName : null;
}

function extractWikimediaFileNameFromThumbnailUrl(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (!host.endsWith('wikimedia.org')) {
    return null;
  }
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
  const thumbSegmentIndex = segments.findIndex((segment) => segment.toLowerCase() === 'thumb');
  if (thumbSegmentIndex < 0 || thumbSegmentIndex + 3 >= segments.length) {
    return null;
  }
  const maybeFileName = decodeUrlComponent(segments[thumbSegmentIndex + 3] ?? '').trim();
  if (maybeFileName.length === 0 || !/\.(?:png|jpe?g|webp|gif)$/iu.test(maybeFileName)) {
    return null;
  }
  return maybeFileName;
}

function toWikimediaSpecialFilePathUrl(fileName: string): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}`;
}

function isDirectImageAssetUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /\.(?:png|jpe?g|webp|gif)$/iu.test(u.pathname);
  } catch {
    return false;
  }
}

function inferCandidateKind(url: string): EvidenceReferenceCandidate['candidateKind'] {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.endsWith('.wikipedia.org')) {
      const title = decodeWikipediaArticleTitleFromPathname(u.pathname);
      const wikiTier = classifyWikipediaArticleTitle(title);
      if (wikiTier === 'discography') {
        return 'discography_page';
      }
      if (wikiTier === 'release') {
        if (/\(song\)/iu.test(title)) {
          return 'track_page';
        }
        return 'album_page';
      }
      return 'artist_page';
    }
    if (host.endsWith('discogs.com') || host.endsWith('allmusic.com')) {
      return 'editorial_page';
    }
    return 'other';
  } catch {
    return 'other';
  }
}

function inferAppliesToType(
  candidateKind: EvidenceReferenceCandidate['candidateKind'],
): EvidenceReferenceCandidate['appliesToType'] {
  switch (candidateKind) {
    case 'artist_page':
    case 'official_page':
      return 'artist';
    case 'album_page':
    case 'discography_page':
      return 'album';
    case 'track_page':
      return 'track';
    case 'editorial_page':
    case 'other':
      return 'unknown';
    default:
      return 'unknown';
  }
}

export function createReferenceCandidate(params: {
  candidateId: string;
  url: string;
  title?: string;
  snippet?: string;
  sourceProvider: EvidenceReferenceCandidate['sourceProvider'];
  appliesToName?: string;
}): EvidenceReferenceCandidate {
  const url = normalizeUrl(params.url);
  const host = new URL(url).hostname.toLowerCase();
  const candidateKind = inferCandidateKind(url);
  return {
    candidateId: params.candidateId,
    url,
    title: params.title,
    host,
    candidateKind,
    appliesToType: inferAppliesToType(candidateKind),
    appliesToName: params.appliesToName,
    trustTier: hostTrustTierForUrl(url),
    sourceProvider: params.sourceProvider,
    snippet: params.snippet,
  };
}

export function createSourceFromReferenceCandidate(
  candidate: EvidenceReferenceCandidate,
  retrievedAt: Date,
): EvidenceSource {
  return {
    sourceId: candidate.candidateId,
    url: candidate.url,
    title: candidate.title,
    retrievedAt,
    sourceKind: 'page',
    snippet: candidate.snippet ?? candidate.title ?? candidate.url,
    appliesToType: candidate.appliesToType,
    appliesToName: candidate.appliesToName,
  };
}

export function createImageCandidate(params: {
  candidateId: string;
  imageUrl: string;
  sourceProvider: EvidenceImageCandidate['sourceProvider'];
  title?: string;
  sourcePageUrl?: string;
  periodHint?: string;
  altText?: string;
}): EvidenceImageCandidate {
  const normalizedInputUrl = normalizeUrl(params.imageUrl);
  let imageUrl = normalizedInputUrl;
  let sourcePageUrl = params.sourcePageUrl ? normalizeUrl(params.sourcePageUrl) : undefined;
  let parsedInputUrl: URL | null = null;
  try {
    parsedInputUrl = new URL(normalizedInputUrl);
  } catch {
    parsedInputUrl = null;
  }

  const wikimediaFileNameFromPage =
    parsedInputUrl != null ? extractWikimediaFileNameFromWikiPage(parsedInputUrl) : null;
  const wikimediaFileNameFromThumb =
    parsedInputUrl != null ? extractWikimediaFileNameFromThumbnailUrl(parsedInputUrl) : null;

  if (wikimediaFileNameFromThumb != null) {
    imageUrl = toWikimediaSpecialFilePathUrl(wikimediaFileNameFromThumb);
  }

  if (wikimediaFileNameFromPage != null) {
    sourcePageUrl = normalizedInputUrl;
    imageUrl = toWikimediaSpecialFilePathUrl(wikimediaFileNameFromPage);
  }

  if (!isDirectImageAssetUrl(imageUrl)) {
    // Invalid for rendering; keep only true direct image URLs as candidates.
    throw new TypeError('Image candidate requires a direct image asset URL');
  }
  return {
    candidateId: params.candidateId,
    imageUrl,
    sourcePageUrl,
    title: params.title,
    host: new URL(imageUrl).hostname.toLowerCase(),
    periodHint: params.periodHint,
    trustTier: hostTrustTierForUrl(imageUrl),
    sourceProvider: params.sourceProvider,
    altText: params.altText,
  };
}
