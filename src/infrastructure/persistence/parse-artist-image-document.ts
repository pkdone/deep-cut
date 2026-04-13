import type { ArtistImageCacheRecord } from '../../domain/schemas/artist-image-cache-record.js';
import { artistImageCacheRecordSchema } from '../../domain/schemas/artist-image-cache-record.js';

export function parseArtistImageDocument(raw: unknown): ArtistImageCacheRecord {
  return artistImageCacheRecordSchema.parse(raw);
}
