import { z } from 'zod';
import { enrichmentArtistKeySchema } from './artist-enrichment.js';

/** Where the primary artist string came from for enrichment resolution. */
export const playbackArtistResolutionViaSchema = z.enum([
  'local_library_tags',
  'spotify_playback_metadata',
]);

export type PlaybackArtistResolutionVia = z.infer<typeof playbackArtistResolutionViaSchema>;

export const playbackArtistResolutionOkSchema = z.object({
  kind: z.literal('ok'),
  enrichmentArtistKey: enrichmentArtistKeySchema,
  displayName: z.string().min(1),
  via: playbackArtistResolutionViaSchema,
});

export type PlaybackArtistResolutionOk = z.infer<typeof playbackArtistResolutionOkSchema>;

export const playbackArtistResolutionFailureReasonSchema = z.enum([
  'missing_artist_name',
  'local_track_not_found',
  'spotify_metadata_unavailable',
]);

export type PlaybackArtistResolutionFailureReason = z.infer<
  typeof playbackArtistResolutionFailureReasonSchema
>;

export const playbackArtistResolutionErrSchema = z.object({
  kind: z.literal('error'),
  reason: playbackArtistResolutionFailureReasonSchema,
  message: z.string().optional(),
});

export type PlaybackArtistResolutionErr = z.infer<typeof playbackArtistResolutionErrSchema>;

export const playbackArtistResolutionResultSchema = z.discriminatedUnion('kind', [
  playbackArtistResolutionOkSchema,
  playbackArtistResolutionErrSchema,
]);

export type PlaybackArtistResolutionResult = z.infer<typeof playbackArtistResolutionResultSchema>;
