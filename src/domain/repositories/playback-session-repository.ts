import type { PlaybackSession } from '../schemas/playback-session.js';

export interface PlaybackSessionRepository {
  get(): Promise<PlaybackSession | null>;
  save(session: PlaybackSession): Promise<void>;
}
