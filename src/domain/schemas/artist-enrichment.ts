import { z } from 'zod';

export const artistEnrichmentAlbumSchema = z.object({
  name: z.string().min(1),
  releaseYear: z.number().int().min(1900).max(2100),
  rank: z.number().int().min(1),
});

export const artistEnrichmentTrackSchema = z.object({
  title: z.string().min(1),
  rank: z.number().int().min(1).max(10),
});

export const artistEnrichmentPayloadSchema = z.object({
  synopsis: z.string().min(1),
  albums: z.array(artistEnrichmentAlbumSchema),
  topTracks: z.array(artistEnrichmentTrackSchema).length(10),
});

export type ArtistEnrichmentPayload = z.infer<typeof artistEnrichmentPayloadSchema>;

export const artistEnrichmentCacheSchema = z.object({
  spotifyArtistId: z.string().min(1),
  artistName: z.string().min(1),
  payload: artistEnrichmentPayloadSchema,
  cachedAt: z.coerce.date(),
  provider: z.enum(['openai', 'anthropic']),
});

export type ArtistEnrichmentCache = z.infer<typeof artistEnrichmentCacheSchema>;
