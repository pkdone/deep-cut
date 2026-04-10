import { loadEnv } from './load-env.js';

loadEnv();

const uri = process.env.MONGODB_URI;
if (!uri || uri.trim() === '') {
  throw new Error('MONGODB_URI is not set. Add it to .env or .env.local');
}

async function main(): Promise<void> {
  const { createConnectedMongoClient } = await import(
    '../src/infrastructure/persistence/mongo-client.js'
  );
  const { initMongoDatabase } = await import(
    '../src/infrastructure/persistence/init-mongo-database.js'
  );
  const client = await createConnectedMongoClient(uri);
  try {
    const db = client.db();
    await initMongoDatabase(db);
    // eslint-disable-next-line no-console
    console.log('MongoDB init complete.');
  } finally {
    await client.close();
  }
}

main().catch((e: unknown) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
