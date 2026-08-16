import { getDb, uid, now } from './db.js';
import type { NotificationType } from '../shared/types.js';

export function notify(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, unknown> | null
): void {
  try {
    getDb().prepare(
      'INSERT INTO notifications (id, user_id, type, title, body, data, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
    ).run(uid(), userId, type, title, body, data ? JSON.stringify(data) : null, now());
  } catch {
    // never break a request on a notification failure
  }
}
