import { z } from 'zod';
import { enrichmentArtistKeySchema } from './artist-enrichment-payload.js';
import {
  enrichmentCandidateAppliesToTypeSchema,
  enrichmentCandidateIdSchema,
  enrichmentCandidateSourceProviderSchema,
  enrichmentCandidateTrustTierSchema,
  enrichmentReferenceCandidateKindSchema,
} from './artist-enrichment-reference.js';

/** One cited or retrieved web item after normalization. */
export const evidenceSourceSchema = z.object({
  sourceId: z.string().min(1),
  /** BSON may persist absent fields as null. */
  url: z.string().min(1).nullish(),
  title: z.string().nullish(),
  publisher: z.string().nullish(),
  retrievedAt: z.coerce.date(),
  sourceKind: z.enum(['search_snippet', 'page', 'other']),
  snippet: z.string().max(8000),
  ratingValue: z.number().nullish(),
  ratingScale: z.string().nullish(),
  appliesToType: enrichmentCandidateAppliesToTypeSchema.nullish(),
  appliesToName: z.string().nullish(),
  confidence: z.number().min(0).max(1).nullish(),
});

export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;

export const evidenceReferenceCandidateSchema = z.object({
  candidateId: enrichmentCandidateIdSchema,
  url: z.string().url(),
  title: z.string().nullish(),
  host: z.string().min(1),
  candidateKind: enrichmentReferenceCandidateKindSchema,
  appliesToType: enrichmentCandidateAppliesToTypeSchema,
  appliesToName: z.string().nullish(),
  trustTier: enrichmentCandidateTrustTierSchema,
  sourceProvider: enrichmentCandidateSourceProviderSchema,
  snippet: z.string().max(8000).nullish(),
});

export type EvidenceReferenceCandidate = z.infer<typeof evidenceReferenceCandidateSchema>;

export const evidenceImageCandidateSchema = z.object({
  candidateId: enrichmentCandidateIdSchema,
  imageUrl: z.string().url(),
  sourcePageUrl: z.string().url().nullish(),
  title: z.string().nullish(),
  host: z.string().min(1),
  periodHint: z.string().nullish(),
  trustTier: enrichmentCandidateTrustTierSchema,
  sourceProvider: enrichmentCandidateSourceProviderSchema,
  altText: z.string().nullish(),
});

export type EvidenceImageCandidate = z.infer<typeof evidenceImageCandidateSchema>;

export const evidenceTargetReferenceBucketSchema = z.object({
  targetName: z.string().min(1),
  candidates: z.array(evidenceReferenceCandidateSchema).max(40),
});

export type EvidenceTargetReferenceBucket = z.infer<typeof evidenceTargetReferenceBucketSchema>;

export const artistEvidenceRetrievalStatusSchema = z.enum(['ok', 'degraded', 'failed']);

export type ArtistEvidenceRetrievalStatus = z.infer<typeof artistEvidenceRetrievalStatusSchema>;

/** Normalized bundle produced by the retrieval stage (before synthesis). */
export const artistEvidenceBundleSchema = z.object({
  artistKey: enrichmentArtistKeySchema,
  artistDisplayName: z.string().min(1),
  requestedAt: z.coerce.date(),
  retrievalProvider: z.enum(['openai', 'anthropic']),
  retrievalQueries: z.array(z.string()).max(256),
  sources: z.array(evidenceSourceSchema).max(240),
  artistReferenceCandidates: z.array(evidenceReferenceCandidateSchema).max(40),
  artistImageCandidates: z.array(evidenceImageCandidateSchema).max(20),
  albumReferenceBuckets: z.array(evidenceTargetReferenceBucketSchema).max(80),
  trackReferenceBuckets: z.array(evidenceTargetReferenceBucketSchema).max(80),
  referenceCandidates: z.array(evidenceReferenceCandidateSchema).max(320),
  imageCandidates: z.array(evidenceImageCandidateSchema).max(120),
  /** Condensed factual bullets or paragraph fragments from evidence (optional). */
  normalizedSynopsisFacts: z.array(z.string()).max(200),
  normalizedAlbumHints: z
    .array(
      z.object({
        name: z.string().min(1),
        releaseYear: z.number().int().min(1900).max(2100).optional(),
      })
    )
    .max(60),
  normalizedTrackHints: z
    .array(
      z.object({
        title: z.string().min(1),
        releaseYear: z.number().int().min(1900).max(2100).optional(),
      })
    )
    .max(80),
  warnings: z.array(z.string()).max(100),
  status: artistEvidenceRetrievalStatusSchema,
  /** Raw retrieval text for synthesis (capped in infrastructure). */
  retrievalDigest: z.string().max(120_000),
});

export type ArtistEvidenceBundle = z.infer<typeof artistEvidenceBundleSchema>;
