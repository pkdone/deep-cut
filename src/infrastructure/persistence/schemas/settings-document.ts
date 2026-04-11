import { z } from 'zod';
import { appSettingsSchema } from '../../../domain/schemas/app-settings.js';

export const appSettingsDocumentSchema = z.object({
  _id: z.literal('singleton'),
}).merge(appSettingsSchema);

export type AppSettingsDocument = z.infer<typeof appSettingsDocumentSchema>;
