import type { ArtistImageRepository } from '../../domain/repositories/artist-image-repository.js';
import type { ArtistImageCacheRecord } from '../../domain/schemas/artist-image-cache-record.js';

type ResolveArtistImage = (params: {
  enrichmentArtistKey: string;
  artistDisplayName: string;
}) => Promise<ArtistImageCacheRecord | null>;

export async function getArtistImageWithCache(params: {
  repository: ArtistImageRepository;
  resolveArtistImage: ResolveArtistImage;
  enrichmentArtistKey: string;
  artistDisplayName: string;
}): Promise<{ kind: 'hit'; cached: ArtistImageCacheRecord } | { kind: 'miss' }> {
  const cached = await params.repository.get(params.enrichmentArtistKey);
  if (cached != null) {
    return { kind: 'hit', cached };
  }
  const resolved = await params.resolveArtistImage({
    enrichmentArtistKey: params.enrichmentArtistKey,
    artistDisplayName: params.artistDisplayName,
  });
  if (resolved == null) {
    return { kind: 'miss' };
  }
  await params.repository.upsert(resolved);
  return { kind: 'hit', cached: resolved };
}

export async function refreshArtistImageCache(params: {
  repository: ArtistImageRepository;
  resolveArtistImage: ResolveArtistImage;
  enrichmentArtistKey: string;
  artistDisplayName: string;
}): Promise<ArtistImageCacheRecord | null> {
  const fallback = await params.repository.get(params.enrichmentArtistKey);
  const resolved = await params.resolveArtistImage({
    enrichmentArtistKey: params.enrichmentArtistKey,
    artistDisplayName: params.artistDisplayName,
  });
  if (resolved == null) {
    return fallback;
  }
  await params.repository.upsert(resolved);
  return resolved;
}
