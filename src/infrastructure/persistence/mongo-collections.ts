export const COLLECTIONS = {
  appSettings: 'app_settings',
  localTracks: 'local_tracks',
  playlists: 'playlists',
  playbackSession: 'playback_session',
  artistEnrichment: 'artist_enrichment_cache',
  artistImage: 'artist_image_cache',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export const MANAGED_COLLECTIONS: readonly CollectionName[] = [
  COLLECTIONS.appSettings,
  COLLECTIONS.localTracks,
  COLLECTIONS.playlists,
  COLLECTIONS.playbackSession,
  COLLECTIONS.artistEnrichment,
  COLLECTIONS.artistImage,
];
