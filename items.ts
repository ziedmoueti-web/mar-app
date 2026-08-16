// =============================================================
// Items API — create/edit/delete listings, photos, favorites.
// Enforces ownership, the 8-photo limit, and prevents editing or
// deleting an item that is part of an active exchange.
// =============================================================

import { Router } from 'express';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDb, row, rows, uid, now, UPLOAD_DIR } from '../db.js';
import type { SQLValue } from '../db.js';
import { AuthedRequest, requireAuth } from '../auth.js';
import { enrichItems, getItemDetail, isOwnedBy, getCategoryBySlug } from '../items-view.js';
import { track } from '../analytics.js';
import { notify } from '../notify.js';
import type { Item } from '../../shared/types.js';

export const itemsRouter = Router();

const MAX_PHOTOS = 8;
const MAX_WANTED = 6;
const ALLOWED_CONDITIONS = ['new', 'like_new', 'good', 'fair', 'poor'];
const ALLOWED_STATUS = ['active', 'unavailable'];

// ---- Helpers --------------------------------------------------

function validateItemBody(body: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const condition = body.condition;
  if (title.length < 4 || title.length > 90) errors.title = 'Title must be 4–90 characters.';
  if (description.length < 10) errors.description = 'Add a short description (at least 10 characters).';
  if (!ALLOWED_CONDITIONS.includes(condition as string)) errors.condition = 'Pick a condition.';
  const cat = getCategoryBySlug(typeof body.category_slug === 'string' ? body.category_slug : '');
  if (!cat && !getDb().prepare('SELECT 1 FROM categories WHERE id = ?').get(typeof body.category_id === 'string' ? body.category_id : '')) {
    errors.category_id = 'Pick a category.';
  }
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  if (location.length < 2) errors.location = 'Add your approximate area (e.g. "Megrine").';
  if (body.wanted && !Array.isArray(body.wanted)) errors.wanted = 'Invalid wanted list.';
  else if (Array.isArray(body.wanted) && body.wanted.length > MAX_WANTED) {
    errors.wanted = `You can list up to ${MAX_WANTED} things you want.`;
  }
  return errors;
}

interface WantedInput { category_slug?: string; keywords?: string }

function insertWanted(itemId: string, userId: string, wanted: WantedInput[] | undefined): void {
  const d = getDb();
  d.prepare('DELETE FROM wanted_items WHERE item_id = ?').run(itemId);
  for (const w of wanted ?? []) {
    const cat = w.category_slug ? getCategoryBySlug(w.category_slug) : null;
    const keywords = typeof w.keywords === 'string' ? w.keywords.trim().slice(0, 120) : '';
    if (!cat && !keywords) continue;
    d.prepare(
      'INSERT INTO wanted_items (id, user_id, item_id, wanted_category_id, wanted_keywords, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uid(), userId, itemId, cat?.id ?? null, keywords, now());
  }
}

function hasActiveTrade(itemId: string): boolean {
  const r = row<{ c: number }>(
    getDb().prepare(
      `SELECT COUNT(*) AS c FROM trade_offers
       WHERE status IN ('pending','accepted','meetup')
         AND (offered_item_id = ? OR requested_item_id = ?)`
    ).get(itemId, itemId)
  );
  return (r?.c ?? 0) > 0;
}

// ---- CRUD -----------------------------------------------------

itemsRouter.post('/', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors = validateItemBody(body);
  if (Object.keys(errors).length > 0) {
    res.status(400).json({ error: 'Check the highlighted fields.', fields: errors });
    return;
  }
  const cat = getCategoryBySlug(body.category_slug as string);
  const id = uid();
  const lat = typeof body.latitude === 'number' && Number.isFinite(body.latitude) ? body.latitude : null;
  const lng = typeof body.longitude === 'number' && Number.isFinite(body.longitude) ? body.longitude : null;
  const vmin = typeof body.value_min === 'number' && body.value_min >= 0 ? Math.round(body.value_min) : null;
  const vmax = typeof body.value_max === 'number' && body.value_max >= 0 ? Math.round(body.value_max) : null;

  getDb().prepare(`
    INSERT INTO items (id, owner_id, title, description, category_id, condition, status, location, latitude, longitude,
      value_min, value_max, value_currency, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, 'TND', ?, ?)
  `).run(id, req.user.id, (body.title as string).trim(), (body.description as string).trim(),
    cat!.id, body.condition as string, (body.location as string).trim(), lat, lng, vmin, vmax, now(), now());

  insertWanted(id, req.user.id, (body.wanted ?? []) as WantedInput[]);
  if (Array.isArray(body.photos) && body.photos.length > 0) {
    addPhotos(id, normalizePhotos(body.photos).slice(0, MAX_PHOTOS));
  }
  track(req.user.id, 'listing_created', { category_id: cat!.id });
  res.status(201).json(getItemDetail(id, req.user));
});

