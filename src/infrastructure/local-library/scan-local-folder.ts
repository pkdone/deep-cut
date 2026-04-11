import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import { v4 as uuidv4 } from 'uuid';
import type { LocalTrack } from '../../domain/schemas/local-track.js';
import { logWarn } from '../../shared/app-logger.js';
import {
  displayAlbumFromCommon,
  displayArtistFromCommon,
  displayTitleFromCommon,
} from './read-id3-display-tags.js';

const MP3 = /\.mp3$/i;

async function listMp3FilesRecursive(dir: string, acc: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isSymbolicLink()) {
      continue;
    }
    if (ent.isDirectory()) {
      await listMp3FilesRecursive(full, acc);
    } else if (ent.isFile() && MP3.test(ent.name)) {
      acc.push(full);
    }
  }
}

export async function scanLocalFolder(rootDir: string): Promise<LocalTrack[]> {
  const files: string[] = [];
  await listMp3FilesRecursive(rootDir, files);
  const tracks: LocalTrack[] = [];
  for (const filePath of files) {
    try {
      const meta = await parseFile(filePath, { duration: true });
      const basename = path.basename(filePath, path.extname(filePath));
      const title = displayTitleFromCommon(meta.common, basename);
      const artist = displayArtistFromCommon(meta.common);
      const album = displayAlbumFromCommon(meta.common);
      const durationMs = Math.round((meta.format.duration ?? 0) * 1000);
      tracks.push({
        localTrackId: uuidv4(),
        source: 'local',
        filePath,
        title,
        artist,
        album,
        durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 1,
      });
    } catch (e) {
      logWarn('Failed to read MP3', { filePath, error: String(e) });
    }
  }
  return tracks;
}
