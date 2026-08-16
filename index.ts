// =============================================================
// BADEL API server — Express + real relational store.
// =============================================================

import express from 'express';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, UPLOAD_DIR, closeDb } from './db.js';
import { loadUser } from './auth.js';
import { authRouter } from './routes/auth.js';
import { itemsRouter } from './routes/items.js';
import { tradesRouter } from './routes/trades.js';
import { socialRouter } from './routes/social.js';
import { browseRouter } from './routes/browse.js';
import { adminRouter } from './routes/admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  process.loadEnvFile?.(join(process.cwd(), '.env'));
} catch {
  // no .env file — use process env / defaults
}

initDb();
const app = express();

// Health
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'badel', backend: process.env.BACKEND ?? 'local' });
});

// Raw binary upload endpoint must read the raw body BEFORE the JSON
// parser (which would otherwise reject the large payload).
app.use('/api/items/uploads/photo', express.raw({ type: () => true, limit: '12mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(loadUser);

app.use('/api/auth', authRouter);
app.use('/api', browseRouter);
app.use('/api/items', itemsRouter);
app.use('/api', tradesRouter);
app.use('/api', socialRouter);
app.use('/api/admin', adminRouter);

// Static uploads (files are stored on disk, never as base64 in rows)
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', immutable: true }));

// Production: serve the built SPA
const dist = join(__dirname, '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
    res.sendFile(join(dist, 'index.html'));
  });
}

// JSON 404 for unknown API routes
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// Error handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[badel] error:', err);
  res.status(500).json({ error: 'Something went wrong on our side.' });
});

// BADEL_PORT (NOT PORT — the sandbox sets PORT=0 for dynamic allocation)
const PORT = Number(process.env.BADEL_PORT ?? 8787);
const server = app.listen(PORT, () => {
  console.log(`[badel] API listening on http://127.0.0.1:${PORT}`);
});

function shutdown(): void {
  server.close(() => {
    closeDb();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
