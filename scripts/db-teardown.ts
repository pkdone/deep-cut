import { loadEnv } from './load-env.js';

loadEnv();

if (process.env.ALLOW_DB_TEARDOWN !== '1') {
  throw new Error('Set ALLOW_DB_TEARDOWN=1 to confirm database teardown');
}

const uri = process.env.MONGODB_URI;
if (!uri || uri.trim() === '') {
  throw new Error('MONGODB_URI is not set');
}

async function main(): Promise<void> {
  const { createConnectedMongoClient } = await import(
    '../src/infrastructure/persistence/mongo-client.js'
  );
  const { MANAGED_COLLECTIONS } = await import(
    '../src/infrastructure/persistence/mongo-collections.js'
  );
  const client = await createConnectedMongoClient(uri);
  try {
    const db = client.db();
    for (const name of MANAGED_COLLECTIONS) {
      await db.collection(name).drop().catch(() => undefined);
    }
    // eslint-disable-next-line no-console
    console.log('Teardown complete.');
  } finally {
    await client.close();
  }
}

main().catch((e: unknown) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
