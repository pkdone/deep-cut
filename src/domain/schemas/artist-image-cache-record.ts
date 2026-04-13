import { z } from 'zod';
import { enrichmentArtistKeySchema } from './artist-enrichment-payload.js';
import { enrichmentCandidateTrustTierSchema } from './artist-enrichment-reference.js';

export const artistImageCacheProviderSchema = z.enum(['musicbrainz_wikimedia']);

export type ArtistImageCacheProvider = z.infer<typeof artistImageCacheProviderSchema>;

/**
 * Persisted artist image cache row, resolved from public no-login providers.
 */
export const artistImageCacheRecordSchema = z.object({
  enrichmentArtistKey: enrichmentArtistKeySchema,
  artistName: z.string().min(1),
  imageUrl: z.string().url(),
  sourcePageUrl: z.string().url().nullish(),
  host: z.string().min(1),
  trustTier: enrichmentCandidateTrustTierSchema,
  provider: artistImageCacheProviderSchema,
  docSchemaVersion: z.number().int().positive(),
  cachedAt: z.coerce.date(),
  musicBrainzArtistId: z.string().min(1).nullish(),
  wikidataEntityId: z.string().regex(/^Q\d+$/).nullish(),
  wikimediaFileName: z.string().min(1).nullish(),
});

export type ArtistImageCacheRecord = z.infer<typeof artistImageCacheRecordSchema>;
