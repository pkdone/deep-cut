import { z } from 'zod';

export const trackSourceSchema = z.enum(['spotify', 'local']);

export type TrackSource = z.infer<typeof trackSourceSchema>;
