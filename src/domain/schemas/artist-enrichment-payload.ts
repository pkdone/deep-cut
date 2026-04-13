import { z } from 'zod';
import {
  enrichmentCandidateIdSchema,
  enrichmentResolvedHeroImageSchema,
  enrichmentResolvedReferenceSchema,
} from './artist-enrichment-reference.js';

/**
 * Stable enrichment cache key derived from the primary artist display name (see normalizeArtistNameForEnrichmentKey).
 */
export const enrichmentArtistKeySchema = z.string().min(1);

export type EnrichmentArtistKey = z.infer<typeof enrichmentArtistKeySchema>;

/** Notable studio albums (core studio catalogue), model-ranked (1 = strongest); not live or compilation releases. */
export const artistEnrichmentRankedAlbumSchema = z.object({
  name: z.string().min(1),
  releaseYear: z.number().int().min(1900).max(2100),
  rank: z.number().int().min(1),
  /** Resolved reference selected deterministically from retrieval candidates. */
  primaryReference: enrichmentResolvedReferenceSchema.nullish(),
});

export type ArtistEnrichmentRankedAlbum = z.infer<typeof artistEnrichmentRankedAlbumSchema>;

/** Top tracks with ranks 1–10; optional year for display in brackets. */
export const artistEnrichmentTopTrackSchema = z.object({
  title: z.string().min(1),
  rank: z.number().int().min(1).max(10),
  releaseYear: z.number().int().min(1900).max(2100).optional(),
  /** Resolved reference selected deterministically from retrieval candidates. */
  primaryReference: enrichmentResolvedReferenceSchema.nullish(),
});

export type ArtistEnrichmentTopTrack = z.infer<typeof artistEnrichmentTopTrackSchema>;

/** Live / best-of / rarities — ranked within each list (1 = top in that category). */
export const enrichmentCategorizedAlbumEntrySchema = z.object({
  name: z.string().min(1),
  releaseYear: z.number().int().min(1900).max(2100),
  rank: z.number().int().min(1).max(3),
  /** Resolved reference selected deterministically from retrieval candidates. */
  primaryReference: enrichmentResolvedReferenceSchema.nullish(),
});

export type EnrichmentCategorizedAlbumEntry = z.infer<typeof enrichmentCategorizedAlbumEntrySchema>;

export const bandMemberTenurePeriodSchema = z.object({
  startYear: z.number().int().min(1900).max(2100),
  /** Null means still active / present-day membership for that stretch. */
  endYear: z.number().int().min(1900).max(2100).nullable(),
});

export type BandMemberTenurePeriod = z.infer<typeof bandMemberTenurePeriodSchema>;

export const bandMemberEntrySchema = z
  .object({
    name: z.string().min(1),
    instruments: z.array(z.string()),
    /** One or more spans (e.g. boomerang members rejoining). */
    periods: z.array(bandMemberTenurePeriodSchema).min(1),
  })
  .superRefine((data, ctx) => {
    data.periods.forEach((p, i) => {
      if (p.endYear !== null && p.endYear < p.startYear) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'endYear must be >= startYear when set',
          path: ['periods', i],
        });
      }
    });
  });

export type BandMemberEntry = z.infer<typeof bandMemberEntrySchema>;

/** Opening paragraph: target 6–8 substantial sentences (length enforced in LLM prompt; loose minimum here). */
export const artistEnrichmentPayloadSchema = z.object({
  synopsis: z.string().min(320),
  rankedAlbums: z.array(artistEnrichmentRankedAlbumSchema).max(20),
  topTracks: z.array(artistEnrichmentTopTrackSchema).length(10),
  liveAlbums: z.array(enrichmentCategorizedAlbumEntrySchema).max(3),
  bestOfCompilations: z.array(enrichmentCategorizedAlbumEntrySchema).max(3),
  raritiesCompilations: z.array(enrichmentCategorizedAlbumEntrySchema).max(3),
  bandMembers: z.array(bandMemberEntrySchema),
  /** Resolved hero image selected deterministically from retrieval candidates. */
  artistHeroImage: enrichmentResolvedHeroImageSchema.nullish(),
});

export type ArtistEnrichmentPayload = z.infer<typeof artistEnrichmentPayloadSchema>;

const synthesisCandidateIdSchema = enrichmentCandidateIdSchema.nullish();

export const artistEnrichmentRankedAlbumSelectionSchema = z.object({
  name: z.string().min(1),
  releaseYear: z.number().int().min(1900).max(2100),
  rank: z.number().int().min(1),
  primaryReferenceCandidateId: synthesisCandidateIdSchema,
});

export type ArtistEnrichmentRankedAlbumSelection = z.infer<
  typeof artistEnrichmentRankedAlbumSelectionSchema
>;

export const artistEnrichmentTopTrackSelectionSchema = z.object({
  title: z.string().min(1),
  rank: z.number().int().min(1).max(10),
  releaseYear: z.number().int().min(1900).max(2100).optional(),
  primaryReferenceCandidateId: synthesisCandidateIdSchema,
});

export type ArtistEnrichmentTopTrackSelection = z.infer<
  typeof artistEnrichmentTopTrackSelectionSchema
>;

export const enrichmentCategorizedAlbumEntrySelectionSchema = z.object({
  name: z.string().min(1),
  releaseYear: z.number().int().min(1900).max(2100),
  rank: z.number().int().min(1).max(3),
  primaryReferenceCandidateId: synthesisCandidateIdSchema,
});

export type EnrichmentCategorizedAlbumEntrySelection = z.infer<
  typeof enrichmentCategorizedAlbumEntrySelectionSchema
>;

/** JSON contract expected directly from the synthesis model. */
export const artistEnrichmentSelectionPayloadSchema = z.object({
  synopsis: z.string().min(320),
  rankedAlbums: z.array(artistEnrichmentRankedAlbumSelectionSchema).max(20),
  topTracks: z.array(artistEnrichmentTopTrackSelectionSchema).length(10),
  liveAlbums: z.array(enrichmentCategorizedAlbumEntrySelectionSchema).max(3),
  bestOfCompilations: z.array(enrichmentCategorizedAlbumEntrySelectionSchema).max(3),
  raritiesCompilations: z.array(enrichmentCategorizedAlbumEntrySelectionSchema).max(3),
  bandMembers: z.array(bandMemberEntrySchema),
});

export type ArtistEnrichmentSelectionPayload = z.infer<
  typeof artistEnrichmentSelectionPayloadSchema
>;

export const artistReferenceSelectionSchema = z.object({
  artistPrimaryReferenceCandidateId: synthesisCandidateIdSchema,
  albumSelections: z
    .array(
      z.object({
        targetName: z.string().min(1),
        primaryReferenceCandidateId: synthesisCandidateIdSchema,
      }),
    )
    .max(40),
  trackSelections: z
    .array(
      z.object({
        targetName: z.string().min(1),
        primaryReferenceCandidateId: synthesisCandidateIdSchema,
      }),
    )
    .max(80),
});

export type ArtistReferenceSelection = z.infer<typeof artistReferenceSelectionSchema>;