itemsRouter.put('/:id', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const { id } = req.params;
  if (!isOwnedBy(id, req.user.id)) {
    res.status(403).json({ error: 'You can only edit your own listings.' });
    return;
  }
  if (hasActiveTrade(id)) {
    res.status(409).json({ error: 'This item is part of an active exchange and cannot be edited. Finish or cancel the trade first.' });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors = validateItemBody(body);
  if (Object.keys(errors).length > 0) {
    res.status(400).json({ error: 'Check the highlighted fields.', fields: errors });
    return;
  }
  const cat = getCategoryBySlug(body.category_slug as string);
  const lat = typeof body.latitude === 'number' && Number.isFinite(body.latitude) ? body.latitude : null;
  const lng = typeof body.longitude === 'number' && Number.isFinite(body.longitude) ? body.longitude : null;
  const vmin = typeof body.value_min === 'number' && body.value_min >= 0 ? Math.round(body.value_min) : null;
  const vmax = typeof body.value_max === 'number' && body.value_max >= 0 ? Math.round(body.value_max) : null;

  getDb().prepare(`
    UPDATE items SET title = ?, description = ?, category_id = ?, condition = ?, location = ?,
      latitude = ?, longitude = ?, value_min = ?, value_max = ?, updated_at = ?
    WHERE id = ?
  `).run((body.title as string).trim(), (body.description as string).trim(), cat!.id,
    body.condition as string, (body.location as string).trim(), lat, lng, vmin, vmax, now(), id);
  insertWanted(id, req.user.id, (body.wanted ?? []) as WantedInput[]);
  if (Array.isArray(body.photos) && body.photos.length > 0) {
    replacePhotos(id, normalizePhotos(body.photos).slice(0, MAX_PHOTOS));
  }
  res.json(getItemDetail(id, req.user));
});

itemsRouter.delete('/:id', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const { id } = req.params;
  if (!isOwnedBy(id, req.user.id)) {
    res.status(403).json({ error: 'You can only delete your own listings.' });
    return;
  }
  if (hasActiveTrade(id)) {
    res.status(409).json({ error: 'This item is part of an active exchange. Cancel the trade before deleting it.' });
    return;
  }
  // Soft delete: the row (and its trade history, ratings and reports)
  // must survive so the trust system stays intact. Hard deletion is
  // impossible anyway — trade_offers references items by FK.
  getDb().prepare("UPDATE items SET status = 'deleted', updated_at = ? WHERE id = ?").run(now(), id);
  res.json({ ok: true });
});

itemsRouter.patch('/:id/status', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const { id } = req.params;
  const status = req.body?.status;
  if (!ALLOWED_STATUS.includes(status as string)) {
    res.status(400).json({ error: 'Invalid status.' });
    return;
  }
  if (!isOwnedBy(id, req.user.id)) {
    res.status(403).json({ error: 'You can only manage your own listings.' });
    return;
  }
  if (status === 'unavailable' && hasActiveTrade(id)) {
    res.status(409).json({ error: 'This item has an active offer. Cancel the trade first.' });
    return;
  }
  getDb().prepare('UPDATE items SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);
  const item = getItemDetail(id, req.user);
  if (item && status === 'unavailable') {
    // notify favoriters that the listing changed
    const favs = rows<{ user_id: string }>(
      getDb().prepare('SELECT user_id FROM favorites WHERE item_id = ?').all(id)
    );
    favs.forEach((f) => notify(f.user_id, 'favorite_updated', 'A saved listing changed',
      `"${item.title}" is no longer available.`, { item_id: id }));
  }
  res.json(getItemDetail(id, req.user));
});

// ---- My items -------------------------------------------------

itemsRouter.get('/mine', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const list = rows<Item>(
    getDb().prepare(
      "SELECT * FROM items WHERE owner_id = ? AND status != 'deleted' ORDER BY created_at DESC"
    ).all(req.user.id)
  );
  const enriched = enrichItems(list, req.user);
  // include offer counts on my items (offers I've received per item)
  res.json({ items: enriched });
});

itemsRouter.get('/:id', (req: AuthedRequest, res) => {
  const it = getItemDetail(req.params.id, req.user ?? null);
  if (!it) {
    res.status(404).json({ error: 'Listing not found.' });
    return;
  }
  if ((it.status === 'unavailable' || it.status === 'deleted') && (!req.user || it.owner_id !== req.user.id)) {
    res.status(404).json({ error: 'Listing not found.' });
    return;
  }
  track(req.user?.id ?? null, 'item_viewed', { item_id: it.id });
  res.json(it);
});

// ---- Photos ---------------------------------------------------

function photoExt(mime: string): string | null {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/avif') return '.avif';
  return null;
}

function saveRawImage(body: Buffer, mime: string): string | null {
  const ext = photoExt(mime);
  if (!ext) return null;
  if (body.length > 10 * 1024 * 1024) return null;
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `${uid()}${ext}`;
  writeFileSync(join(UPLOAD_DIR, name), body);
  return `/uploads/${name}`;
}

