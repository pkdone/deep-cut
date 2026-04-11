import { z } from 'zod';

export const spotifyIdSchema = z.string().min(1);

export const localTrackIdSchema = z.string().uuid();

export const playlistIdSchema = z.string().uuid();
