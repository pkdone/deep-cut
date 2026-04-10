import { MongoClient } from 'mongodb';
import { ConfigurationError } from '../../shared/errors.js';
import { MANAGED_COLLECTIONS } from './mongo-collections.js';

let client: MongoClient | null = null;
let asserted = false;

export async function getMongoClient(uri: string): Promise<MongoClient> {
  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
  }
  if (!asserted) {
    const db = client.db();
    const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
    const missing = MANAGED_COLLECTIONS.filter((n) => !existing.has(n));
    if (missing.length > 0) {
      throw new ConfigurationError(
        `MongoDB is missing collections: ${missing.join(', ')}. Run npm run db:init against this database.`
      );
    }
    asserted = true;
  }
  return client;
}

export async function createConnectedMongoClient(uri: string): Promise<MongoClient> {
  const c = new MongoClient(uri);
  await c.connect();
  return c;
}
