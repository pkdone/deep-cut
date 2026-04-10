import type { AppSettings } from '../schemas/app-settings.js';

export interface AppSettingsRepository {
  get(): Promise<AppSettings | null>;
  save(settings: AppSettings): Promise<void>;
}
