import { z } from 'zod';

/** Stable ID for a candidate surfaced by the retrieval stage. */
export const enrichmentCandidateIdSchema = z.string().min(1);

export type EnrichmentCandidateId = z.infer<typeof enrichmentCandidateIdSchema>;

/** Broad target entity a candidate applies to. */
export const enrichmentCandidateAppliesToTypeSchema = z.enum([
  'artist',
  'album',
  'track',
  'unknown',
]);

export type EnrichmentCandidateAppliesToType = z.infer<
  typeof enrichmentCandidateAppliesToTypeSchema
>;

/** Retrieval provider that surfaced the candidate. */
export const enrichmentCandidateSourceProviderSchema = z.enum(['openai', 'anthropic']);

export type EnrichmentCandidateSourceProvider = z.infer<
  typeof enrichmentCandidateSourceProviderSchema
>;

/** Stable trust tier for ranking and final rendering. Lower is more trusted. */
export const enrichmentCandidateTrustTierSchema = z.number().int().min(1).max(5);

export type EnrichmentCandidateTrustTier = z.infer<typeof enrichmentCandidateTrustTierSchema>;

/** Structured page/reference candidates gathered during retrieval. */
export const enrichmentReferenceCandidateKindSchema = z.enum([
  'artist_page',
  'album_page',
  'track_page',
  'discography_page',
  'official_page',
  'editorial_page',
  'other',
]);

export type EnrichmentReferenceCandidateKind = z.infer<
  typeof enrichmentReferenceCandidateKindSchema
>;

/**
 * Persisted row-level reference selected from retrieval candidates.
 * The URL is resolved deterministically from a candidate ID before persistence.
 */
export const enrichmentResolvedReferenceSchema = z.object({
  candidateId: enrichmentCandidateIdSchema,
  url: z.string().url(),
  title: z.string().nullish(),
  host: z.string().min(1),
  trustTier: enrichmentCandidateTrustTierSchema,
});

export type EnrichmentResolvedReference = z.infer<typeof enrichmentResolvedReferenceSchema>;

/** Persisted hero image selected from retrieval candidates. */
export const enrichmentResolvedHeroImageSchema = z.object({
  candidateId: enrichmentCandidateIdSchema,
  imageUrl: z.string().url(),
  sourcePageUrl: z.string().url().nullish(),
  title: z.string().nullish(),
  periodHint: z.string().nullish(),
  host: z.string().min(1),
  trustTier: enrichmentCandidateTrustTierSchema,
});

export type EnrichmentResolvedHeroImage = z.infer<typeof enrichmentResolvedHeroImageSchema>;
