// =============================================================
// Auth routes
// =============================================================

import { Router } from 'express';
import { getDb, row, uid, now } from '../db.js';
import {
  AuthedRequest, SESSION_COOKIE, clearCookie, consumeCode, createSession, destroyAllSessions,
  destroySession, hashPassword, issueCode, requireAuth, sessionPayload, setCookie, verifyPassword,
} from '../auth.js';
import { publicUser } from '../users-view.js';
import { track } from '../analytics.js';
import type { UserRow } from '../../shared/types.js';

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

function validators(body: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  if (typeof body.username !== 'string' || !USERNAME_RE.test(body.username)) {
    errors.username = 'Username must be 3–24 characters (letters, numbers, _ or .).';
  }
  if (typeof body.display_name !== 'string' || body.display_name.trim().length < 2) {
    errors.display_name = 'Please enter your name.';
  }
  if (typeof body.email !== 'string' || !EMAIL_RE.test(body.email)) {
    errors.email = 'Please enter a valid email address.';
  }
  if (typeof body.password !== 'string' || body.password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }
  return errors;
}

authRouter.post('/signup', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors = validators(body);
  if (Object.keys(errors).length > 0) {
    res.status(400).json({ error: 'Check the highlighted fields.', fields: errors });
    return;
  }
  const d = getDb();
  const email = (body.email as string).trim().toLowerCase();
  const username = (body.username as string).trim();
  const existing = row<{ id: string } | undefined>(
    d.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username)
  );
  if (existing) {
    res.status(409).json({ error: 'An account with that email or username already exists.' });
    return;
  }
  const id = uid();
  d.prepare(`
    INSERT INTO users (id, username, display_name, email, password_hash, bio, onboarded, created_at)
    VALUES (?, ?, ?, ?, ?, '', 0, ?)
  `).run(id, username, (body.display_name as string).trim(), email, hashPassword(body.password as string), now());

  // Demo email verification: code is returned in dev so the flow works
  // without a mail server. Production uses Supabase Auth (see /supabase).
  const code = issueCode(id, 'verify');
  console.log(`[badel] 📧 verification code for ${email}: ${code}`);

  const token = createSession(id, req.headers['user-agent'] ?? null);
  setCookie(res, SESSION_COOKIE, token, 30);
  track(id, 'signup');
  const u = row<UserRow>(d.prepare('SELECT * FROM users WHERE id = ?').get(id));
  res.status(201).json({ ...sessionPayload(u), demo_email_code: code });
});

authRouter.post('/login', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const u = row<UserRow | undefined>(
    getDb().prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(email, email)
  );
  if (!u || !verifyPassword(password, u.password_hash)) {
    res.status(401).json({ error: 'Incorrect email or password.' });
    return;
  }
  if (u.role === 'suspended') {
    res.status(403).json({ error: 'This account is suspended. Contact Badel support.' });
    return;
  }
  const token = createSession(u.id, req.headers['user-agent'] ?? null);
  setCookie(res, SESSION_COOKIE, token, 30);
  track(u.id, 'login');
  res.json(sessionPayload(u));
});

authRouter.post('/logout', (req: AuthedRequest, res) => {
  if (req.sessionToken) destroySession(req.sessionToken);
  clearCookie(res, SESSION_COOKIE);
  res.json({ ok: true });
});

authRouter.post('/logout-all', requireAuth, (req: AuthedRequest, res) => {
  if (req.user) destroyAllSessions(req.user.id);
  clearCookie(res, SESSION_COOKIE);
  res.json({ ok: true });
});

authRouter.get('/me', (req: AuthedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }
  res.json(sessionPayload(req.user));
});

/** Resend or issue the email verification code. */
authRouter.post('/verify/resend', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const code = issueCode(req.user.id, 'verify');
  console.log(`[badel] 📧 verification code for ${req.user.email}: ${code}`);
  res.json({ ok: true, demo_email_code: code });
});

/** Confirm the email with the code from the email. */
authRouter.post('/verify', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!consumeCode(req.user.id, 'verify', code)) {
    res.status(400).json({ error: 'That code is invalid or has expired.' });
    return;
  }
  getDb().prepare("UPDATE users SET verification_status = 'verified' WHERE id = ?").run(req.user.id);
  track(req.user.id, 'user_verified');
  const u = row<UserRow>(getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.user.id));
  res.json({ user: publicUser(u), onboarded: u.onboarded === 1 });
});

/** Request a password reset (demo: code revealed in dev). */
authRouter.post('/reset/request', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const u = row<{ id: string } | undefined>(
    getDb().prepare('SELECT id FROM users WHERE email = ?').get(email)
  );
  // Always respond the same to avoid user enumeration
  if (u) {
    const code = issueCode(u.id, 'reset');
    console.log(`[badel] 🔑 reset code for ${email}: ${code}`);
  }
  res.json({ ok: true, demo_email_code: 'check-server-log' });
});

/** Complete the password reset. */
authRouter.post('/reset/confirm', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }
  const u = row<{ id: string } | undefined>(
    getDb().prepare('SELECT id FROM users WHERE email = ?').get(email)
  );
  if (!u || !consumeCode(u.id, 'reset', code)) {
    res.status(400).json({ error: 'That code is invalid or has expired.' });
    return;
  }
  getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), u.id);
  destroyAllSessions(u.id);
  const token = createSession(u.id, req.headers['user-agent'] ?? null);
  setCookie(res, SESSION_COOKIE, token, 30);
  res.json({ ok: true });
});
