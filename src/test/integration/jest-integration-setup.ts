import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load `.env.local` when present so integration tests can read API keys without exporting them from the shell.
 */
const envLocal = resolve(process.cwd(), '.env.local');
if (existsSync(envLocal)) {
  const content = readFileSync(envLocal, 'utf8');
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (t === '' || t.startsWith('#')) {
      continue;
    }
    const eq = t.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}
