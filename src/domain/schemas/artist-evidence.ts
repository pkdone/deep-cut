import { z } from 'zod';
import { enrichmentArtistKeySchema } from './artist-enrichment-payload.js';

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
  appliesToType: z.enum(['artist', 'album', 'track', 'unknown']).nullish(),
  appliesToName: z.string().nullish(),
  confidence: z.number().min(0).max(1).nullish(),
});

export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;

export const artistEvidenceRetrievalStatusSchema = z.enum(['ok', 'degraded', 'failed']);

export type ArtistEvidenceRetrievalStatus = z.infer<typeof artistEvidenceRetrievalStatusSchema>;

/** Normalized bundle produced by the retrieval stage (before synthesis). */
export const artistEvidenceBundleSchema = z.object({
  artistKey: enrichmentArtistKeySchema,
  artistDisplayName: z.string().min(1),
  requestedAt: z.coerce.date(),
  retrievalProvider: z.enum(['openai', 'anthropic']),
  retrievalQueries: z.array(z.string()).max(32),
  sources: z.array(evidenceSourceSchema).max(80),
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
  warnings: z.array(z.string()).max(50),
  status: artistEvidenceRetrievalStatusSchema,
  /** Raw retrieval text for synthesis (capped in infrastructure). */
  retrievalDigest: z.string().max(120_000),
});

export type ArtistEvidenceBundle = z.infer<typeof artistEvidenceBundleSchema>;
