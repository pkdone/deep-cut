import { z } from 'zod';
import { artistEvidenceBundleSchema } from './artist-evidence.js';
import {
  artistEnrichmentPayloadSchema,
  artistEnrichmentRankedAlbumSchema,
  artistEnrichmentTopTrackSchema,
  bandMemberEntrySchema,
  enrichmentArtistKeySchema,
  enrichmentCategorizedAlbumEntrySchema,
} from './artist-enrichment-payload.js';
import { enrichmentResolvedReferenceSchema } from './artist-enrichment-reference.js';

/** Outcome of validating synthesized JSON against the UI payload schema. */
export const insightsValidationStatusSchema = z.enum(['valid', 'partial']);

export type InsightsValidationStatus = z.infer<typeof insightsValidationStatusSchema>;

/**
 * Relaxed payload for partial UI when full validation fails (arrays may be short;
 * synopsis may be shorter than production minimum).
 */
export const artistEnrichmentPartialPayloadSchema = z.object({
  synopsis: z.string().min(1),
  rankedAlbums: z.array(artistEnrichmentRankedAlbumSchema).max(20),
  topTracks: z.array(artistEnrichmentTopTrackSchema).max(10),
  liveAlbums: z.array(enrichmentCategorizedAlbumEntrySchema).max(3),
  bestOfCompilations: z.array(enrichmentCategorizedAlbumEntrySchema).max(3),
  raritiesCompilations: z.array(enrichmentCategorizedAlbumEntrySchema).max(3),
  bandMembers: z.array(bandMemberEntrySchema),
  artistHeroImage: artistEnrichmentPayloadSchema.shape.artistHeroImage,
});

export type ArtistEnrichmentPartialPayload = z.infer<typeof artistEnrichmentPartialPayloadSchema>;

/**
 * Persisted aggregate for grounded artist insights (MongoDB `artist_enrichment_cache`).
 * Replaces the legacy flat cache row for docSchemaVersion >= 5.
 */
export const artistInsightsRecordSchema = z
  .object({
    enrichmentArtistKey: enrichmentArtistKeySchema,
    artistName: z.string().min(1),
    /** Strict payload when validationStatus is valid; required for full UI. */
    payload: artistEnrichmentPayloadSchema.nullish(),
    /** Present when validationStatus is partial. */
    partialPayload: artistEnrichmentPartialPayloadSchema.nullish(),
    validationStatus: insightsValidationStatusSchema,
    warnings: z.array(z.string()),
    cachedAt: z.coerce.date(),
    provider: z.enum(['openai', 'anthropic']),
    docSchemaVersion: z.number().int().positive(),
    evidence: artistEvidenceBundleSchema.nullish(),
    retrievalModel: z.string().nullish(),
    synthesisModel: z.string().nullish(),
    lastRetrievalAt: z.coerce.date().nullish(),
    lastSynthesisAt: z.coerce.date().nullish(),
    /** Best artist-level reference chosen deterministically from retrieval candidates. */
    primaryReference: enrichmentResolvedReferenceSchema.nullish(),
  })
  .superRefine((data, ctx) => {
    if (data.validationStatus === 'valid' && data.payload == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'payload is required when validationStatus is valid',
        path: ['payload'],
      });
    }
    if (
      data.validationStatus === 'partial' &&
      data.partialPayload == null &&
      data.payload == null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'partialPayload or payload required when validationStatus is partial',
        path: ['partialPayload'],
      });
    }
  });

export type ArtistInsightsRecord = z.infer<typeof artistInsightsRecordSchema>;

/** Legacy v4 document shape (single strict payload, no grounded fields). */
export const artistEnrichmentCacheV4Schema = z.object({
  enrichmentArtistKey: enrichmentArtistKeySchema,
  artistName: z.string().min(1),
  payload: artistEnrichmentPayloadSchema,
  cachedAt: z.coerce.date(),
  provider: z.enum(['openai', 'anthropic']),
  docSchemaVersion: z.literal(4),
});

export type ArtistEnrichmentCacheV4 = z.infer<typeof artistEnrichmentCacheV4Schema>;
