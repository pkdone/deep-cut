import type { EvidenceSource } from '../domain/schemas/artist-evidence.js';
import { normalizeArtistNameForEnrichmentKey } from './normalize-artist-name-for-enrichment-key.js';
import {
  classifyWikipediaArticleTitle,
  decodeWikipediaArticleTitleFromPathname,
} from './wikipedia-article-reference-tier.js';

/** Options when choosing a reference page for a known musical artist. */
export type SelectPrimaryReferenceUrlOptions = {
  /** Display name used to prefer the main Wikipedia biography over album/song pages. */
  readonly artistDisplayName?: string;
};

/**
 * Picks a single https URL to use as the "primary reference" for the artist, from retrieval evidence.
 *
 * Heuristics (no extra HTTP requests):
 * 1. Prefer `en.wikipedia.org` article paths `/wiki/...`, excluding Special/File/Talk/etc.
 * 2. Among those, prefer **artist/biography-like** titles over discography lists, and those over
 *    album/song/EP/single pages (detected via Wikipedia disambiguation in the title).
 * 3. Among same tier, prefer titles that match the artist name (when `artistDisplayName` is set),
 *    then longer snippet. Tie-break: first in list order.
 * 4. Else other `*.wikipedia.org/wiki/` with the same tier rules.
 * 5. Else first https URL not on a search/aggregator blocklist.
 */
export function selectPrimaryReferenceUrl(
  sources: readonly EvidenceSource[],
  options?: SelectPrimaryReferenceUrlOptions,
): string | undefined {
  const artistNorm = options?.artistDisplayName
    ? normalizeArtistNameForEnrichmentKey(options.artistDisplayName)
    : '';

  const withUrl = sources.filter((s): s is EvidenceSource & { url: string } => {
    if (s.url == null || s.url.length === 0) {
      return false;
    }
    try {
      const u = new URL(s.url);
      return u.protocol === 'https:';
    } catch {
      return false;
    }
  });

  if (withUrl.length === 0) {
    return undefined;
  }

  const snippetLen = (s: EvidenceSource): number => s.snippet.length;

  const isWikiArticlePath = (pathname: string): boolean => {
    if (!pathname.startsWith('/wiki/')) {
      return false;
    }
    const rest = pathname.slice('/wiki/'.length);
    if (rest.length === 0) {
      return false;
    }
    const segment = rest.split('/')[0] ?? '';
    const badPrefixes = [
      'Special:',
      'File:',
      'Talk:',
      'User:',
      'Help:',
      'Wikipedia:',
      'Template:',
      'Category:',
      'Portal:',
    ];
    return !badPrefixes.some((p) => segment.startsWith(p));
  };

  const primaryTitlePart = (decodedTitle: string): string => {
    const t = decodedTitle.trim();
    const idx = t.indexOf('(');
    return idx === -1 ? t : t.slice(0, idx).trim();
  };

  type WikiTier = 'artist' | 'discography' | 'release';

  const classifyWikiTitle = (decodedTitle: string): WikiTier =>
    classifyWikipediaArticleTitle(decodedTitle);

  const artistTitleMatchScore = (decodedTitle: string): number => {
    if (!artistNorm) {
      return 0;
    }
    const primaryNorm = normalizeArtistNameForEnrichmentKey(primaryTitlePart(decodedTitle));
    if (primaryNorm === artistNorm) {
      return 3;
    }
    const lower = decodedTitle.toLocaleLowerCase('en-US');
    if (
      lower.startsWith(`${artistNorm} (band)`) ||
      lower.startsWith(`${artistNorm} (musician)`) ||
      lower.startsWith(`${artistNorm} (singer)`)
    ) {
      return 2;
    }
    return 0;
  };

  const pickBestInPool = (pool: (EvidenceSource & { url: string })[]): EvidenceSource | undefined => {
    if (pool.length === 0) {
      return undefined;
    }
    let best = pool[0];
    let bestScore = artistTitleMatchScore(
      decodeWikipediaArticleTitleFromPathname(new URL(best.url).pathname),
    );
    let bestLen = snippetLen(best);
    for (let i = 1; i < pool.length; i += 1) {
      const c = pool[i];
      const title = decodeWikipediaArticleTitleFromPathname(new URL(c.url).pathname);
      const sc = artistTitleMatchScore(title);
      const len = snippetLen(c);
      if (sc > bestScore || (sc === bestScore && len > bestLen)) {
        best = c;
        bestScore = sc;
        bestLen = len;
      }
    }
    return best;
  };

  const tiers: readonly WikiTier[] = ['artist', 'discography', 'release'];

  const pickFromWikipediaHosts = (hostPredicate: (host: string) => boolean): string | undefined => {
    const pool: (EvidenceSource & { url: string })[] = [];
    for (const s of withUrl) {
      try {
        const u = new URL(s.url);
        if (!hostPredicate(u.hostname) || !isWikiArticlePath(u.pathname)) {
          continue;
        }
        pool.push(s);
      } catch {
        continue;
      }
    }
    if (pool.length === 0) {
      return undefined;
    }
    for (const tier of tiers) {
      const tierPool = pool.filter((s) => {
        const title = decodeWikipediaArticleTitleFromPathname(new URL(s.url).pathname);
        return classifyWikiTitle(title) === tier;
      });
      if (tierPool.length === 0) {
        continue;
      }
      const best = pickBestInPool(tierPool);
      if (best?.url) {
        return stripTrackingParams(best.url);
      }
    }
    return undefined;
  };

  const fromEn = pickFromWikipediaHosts((h) => h === 'en.wikipedia.org');
  if (fromEn) {
    return fromEn;
  }

  const fromOtherWiki = pickFromWikipediaHosts(
    (h) => h.endsWith('.wikipedia.org') && h !== 'en.wikipedia.org',
  );
  if (fromOtherWiki) {
    return fromOtherWiki;
  }

  const blockHost = (host: string): boolean => {
    const h = host.toLowerCase();
    if (h === 'youtube.com' || h.endsWith('.youtube.com')) {
      return true;
    }
    if (h.includes('google.') || h === 'google.com' || h.endsWith('.google.com')) {
      return true;
    }
    if (h.includes('bing.com') || h.includes('duckduckgo.com')) {
      return true;
    }
    return false;
  };

  for (const s of withUrl) {
    try {
      const u = new URL(s.url);
      if (blockHost(u.hostname)) {
        continue;
      }
      if (u.pathname === '/search' || u.pathname.startsWith('/search?')) {
        continue;
      }
      return stripTrackingParams(s.url);
    } catch {
      continue;
    }
  }

  return undefined;
}

/** Removes common tracking query params from reference URLs. */
function stripTrackingParams(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('utm_')) {
        u.searchParams.delete(key);
      }
    }
    const qs = u.searchParams.toString();
    if (qs.length === 0) {
      return `${u.origin}${u.pathname}${u.hash}`;
    }
    return `${u.origin}${u.pathname}?${qs}${u.hash}`;
  } catch {
    return url;
  }
}
