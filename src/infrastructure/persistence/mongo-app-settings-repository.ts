import type { Collection } from 'mongodb';
import type { AppSettingsRepository } from '../../domain/repositories/app-settings-repository.js';
import type { AppSettings } from '../../domain/schemas/app-settings.js';
import { appSettingsSchema } from '../../domain/schemas/app-settings.js';
import { COLLECTIONS } from './mongo-collections.js';
import type { AppSettingsDocument } from './schemas/settings-document.js';

export class MongoAppSettingsRepository implements AppSettingsRepository {
  static collectionName = COLLECTIONS.appSettings;

  constructor(private readonly coll: Collection<AppSettingsDocument>) {}

  async get(): Promise<AppSettings | null> {
    const doc = await this.coll.findOne({ _id: 'singleton' });
    if (!doc) {
      return null;
    }
    const { _id: _ignored, ...rest } = doc;
    return appSettingsSchema.parse(rest);
  }

  async save(settings: AppSettings): Promise<void> {
    const parsed = appSettingsSchema.parse(settings);
    await this.coll.replaceOne(
      { _id: 'singleton' },
      { _id: 'singleton', ...parsed },
      { upsert: true }
    );
  }
}
