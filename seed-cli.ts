// npm run seed — wipes the local demo database and reseeds it.
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, initDb, closeDb } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

rmSync(DATA_DIR, { recursive: true, force: true });
initDb();
closeDb();
console.log('[badel] database reseeded.');
console.log(`   demo user:     demo@badel.tn / badel-demo`);
console.log(`   admin user:    admin@badel.tn / badel-admin`);
