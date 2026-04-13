import type { ArtistImageCacheRecord } from '../schemas/artist-image-cache-record.js';

export interface ArtistImageRepository {
  get(enrichmentArtistKey: string): Promise<ArtistImageCacheRecord | null>;
  upsert(entry: ArtistImageCacheRecord): Promise<void>;
  delete(enrichmentArtistKey: string): Promise<void>;
}
