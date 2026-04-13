import { normalizeArtistNameForEnrichmentKey } from './normalize-artist-name-for-enrichment-key.js';

/**
 * Wikipedia article title classification for reference URL selection.
 * Shared by artist-level primary URL picking and per-row work URL filtering.
 */

export type WikipediaArticleTier = 'artist' | 'discography' | 'release';

function normalizeWikipediaTitleForComparison(value: string): string {
  return normalizeArtistNameForEnrichmentKey(value.replace(/\([^)]*\)/gu, ' '));
}

function wikipediaTitleMatchesTarget(decodedTitle: string, targetName: string): boolean {
  const normalizedTitle = normalizeWikipediaTitleForComparison(decodedTitle);
  const normalizedTarget = normalizeWikipediaTitleForComparison(targetName);
  if (normalizedTitle.length === 0 || normalizedTarget.length === 0) {
    return false;
  }
  return normalizedTitle === normalizedTarget ||
    normalizedTitle.includes(normalizedTarget) ||
    normalizedTarget.includes(normalizedTitle);
}

export function decodeWikipediaArticleTitleFromPathname(pathname: string): string {
  if (!pathname.startsWith('/wiki/')) {
    return '';
  }
  const raw = pathname.slice('/wiki/'.length);
  try {
    return decodeURIComponent(raw.replace(/_/gu, ' '));
  } catch {
    return raw.replace(/_/gu, ' ');
  }
}

/** Album, song, single, soundtrack, etc. — work pages (not main artist article). */
function wikipediaTitleSuggestsReleasePage(decodedTitle: string): boolean {
  const paren = /\(([^)]+)\)\s*$/u.exec(decodedTitle.trim());
  if (!paren) {
    return false;
  }
  const dis = paren[1].toLowerCase();
  if (/\bband\b|\bmusician\b|\bsinger\b|\bgroup\b|\bduo\b|\btrio\b|\brapper\b/.test(dis)) {
    return false;
  }
  if (/\b(album|song|single|soundtrack|ep|compilation|video)\b/.test(dis)) {
    return true;
  }
  if (dis.includes('album')) {
    return true;
  }
  return false;
}

function wikipediaTitleSuggestsDiscographyPage(decodedTitle: string): boolean {
  return /\bdiscography\b/iu.test(decodedTitle);
}

/** Classifies a decoded Wikipedia article title (see decodeWikipediaArticleTitleFromPathname). */
export function classifyWikipediaArticleTitle(decodedTitle: string): WikipediaArticleTier {
  if (wikipediaTitleSuggestsReleasePage(decodedTitle)) {
    return 'release';
  }
  if (wikipediaTitleSuggestsDiscographyPage(decodedTitle)) {
    return 'discography';
  }
  return 'artist';
}

/**
 * True when this https URL is a Wikipedia **article** whose title is a main artist/band page
 * or a discography list — inappropriate as the sole “reference” for a specific track/album row.
 */
export function isWikipediaUrlGenericArtistOrDiscographyPage(
  url: string,
  targetName?: string,
): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !u.hostname.endsWith('.wikipedia.org')) {
      return false;
    }
    const title = decodeWikipediaArticleTitleFromPathname(u.pathname);
    if (title.length === 0) {
      return false;
    }
    const tier = classifyWikipediaArticleTitle(title);
    if ((tier === 'artist' || tier === 'discography') &&
      targetName != null &&
      targetName.length > 0 &&
      wikipediaTitleMatchesTarget(title, targetName)) {
      return false;
    }
    return tier === 'artist' || tier === 'discography';
  } catch {
    return false;
  }
}