itemsRouter.post('/uploads/photo', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const mime = (req.headers['content-type'] ?? '').split(';')[0].trim();
  const path = saveRawImage(req.body as Buffer, mime);
  if (!path) {
    res.status(400).json({ error: 'Unsupported image type or file too large (max 10MB).' });
    return;
  }
  track(req.user.id, 'listing_photo_uploaded');
  res.status(201).json({ storage_path: path });
});

interface PhotoInput { storage_path: string; thumb_path?: string | null }

function normalizePhotos(photos: unknown): PhotoInput[] {
  return (Array.isArray(photos) ? photos : [])
    .map((p): PhotoInput | null => {
      if (typeof p === 'string' && /^\/uploads\//.test(p)) return { storage_path: p };
      if (p && typeof p === 'object') {
        const o = p as Record<string, unknown>;
        if (typeof o.storage_path === 'string' && /^\/uploads\//.test(o.storage_path)) {
          const thumb = typeof o.thumb_path === 'string' && /^\/uploads\//.test(o.thumb_path) ? o.thumb_path : o.storage_path;
          return { storage_path: o.storage_path, thumb_path: thumb };
        }
      }
      return null;
    })
    .filter((p): p is PhotoInput => !!p);
}

function addPhotos(itemId: string, photos: PhotoInput[]): void {
  const d = getDb();
  const cur = row<{ c: number }>(d.prepare('SELECT COUNT(*) AS c FROM item_photos WHERE item_id = ?').get(itemId));
  photos.forEach((p, i) => {
    d.prepare(
      'INSERT INTO item_photos (id, item_id, storage_path, thumb_path, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uid(), itemId, p.storage_path, p.thumb_path ?? p.storage_path, (cur?.c ?? 0) + i, now());
  });
}

function replacePhotos(itemId: string, photos: PhotoInput[]): void {
  const d = getDb();
  d.prepare('DELETE FROM item_photos WHERE item_id = ?').run(itemId);
  photos.forEach((p, i) => {
    d.prepare(
      'INSERT INTO item_photos (id, item_id, storage_path, thumb_path, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uid(), itemId, p.storage_path, p.thumb_path ?? p.storage_path, i, now());
  });
}

itemsRouter.post('/:id/photos', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const { id } = req.params;
  if (!isOwnedBy(id, req.user.id)) {
    res.status(403).json({ error: 'You can only manage your own listings.' });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const path = typeof body.storage_path === 'string' ? body.storage_path : null;
  if (!path || !/^\/uploads\//.test(path)) {
    res.status(400).json({ error: 'Invalid image path.' });
    return;
  }
  const count = row<{ c: number }>(getDb().prepare('SELECT COUNT(*) AS c FROM item_photos WHERE item_id = ?').get(id));
  if (count.c >= MAX_PHOTOS) {
    res.status(400).json({ error: `You can have up to ${MAX_PHOTOS} photos.` });
    return;
  }
  getDb().prepare(
    'INSERT INTO item_photos (id, item_id, storage_path, thumb_path, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(uid(), id, path, path, count.c, now());
  res.json(getItemDetail(id, req.user));
});

itemsRouter.delete('/:id/photos/:photoId', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const { id, photoId } = req.params;
  if (!isOwnedBy(id, req.user.id)) {
    res.status(403).json({ error: 'You can only manage your own listings.' });
    return;
  }
  getDb().prepare('DELETE FROM item_photos WHERE id = ? AND item_id = ?').run(photoId, id);
  res.json(getItemDetail(id, req.user));
});

itemsRouter.post('/:id/photos/reorder', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const { id } = req.params;
  if (!isOwnedBy(id, req.user.id)) {
    res.status(403).json({ error: 'You can only manage your own listings.' });
    return;
  }
  const order = (req.body?.photo_ids ?? []) as string[];
  order.forEach((pid, i) => {
    getDb().prepare('UPDATE item_photos SET sort_order = ? WHERE id = ? AND item_id = ?').run(i, pid, id);
  });
  res.json(getItemDetail(id, req.user));
});

// ---- Favorites -------------------------------------------------

itemsRouter.get('/favorites/mine', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const list = rows<Item>(
    getDb().prepare(`
      SELECT i.* FROM items i JOIN favorites f ON f.item_id = i.id
      WHERE f.user_id = ? AND i.status = 'active'
      ORDER BY f.created_at DESC
    `).all(req.user.id)
  );
  res.json({ items: enrichItems(list, req.user) });
});

itemsRouter.post('/:id/favorite', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const { id } = req.params;
  const existing = row<{ id: string } | undefined>(
    getDb().prepare('SELECT id FROM favorites WHERE user_id = ? AND item_id = ?').get(req.user.id, id)
  );
  if (!existing) {
    getDb().prepare('INSERT INTO favorites (id, user_id, item_id, created_at) VALUES (?, ?, ?, ?)')
      .run(uid(), req.user.id, id, now());
    track(req.user.id, 'favorite_added', { item_id: id });
  }
  res.json({ is_favorite: true });
});

itemsRouter.delete('/:id/favorite', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  getDb().prepare('DELETE FROM favorites WHERE user_id = ? AND item_id = ?').run(req.user.id, req.params.id);
  res.json({ is_favorite: false });
});
