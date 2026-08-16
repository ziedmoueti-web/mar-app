import { getDb, uid, now } from './db.js';
import type { AnalyticsEvent } from '../shared/types.js';

/** Records a product event. Never stores personal content — just the event name. */
export function track(userId: string | null, name: AnalyticsEvent, data?: Record<string, unknown>): void {
  try {
    getDb().prepare(
      'INSERT INTO analytics_events (id, user_id, name, data, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(uid(), userId, name, data ? JSON.stringify(data) : null, now());
  } catch {
    // analytics must never break a request
  }
}
