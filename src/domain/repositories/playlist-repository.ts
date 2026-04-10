import type { Playlist } from '../schemas/playlist.js';

export interface PlaylistRepository {
  findAll(): Promise<readonly Playlist[]>;
  findById(id: string): Promise<Playlist | null>;
  save(playlist: Playlist): Promise<void>;
  deleteById(id: string): Promise<void>;
}
