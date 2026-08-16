// =============================================================
// Social API — notifications, reports, profiles, settings,
// membership purchase (mock payment, clearly labelled).
// =============================================================

import { Router } from 'express';
import { getDb, row, rows, uid, now, type SQLValue } from '../db.js';
import { AuthedRequest, requireAuth } from '../auth.js';
import { publicUser, userProfile } from '../users-view.js';
import { enrichItems } from '../items-view.js';
import { track } from '../analytics.js';
import { paymentProvider, recordPayment, upgradeMembership } from '../payments.js';
import type { Item, Notification, Report, ReportReason, User } from '../../shared/types.js';

export const socialRouter = Router();

const REPORT_REASONS: ReportReason[] = [
  'scam', 'counterfeit', 'stolen_item', 'inappropriate', 'harassment', 'fake_listing', 'not_as_described',
];

// ---- Notifications --------------------------------------------

socialRouter.get('/notifications', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 100);
  const list = rows<Notification>(
    getDb().prepare(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(req.user.id, limit)
  );
  const unread = row<{ c: number }>(
    getDb().prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0').get(req.user.id)
  );
  res.json({ notifications: list, unread_count: unread?.c ?? 0 });
});

socialRouter.post('/notifications/read', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  getDb().prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

socialRouter.post('/notifications/:id/read', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  getDb().prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ---- Reports ---------------------------------------------------

socialRouter.post('/reports', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const reason = b.reason as ReportReason;
  const details = typeof b.details === 'string' ? b.details.trim().slice(0, 2000) : '';
  const reportedUserId = typeof b.reported_user_id === 'string' ? b.reported_user_id : null;
  const itemId = typeof b.item_id === 'string' ? b.item_id : null;
  const tradeId = typeof b.trade_id === 'string' ? b.trade_id : null;

  if (!REPORT_REASONS.includes(reason)) {
    res.status(400).json({ error: 'Pick a reason for the report.' }); return;
  }
  if (!reportedUserId && !itemId && !tradeId) {
    res.status(400).json({ error: 'Tell us what you are reporting.' }); return;
  }
  if (reportedUserId === req.user.id) {
    res.status(400).json({ error: 'You cannot report yourself.' }); return;
  }
  if (details.length < 10) {
    res.status(400).json({ error: 'Add a short explanation (at least 10 characters).' }); return;
  }
  const dup = row<{ id: string } | undefined>(
    getDb().prepare('SELECT id FROM reports WHERE reporter_id = ? AND reported_user_id IS ? AND item_id IS ? AND reason = ? AND status != ?')
      .get(req.user.id, reportedUserId, itemId, reason, 'dismissed')
  );
  if (dup) {
    res.status(409).json({ error: 'You already reported this — our team is reviewing it.' }); return;
  }

  getDb().prepare(`
    INSERT INTO reports (id, reporter_id, reported_user_id, item_id, trade_id, reason, details, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(uid(), req.user.id, reportedUserId, itemId, tradeId, reason, details, now());
  track(req.user.id, 'report_submitted', { reason });
  res.status(201).json({ ok: true });
});

// ---- Profiles & settings --------------------------------------

socialRouter.get('/users/:username', (req: AuthedRequest, res) => {
  const u = row<User | undefined>(
    getDb().prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(req.params.username)
  );
  if (!u) { res.status(404).json({ error: 'User not found.' }); return; }
  const profile = userProfile(u);
  const listings = rows<Item>(
    getDb().prepare("SELECT * FROM items WHERE owner_id = ? AND status = 'active' ORDER BY created_at DESC").all(u.id)
  );
  profile.listings = enrichItems(listings, req.user ?? null);
  res.json(profile);
});

socialRouter.patch('/me', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const d = getDb();
  const sets: string[] = [];
  const params: SQLValue[] = [];

  if (typeof b.display_name === 'string') {
    const name = b.display_name.trim();
    if (name.length < 2) { res.status(400).json({ error: 'Name must be at least 2 characters.' }); return; }
    sets.push('display_name = ?'); params.push(name);
  }
  if (typeof b.bio === 'string') {
    const bio = b.bio.trim().slice(0, 300);
    sets.push('bio = ?'); params.push(bio);
  }
  if (typeof b.location === 'string') {
    const loc = b.location.trim().slice(0, 80);
    if (loc.length < 2) { res.status(400).json({ error: 'Location is too short.' }); return; }
    sets.push('location = ?'); params.push(loc);
  }
  if (typeof b.latitude === 'number' && Number.isFinite(b.latitude)) { sets.push('latitude = ?'); params.push(b.latitude); }
  if (typeof b.longitude === 'number' && Number.isFinite(b.longitude)) { sets.push('longitude = ?'); params.push(b.longitude); }
  if (typeof b.avatar_url === 'string' && (b.avatar_url === '' || /^\/uploads\//.test(b.avatar_url))) {
    sets.push('avatar_url = ?'); params.push(b.avatar_url || null);
  }
  if (sets.length === 0) { res.status(400).json({ error: 'Nothing to update.' }); return; }
  params.push(req.user.id);
  d.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  const u = row<User>(d.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id));
  res.json({ user: publicUser(u) });
});

socialRouter.get('/me/settings', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const r = row<{ settings: string } | undefined>(
    getDb().prepare('SELECT settings FROM user_settings WHERE user_id = ?').get(req.user.id)
  );
  let settings: Record<string, unknown> = {};
  try { settings = r ? JSON.parse(r.settings) : {}; } catch { /* keep default */ }
  res.json({ settings });
});

socialRouter.patch('/me/settings', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const next = (req.body ?? {}) as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  if (next.notifications && typeof next.notifications === 'object') clean.notifications = next.notifications;
  if (next.privacy && typeof next.privacy === 'object') clean.privacy = next.privacy;
  getDb().prepare(`
    INSERT INTO user_settings (user_id, settings) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET settings = ?
  `).run(req.user.id, JSON.stringify(clean), JSON.stringify(clean));
  res.json({ settings: clean });
});

// ---- Onboarding ------------------------------------------------

socialRouter.post('/me/onboarded', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const d = getDb();
  const sets: string[] = ['onboarded = 1'];
  const params: SQLValue[] = [];
  if (typeof b.location === 'string' && b.location.trim().length >= 2) {
    sets.push('location = ?'); params.push(b.location.trim().slice(0, 80));
  }
  if (typeof b.latitude === 'number' && Number.isFinite(b.latitude)) { sets.push('latitude = ?'); params.push(b.latitude); }
  if (typeof b.longitude === 'number' && Number.isFinite(b.longitude)) { sets.push('longitude = ?'); params.push(b.longitude); }
  const owns = Array.isArray(b.owns) ? b.owns.filter((x) => typeof x === 'string').slice(0, 12) : [];
  const wants = Array.isArray(b.wants) ? b.wants.filter((x) => typeof x === 'string').slice(0, 12) : [];
  params.push(req.user.id);
  d.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  const settings = JSON.stringify({ interests: { owns, wants } });
  d.prepare(`
    INSERT INTO user_settings (user_id, settings) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET settings = ?
  `).run(req.user.id, settings, settings);
  track(req.user.id, 'onboarding_complete');
  const u = row<User>(d.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id));
  res.json({ user: publicUser(u), onboarded: true });
});

// ---- Membership / verification (mock payment) -----------------

socialRouter.post('/membership/purchase', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const plan = req.body?.plan === 'premium' ? 'premium' : 'verified';
  const intent = paymentProvider.createIntent({ userId: req.user.id, plan });
  const confirmed = paymentProvider.confirmIntent(intent.id);
  if (!confirmed.ok) {
    res.status(502).json({ error: 'The payment provider could not process this request.' }); return;
  }
  recordPayment({
    user_id: req.user.id,
    provider: paymentProvider.id,
    method: 'mock',
    amount: intent.amount,
    currency: intent.currency,
    reference: confirmed.reference,
    status: 'paid',
  });
  upgradeMembership(req.user.id, plan);
  track(req.user.id, 'user_verified', { plan });
  const u = row<User>(getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.user.id));
  res.json({
    user: publicUser(u),
    membership: {
      mock: true,
      reference: confirmed.reference,
      amount: intent.amount,
      currency: intent.currency,
      status: 'paid',
      method: 'mock',
    },
  });
});
