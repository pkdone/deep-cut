import type { Db } from 'mongodb';
import { COLLECTIONS, MANAGED_COLLECTIONS } from './mongo-collections.js';

/**
 * Creates collections and indexes. Run from db:init only.
 * JSON Schema validators can be layered later once document shapes stabilise.
 */
export async function initMongoDatabase(db: Db): Promise<void> {
  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));

  for (const name of MANAGED_COLLECTIONS) {
    if (!existing.has(name)) {
      await db.createCollection(name);
    }
  }

  await db.collection(COLLECTIONS.appSettings).createIndex({ _id: 1 });
  await db.collection(COLLECTIONS.localTracks).createIndex({ filePath: 1 }, { unique: true });
  await db.collection(COLLECTIONS.localTracks).createIndex({ localTrackId: 1 }, { unique: true });
  await db.collection(COLLECTIONS.playlists).createIndex({ playlistId: 1 }, { unique: true });
  await db.collection(COLLECTIONS.playlists).createIndex({ name: 1 });
  await db.collection(COLLECTIONS.playlists).createIndex({ updatedAt: -1 });
  await db.collection(COLLECTIONS.playlistTree).createIndex({ 'nodes.nodeId': 1 }, { sparse: true });
  await db.collection(COLLECTIONS.artistEnrichment).createIndex({ enrichmentArtistKey: 1 }, { unique: true });
  await db.collection(COLLECTIONS.artistEnrichment).createIndex({ cachedAt: -1 });
  await db.collection(COLLECTIONS.artistImage).createIndex({ enrichmentArtistKey: 1 }, { unique: true });
  await db.collection(COLLECTIONS.localTracks).createIndex({ artist: 1, album: 1, title: 1 });

  const after = new Set((await db.listCollections().toArray()).map((c) => c.name));
  const missing = MANAGED_COLLECTIONS.filter((n) => !after.has(n));
  if (missing.length > 0) {
    throw new Error(`initMongoDatabase incomplete: ${missing.join(', ')}`);
  }
}
