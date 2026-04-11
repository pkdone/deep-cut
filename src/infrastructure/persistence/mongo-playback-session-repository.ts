import type { Collection } from 'mongodb';
import type { PlaybackSessionRepository } from '../../domain/repositories/playback-session-repository.js';
import type { PlaybackSession } from '../../domain/schemas/playback-session.js';
import { playbackSessionSchema } from '../../domain/schemas/playback-session.js';
import { COLLECTIONS } from './mongo-collections.js';
import type { PlaybackSessionDocument } from './schemas/playback-document.js';

export class MongoPlaybackSessionRepository implements PlaybackSessionRepository {
  static collectionName = COLLECTIONS.playbackSession;

  constructor(private readonly coll: Collection<PlaybackSessionDocument>) {}

  async get(): Promise<PlaybackSession | null> {
    const doc = await this.coll.findOne({ _id: 'singleton' });
    if (!doc) {
      return null;
    }
    const { _id: _ignored, ...rest } = doc;
    return playbackSessionSchema.parse(rest);
  }

  async save(session: PlaybackSession): Promise<void> {
    const parsed = playbackSessionSchema.parse(session);
    await this.coll.replaceOne(
      { _id: 'singleton' },
      { _id: 'singleton', ...parsed },
      { upsert: true }
    );
  }
}
