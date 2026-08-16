// =============================================================
// User projection helpers — never leak emails or private data.
// =============================================================

import { getDb, row, rows } from './db.js';
import type { PublicUser, Rating, User } from '../shared/types.js';

export function publicUser(u: User & { email?: string; password_hash?: string; onboarded?: 0 | 1 }): PublicUser {
  const { email, password_hash, onboarded, ...rest } = u;
  void password_hash; void onboarded;
  // Trust metric: share of positive (4★+) ratings received, once there is enough data.
  let successful_trade_pct: number | null = null;
  if ((u.rating_count ?? 0) >= 3) {
    const pos = row<{ c: number }>(
      getDb().prepare('SELECT COUNT(*) AS c FROM ratings WHERE ratee_id = ? AND overall >= 4').get(u.id)
    );
    successful_trade_pct = Math.round(((pos?.c ?? 0) / u.rating_count) * 100);
  }
  return { ...rest, email: undefined, successful_trade_pct };
}

export interface ProfileView extends PublicUser {
  listings: unknown[];
  ratings_summary: { reliability: number | null; communication: number | null; item_accuracy: number | null };
  recent_ratings: Rating[];
}

export function userProfile(u: User): ProfileView {
  const d = getDb();
  const ratings = rows<Rating>(
    d.prepare(
      `SELECT * FROM ratings WHERE ratee_id = ? ORDER BY created_at DESC LIMIT 10`
    ).all(u.id)
  );
  const avg = (field: 'reliability' | 'communication' | 'item_accuracy') => {
    const r = row<{ a: number | null } | undefined>(
      d.prepare(`SELECT AVG(${field}) AS a FROM ratings WHERE ratee_id = ?`).get(u.id)
    );
    return r?.a ?? null;
  };
  return {
    ...publicUser(u),
    listings: [],
    ratings_summary: { reliability: avg('reliability'), communication: avg('communication'), item_accuracy: avg('item_accuracy') },
    recent_ratings: ratings,
  };
}

/** Recomputes a user's aggregate rating + completed trade count from ratings. */
export function refreshUserStats(userId: string): void {
  const d = getDb();
  const agg = row<{ avg: number | null; cnt: number } | undefined>(
    d.prepare('SELECT AVG(overall) AS avg, COUNT(*) AS cnt FROM ratings WHERE ratee_id = ?').get(userId)
  );
  const completed = row<{ c: number }>(
    d.prepare(
      `SELECT COUNT(*) AS c FROM trade_offers WHERE status = 'completed' AND (from_user_id = ? OR to_user_id = ?)`
    ).get(userId, userId)
  );
  d.prepare('UPDATE users SET rating = ?, rating_count = ?, completed_trades = ? WHERE id = ?').run(
    agg?.avg ?? null, agg?.cnt ?? 0, completed?.c ?? 0, userId
  );
}

export function isBlocked(a: string, b: string): boolean {
  const r = getDb().prepare('SELECT 1 FROM user_blocks WHERE user_id = ? AND blocked_user_id = ?').get(a, b);
  return !!r;
}
