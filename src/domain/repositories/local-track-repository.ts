import type { LocalTrack } from '../schemas/local-track.js';

export interface LocalTrackRepository {
  findAll(): Promise<readonly LocalTrack[]>;
  findByLocalTrackId(localTrackId: string): Promise<LocalTrack | null>;
  upsertMany(tracks: readonly LocalTrack[]): Promise<void>;
  removeByIds(ids: readonly string[]): Promise<void>;
}
