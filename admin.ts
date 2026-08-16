// =============================================================
// Admin API — protected by requireAdmin (role check server-side).
// Normal users can never reach these routes.
// =============================================================

import { Router } from 'express';
import { getDb, row, rows, uid, now, type SQLValue } from '../db.js';
import { AuthedRequest, requireAdmin } from '../auth.js';
import { publicUser } from '../users-view.js';
import { getCategoryBySlug } from '../items-view.js';
import { notify } from '../notify.js';
import type { Category, Item, MembershipStatus, Report, TradeOffer, User } from '../../shared/types.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

// ---- Stats -----------------------------------------------------

adminRouter.get('/stats', (_req: AuthedRequest, res) => {
  const d = getDb();
  const one = (sql: string, ...p: SQLValue[]): number => (row<{ c: number }>(d.prepare(sql).get(...p))?.c ?? 0);
  const tradesByStatus: Record<string, number> = {};
  for (const r of rows<{ status: string; c: number }>(
    d.prepare('SELECT status, COUNT(*) AS c FROM trade_offers GROUP BY status').all()
  )) tradesByStatus[r.status] = r.c;
  const memberships = {} as Record<MembershipStatus, number>;
  for (const m of ['free', 'verified', 'premium'] as MembershipStatus[]) {
    memberships[m] = one('SELECT COUNT(*) AS c FROM users WHERE membership_status = ?', m);
  }
  const itemsByCategory = rows<{ category_id: string; c: number }>(
    d.prepare("SELECT category_id, COUNT(*) AS c FROM items WHERE status != 'deleted' GROUP BY category_id ORDER BY c DESC LIMIT 10").all()
  );
  const catMap = new Map<string, Category>();
  for (const c of rows<Category>(d.prepare('SELECT * FROM categories').all())) catMap.set(c.id, c);
  const eventsLast14d: { day: string; count: number }[] = [];
  const start = now() - 13 * 24 * 3600 * 1000;
  const byDay = new Map<string, number>();
  for (const e of rows<{ created_at: number }>(
    d.prepare('SELECT created_at FROM analytics_events WHERE created_at >= ?').all(start)
  )) {
    const day = new Date(e.created_at).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  for (let i = 13; i >= 0; i--) {
    const day = new Date(start + i * 24 * 3600 * 1000).toISOString().slice(0, 10);
    eventsLast14d.push({ day, count: byDay.get(day) ?? 0 });
  }
  res.json({
    users: one('SELECT COUNT(*) AS c FROM users'),
    items: one("SELECT COUNT(*) AS c FROM items WHERE status != 'deleted'"),
    active_trades: one("SELECT COUNT(*) AS c FROM trade_offers WHERE status IN ('pending','accepted','meetup')"),
    completed_trades: one("SELECT COUNT(*) AS c FROM trade_offers WHERE status = 'completed'"),
    pending_offers: one("SELECT COUNT(*) AS c FROM trade_offers WHERE status = 'pending'"),
    open_reports: one("SELECT COUNT(*) AS c FROM reports WHERE status IN ('open','reviewing')"),
    verified_users: one("SELECT COUNT(*) AS c FROM users WHERE verification_status = 'verified'"),
    memberships,
    trades_by_status: tradesByStatus,
    items_by_category: itemsByCategory.map((r) => ({ category: catMap.get(r.category_id) ?? { id: r.category_id, slug: '?', name: 'Other', icon: '📦', sort_order: 99 }, count: r.c })),
    events_last_14d: eventsLast14d,
  });
});

// ---- Users -----------------------------------------------------

adminRouter.get('/users', (req: AuthedRequest, res) => {
  const q = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const role = typeof req.query.role === 'string' ? req.query.role : '';
  const where: string[] = [];
  const params: SQLValue[] = [];
  if (q) { where.push('(username LIKE ? OR display_name LIKE ? OR email LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (role) { where.push('role = ?'); params.push(role); }
  const sql = `SELECT * FROM users${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 200`;
  const list = rows<User>(getDb().prepare(sql).all(...params));
  res.json({ users: list.map((u) => ({ ...publicUser(u), email: u.email })) });
});

adminRouter.patch('/users/:id', (req: AuthedRequest, res) => {
  const { id } = req.params;
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (id === req.user?.id) { res.status(400).json({ error: 'You cannot moderate your own account here.' }); return; }
  const sets: string[] = [];
  const params: SQLValue[] = [];
  if (typeof b.role === 'string' && ['user', 'admin', 'suspended'].includes(b.role)) { sets.push('role = ?'); params.push(b.role); }
  if (typeof b.verification_status === 'string' && ['unverified', 'pending', 'verified'].includes(b.verification_status)) { sets.push('verification_status = ?'); params.push(b.verification_status); }
  if (typeof b.membership_status === 'string' && ['free', 'verified', 'premium'].includes(b.membership_status)) { sets.push('membership_status = ?'); params.push(b.membership_status); }
  if (sets.length === 0) { res.status(400).json({ error: 'Nothing to update.' }); return; }
  params.push(id);
  getDb().prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  if (b.role === 'suspended') {
    notify(id, 'system', 'Account suspended', 'Your account was suspended by Badel moderation. Contact support if you believe this is a mistake.');
  }
  const u = row<User>(getDb().prepare('SELECT * FROM users WHERE id = ?').get(id));
  res.json({ user: { ...publicUser(u), email: u.email } });
});

// ---- Items -----------------------------------------------------

adminRouter.get('/items', (req: AuthedRequest, res) => {
  const q = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const where: string[] = [];
  const params: SQLValue[] = [];
  if (q) { where.push('(title LIKE ?)'); params.push(`%${q}%`); }
  const list = rows<Item>(
    getDb().prepare(`SELECT * FROM items${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 200`).all(...params)
  );
  const owners = new Map<string, User>();
  for (const u of rows<User>(
    getDb().prepare(`SELECT * FROM users WHERE id IN (${list.map(() => '?').join(',') || "'__none__'"})`).all(...list.map((i) => i.owner_id))
  )) owners.set(u.id, u);
  res.json({ items: list.map((i) => ({ ...i, owner: owners.get(i.owner_id) ? publicUser(owners.get(i.owner_id)!) : null })) });
});

adminRouter.delete('/items/:id', (req: AuthedRequest, res) => {
  const { id } = req.params;
  const it = row<Item | undefined>(getDb().prepare('SELECT * FROM items WHERE id = ?').get(id));
  if (!it) { res.status(404).json({ error: 'Item not found.' }); return; }
  getDb().prepare('DELETE FROM items WHERE id = ?').run(id);
  notify(it.owner_id, 'system', 'Listing removed',
    `Your listing "${it.title}" was removed by Badel moderation.`);
  res.json({ ok: true });
});

adminRouter.patch('/items/:id', (req: AuthedRequest, res) => {
  const { id } = req.params;
  const status = req.body?.status;
  if (!['active', 'unavailable'].includes(status as string)) { res.status(400).json({ error: 'Invalid status.' }); return; }
  getDb().prepare('UPDATE items SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);
  res.json({ ok: true });
});

// ---- Trades ----------------------------------------------------

adminRouter.get('/trades', (req: AuthedRequest, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const where = status ? 'WHERE status = ?' : '';
  const params: SQLValue[] = status ? [status] : [];
  const list = rows<TradeOffer>(
    getDb().prepare(`SELECT * FROM trade_offers ${where} ORDER BY created_at DESC LIMIT 300`).all(...params)
  );
  const userIds = [...new Set(list.flatMap((t) => [t.from_user_id, t.to_user_id]))];
  const users = new Map<string, User>();
  for (const u of rows<User>(
    getDb().prepare(`SELECT * FROM users WHERE id IN (${userIds.map(() => '?').join(',') || "'__none__'"})`).all(...userIds)
  )) users.set(u.id, u);
  const itemIds = [...new Set(list.flatMap((t) => [t.offered_item_id, t.requested_item_id]))];
  const items = new Map<string, Item>();
  for (const it of rows<Item>(
    getDb().prepare(`SELECT * FROM items WHERE id IN (${itemIds.map(() => '?').join(',') || "'__none__'"})`).all(...itemIds)
  )) items.set(it.id, it);
  res.json({
    trades: list.map((t) => ({
      ...t,
      from_user: users.get(t.from_user_id) ? publicUser(users.get(t.from_user_id)!) : null,
      to_user: users.get(t.to_user_id) ? publicUser(users.get(t.to_user_id)!) : null,
      offered_item: items.get(t.offered_item_id) ?? null,
      requested_item: items.get(t.requested_item_id) ?? null,
    })),
  });
});

adminRouter.patch('/trades/:id', (req: AuthedRequest, res) => {
  const { id } = req.params;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const t = row<TradeOffer | undefined>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(id));
  if (!t) { res.status(404).json({ error: 'Trade not found.' }); return; }
  const sets: string[] = [];
  const params: SQLValue[] = [];
  if (typeof b.status === 'string' && ['pending', 'accepted', 'meetup', 'completed', 'declined', 'cancelled', 'disputed'].includes(b.status)) {
    sets.push('status = ?'); params.push(b.status);
    if (b.status === 'completed') {
      sets.push('completed_at = ?'); params.push(now());
      sets.push('from_exchange_confirmed = 1'); sets.push('to_exchange_confirmed = 1');
    }
  }
  if (typeof b.dispute_reason === 'string') { sets.push('dispute_reason = ?'); params.push(b.dispute_reason.slice(0, 1000)); }
  if (sets.length === 0) { res.status(400).json({ error: 'Nothing to update.' }); return; }
  params.push(id);
  getDb().prepare(`UPDATE trade_offers SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  if (b.status === 'completed') {
    notify(t.from_user_id, 'trade_completed', 'Trade resolved',
      'An admin resolved your trade — it is now marked as completed.', { trade_id: t.id });
    notify(t.to_user_id, 'trade_completed', 'Trade resolved',
      'An admin resolved your trade — it is now marked as completed.', { trade_id: t.id });
  }
  res.json({ ok: true });
});

// ---- Reports ---------------------------------------------------

adminRouter.get('/reports', (req: AuthedRequest, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'open';
  const where = status && status !== 'all' ? 'WHERE status = ?' : '';
  const params: SQLValue[] = status && status !== 'all' ? [status] : [];
  const list = rows<Report>(
    getDb().prepare(`SELECT * FROM reports ${where} ORDER BY created_at DESC LIMIT 200`).all(...params)
  );
  const userIds = [...new Set(list.flatMap((r) => [r.reporter_id, r.reported_user_id ?? ''].filter(Boolean)))];
  const users = new Map<string, User>();
  for (const u of rows<User>(
    getDb().prepare(`SELECT * FROM users WHERE id IN (${userIds.map(() => '?').join(',') || "'__none__'"})`).all(...userIds)
  )) users.set(u.id, u);
  const itemIds = [...new Set(list.map((r) => r.item_id ?? '').filter(Boolean))];
  const items = new Map<string, Item>();
  for (const it of rows<Item>(
    getDb().prepare(`SELECT * FROM items WHERE id IN (${itemIds.map(() => '?').join(',') || "'__none__'"})`).all(...itemIds)
  )) items.set(it.id, it);
  res.json({
    reports: list.map((r) => ({
      ...r,
      reporter: users.get(r.reporter_id) ? publicUser(users.get(r.reporter_id)!) : null,
      reported_user: r.reported_user_id && users.get(r.reported_user_id) ? publicUser(users.get(r.reported_user_id)!) : null,
      item: r.item_id ? items.get(r.item_id) ?? null : null,
    })),
  });
});

adminRouter.patch('/reports/:id', (req: AuthedRequest, res) => {
  const { id } = req.params;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const status = b.status;
  if (!['open', 'reviewing', 'action_taken', 'dismissed'].includes(status as string)) {
    res.status(400).json({ error: 'Invalid status.' }); return;
  }
  const notes = typeof b.admin_notes === 'string' ? b.admin_notes.trim().slice(0, 1000) : null;
  getDb().prepare('UPDATE reports SET status = ?, admin_notes = COALESCE(?, admin_notes) WHERE id = ?').run(status as string, notes, id);
  res.json({ ok: true });
});

// ---- Categories ------------------------------------------------

adminRouter.get('/categories', (_req: AuthedRequest, res) => {
  res.json({ categories: rows<Category>(getDb().prepare('SELECT * FROM categories ORDER BY sort_order').all()) });
});

adminRouter.post('/categories', (req: AuthedRequest, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const slug = typeof b.slug === 'string' ? b.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') : '';
  const icon = typeof b.icon === 'string' ? b.icon.trim().slice(0, 8) : '📦';
  if (name.length < 2 || slug.length < 2) { res.status(400).json({ error: 'Name and slug are required.' }); return; }
  const sort = row<{ m: number }>(getDb().prepare('SELECT MAX(sort_order) AS m FROM categories').get())?.m ?? 0;
  getDb().prepare('INSERT INTO categories (id, slug, name, icon, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(uid(), slug, name, icon, sort + 1);
  res.status(201).json({ ok: true });
});

adminRouter.patch('/categories/:id', (req: AuthedRequest, res) => {
  const { id } = req.params;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const sets: string[] = [];
  const params: SQLValue[] = [];
  if (typeof b.name === 'string' && b.name.trim().length >= 2) { sets.push('name = ?'); params.push(b.name.trim()); }
  if (typeof b.icon === 'string') { sets.push('icon = ?'); params.push(b.icon.trim().slice(0, 8)); }
  if (typeof b.slug === 'string' && b.slug.trim().length >= 2) { sets.push('slug = ?'); params.push(b.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')); }
  if (sets.length === 0) { res.status(400).json({ error: 'Nothing to update.' }); return; }
  params.push(id);
  getDb().prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

adminRouter.delete('/categories/:id', (req: AuthedRequest, res) => {
  const { id } = req.params;
  const used = row<{ c: number }>(getDb().prepare('SELECT COUNT(*) AS c FROM items WHERE category_id = ?').get(id));
  if ((used?.c ?? 0) > 0) { res.status(409).json({ error: 'Category is in use — reassign items first.' }); return; }
  getDb().prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---- Analytics -------------------------------------------------

adminRouter.get('/analytics', (_req: AuthedRequest, res) => {
  const d = getDb();
  const events = rows<{ name: string; c: number }>(
    d.prepare('SELECT name, COUNT(*) AS c FROM analytics_events GROUP BY name ORDER BY c DESC').all()
  );
  const counts = new Map<string, number>();
  for (const e of rows<{ data: string | null }>(
    d.prepare("SELECT data FROM analytics_events WHERE name = 'item_viewed' AND data IS NOT NULL").all()
  )) {
    try {
      const parsed = JSON.parse(e.data!);
      if (typeof parsed.item_id === 'string') counts.set(parsed.item_id, (counts.get(parsed.item_id) ?? 0) + 1);
    } catch { /* skip malformed */ }
  }
  res.json({ events, top_items: [...counts.entries()].map(([item_id, c]) => ({ item_id, c })).sort((a, b) => b.c - a.c).slice(0, 10) });
});

// keep getCategoryBySlug referenced
export { getCategoryBySlug };
