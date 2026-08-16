// =============================================================
// Trades API — offers, lifecycle, meetups, ratings, messaging.
//
// The lifecycle is enforced server-side:
//   pending → accepted → meetup → completed
//   pending → declined | cancelled
//   accepted/meetup → cancelled | disputed
// Completion requires BOTH parties to confirm the exchange.
// Ratings are only possible after a completed trade, once each.
// =============================================================

import { Router } from 'express';
import { getDb, row, rows, uid, now, type SQLValue } from '../db.js';
import { AuthedRequest, requireAuth } from '../auth.js';
import { enrichItems } from '../items-view.js';
import { isBlocked, publicUser, refreshUserStats } from '../users-view.js';
import { track } from '../analytics.js';
import { notify } from '../notify.js';
import type {
  Item, Meetup, Message, OfferWithDetails, Rating, TradeDetail, TradeOffer, TradeOfferStatus, User,
} from '../../shared/types.js';

export const tradesRouter = Router();
const ACTIVE = ['pending', 'accepted', 'meetup'];

function participantsOf(o: TradeOffer): [string, string] {
  return [o.from_user_id, o.to_user_id];
}

function isParticipant(o: TradeOffer, userId: string): boolean {
  return o.from_user_id === userId || o.to_user_id === userId;
}

function canView(o: TradeOffer, user: User | null): boolean {
  return !!user && (user.role === 'admin' || isParticipant(o, user.id));
}

// ---- Offer view models ----------------------------------------

function offerDetails(offers: TradeOffer[], viewer: User | null): OfferWithDetails[] {
  if (offers.length === 0) return [];
  const d = getDb();
  const ids = offers.map((o) => o.id);
  const q = ids.map(() => '?').join(',');

  const itemIds = [...new Set(offers.flatMap((o) => [o.offered_item_id, o.requested_item_id]))];
  const items = rows<Item>(
    d.prepare(`SELECT * FROM items WHERE id IN (${itemIds.map(() => '?').join(',')})`).all(...itemIds)
  );
  const enriched = enrichItems(items, viewer, { withMatch: false });
  const byId = new Map(enriched.map((i) => [i.id, i]));

  const userIds = [...new Set(offers.flatMap((o) => [o.from_user_id, o.to_user_id]))];
  const users = new Map<string, ReturnType<typeof publicUser>>();
  for (const u of rows<User>(
    d.prepare(`SELECT * FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`).all(...userIds)
  )) {
    users.set(u.id, publicUser(u));
  }

  const unread = new Map<string, number>();
  for (const r of rows<{ trade_id: string; c: number }>(
    d.prepare(`
      SELECT trade_id, COUNT(*) AS c FROM messages
      WHERE trade_id IN (${q}) AND read = 0 AND sender_id != ?
      GROUP BY trade_id
    `).all(...ids, viewer?.id ?? '__none__')
  )) {
    unread.set(r.trade_id, r.c);
  }

  return offers.map((o) => {
    const counterpartId = viewer ? (o.from_user_id === viewer.id ? o.to_user_id : o.from_user_id) : o.to_user_id;
    return {
      ...o,
      offered_item: byId.get(o.offered_item_id) ?? null,
      requested_item: byId.get(o.requested_item_id) ?? null,
      counterpart: users.get(counterpartId) ?? ({} as ReturnType<typeof publicUser>),
      unread_message_count: unread.get(o.id) ?? 0,
    };
  });
}

function tradeDetail(o: TradeOffer, viewer: User): TradeDetail {
  const d = getDb();
  const base = offerDetails([o], viewer)[0];
  const messages = rows<Message>(
    d.prepare('SELECT * FROM messages WHERE trade_id = ? ORDER BY created_at ASC').all(o.id)
  );
  const meetup = row<Meetup | undefined>(
    d.prepare('SELECT * FROM meetups WHERE trade_id = ? ORDER BY created_at DESC LIMIT 1').get(o.id)
  ) ?? null;
  const myRating = row<Rating | undefined>(
    d.prepare('SELECT * FROM ratings WHERE trade_id = ? AND rater_id = ?').get(o.id, viewer.id)
  ) ?? null;
  const theirRating = row<Rating | undefined>(
    d.prepare('SELECT * FROM ratings WHERE trade_id = ? AND ratee_id = ?').get(o.id, viewer.id)
  ) ?? null;

  const myConfirmed = o.from_user_id === viewer.id ? o.from_exchange_confirmed === 1 : o.to_exchange_confirmed === 1;
  const theirConfirmed = o.from_user_id === viewer.id ? o.to_exchange_confirmed === 1 : o.from_exchange_confirmed === 1;

  return {
    ...base,
    messages,
    meetup,
    my_rating: myRating,
    their_rating: theirRating,
    can_rate: o.status === 'completed' && !myRating && !theirRating,
    my_exchange_confirmed: myConfirmed,
    their_exchange_confirmed: theirConfirmed,
  };
}

// ---- Offers ----------------------------------------------------

tradesRouter.get('/offers', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const scope = (req.query.scope as string) || 'all';
  const d = getDb();
  let where = 'WHERE (from_user_id = ? OR to_user_id = ?)';
  let params: SQLValue[] = [req.user.id, req.user.id];
  if (scope === 'incoming') { where = 'WHERE to_user_id = ? AND status = ?'; params = [req.user.id, 'pending']; }
  else if (scope === 'sent') { where = 'WHERE from_user_id = ? AND status = ?'; params = [req.user.id, 'pending']; }
  else if (scope === 'active') { where = `WHERE (from_user_id = ? OR to_user_id = ?) AND status IN (${ACTIVE.filter((s) => s !== 'pending').map(() => '?').join(',')}) AND status != 'pending'`; params = [req.user.id, req.user.id, ...ACTIVE.filter((s) => s !== 'pending')]; }
  else if (scope === 'completed') { where = 'WHERE (from_user_id = ? OR to_user_id = ?) AND status = ?'; params = [req.user.id, req.user.id, 'completed']; }
  else if (scope === 'problem') { where = "WHERE (from_user_id = ? OR to_user_id = ?) AND status IN ('declined','cancelled','disputed')"; params = [req.user.id, req.user.id]; }

  const list = rows<TradeOffer>(
    d.prepare(`SELECT * FROM trade_offers ${where} ORDER BY created_at DESC`).all(...params)
  );
  res.json({ offers: offerDetails(list, req.user) });
});

tradesRouter.get('/offers/:id', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const o = row<TradeOffer | undefined>(
    getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(req.params.id)
  );
  if (!o) { res.status(404).json({ error: 'Trade not found.' }); return; }
  if (!canView(o, req.user)) { res.status(403).json({ error: 'You do not have access to this trade.' }); return; }
  res.json(tradeDetail(o, req.user));
});

tradesRouter.post('/offers', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const offeredId = typeof body.offered_item_id === 'string' ? body.offered_item_id : '';
  const requestedId = typeof body.requested_item_id === 'string' ? body.requested_item_id : '';
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 600) : '';

  const d = getDb();
  const offered = row<Item | undefined>(d.prepare('SELECT * FROM items WHERE id = ?').get(offeredId));
  const requested = row<Item | undefined>(d.prepare('SELECT * FROM items WHERE id = ?').get(requestedId));

  if (!offered || !requested) { res.status(404).json({ error: 'One of the listings could not be found.' }); return; }
  if (offered.owner_id !== req.user.id) {
    res.status(403).json({ error: 'You can only offer items you own.' }); return;
  }
  if (requested.owner_id === req.user.id) {
    res.status(400).json({ error: 'You cannot trade with yourself.' }); return;
  }
  if (offered.status !== 'active') {
    res.status(409).json({ error: 'Your item is not available for trade right now.' }); return;
  }
  if (requested.status !== 'active') {
    res.status(409).json({ error: 'That listing is no longer available.' }); return;
  }
  if (isBlocked(requested.owner_id, req.user.id)) {
    res.status(403).json({ error: 'You cannot send an offer to this user.' }); return;
  }

  const busy = (id: string) => {
    const r = row<{ c: number } | undefined>(
      d.prepare(
        `SELECT COUNT(*) AS c FROM trade_offers WHERE status IN (${ACTIVE.map(() => '?').join(',')})
         AND (offered_item_id = ? OR requested_item_id = ?)`
      ).get(...ACTIVE, id, id)
    );
    return (r?.c ?? 0) > 0;
  };

  if (busy(offeredId)) {
    res.status(409).json({ error: 'Your item is already committed to another active trade. Finish or cancel that trade first.' }); return;
  }
  if (busy(requestedId)) {
    res.status(409).json({ error: 'That item is already committed to another active trade.' }); return;
  }
  if (message.length < 2) {
    res.status(400).json({ error: 'Add a short message so the other person knows what you propose.' }); return;
  }

  const id = uid();
  try {
    d.prepare(`
      INSERT INTO trade_offers (id, from_user_id, to_user_id, offered_item_id, requested_item_id, message, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, req.user.id, requested.owner_id, offeredId, requestedId, message, now());
  } catch (e) {
    if (e instanceof Error && /UNIQUE constraint failed/.test(e.message)) {
      res.status(409).json({ error: 'You already have an active offer for this exact trade.' }); return;
    }
    throw e;
  }

  notify(requested.owner_id, 'offer_received', 'New trade offer',
    `${req.user.display_name} offered "${offered.title}" for your "${requested.title}".`,
    { trade_id: id, item_id: requestedId });
  track(req.user.id, 'offer_sent', { trade_id: id, requested_item_id: requestedId });
  res.status(201).json(tradeDetail(row<TradeOffer>(d.prepare('SELECT * FROM trade_offers WHERE id = ?').get(id)), req.user));
});

// ---- Lifecycle -------------------------------------------------

function transitionGuard(
  o: TradeOffer, actor: User, allowedFrom: TradeOfferStatus[], actorIs: 'to' | 'either' | 'from'
): { status: number; error: string } | null {
  if (!isParticipant(o, actor.id)) return { status: 403, error: 'You are not part of this trade.' };
  if (!allowedFrom.includes(o.status)) {
    return { status: 409, error: 'This trade is no longer in a state that allows that action.' };
  }
  if (actorIs === 'to' && o.to_user_id !== actor.id) return { status: 409, error: 'Only the recipient of the offer can do that.' };
  if (actorIs === 'from' && o.from_user_id !== actor.id) return { status: 409, error: 'Only the sender of the offer can do that.' };
  return null;
}

tradesRouter.post('/offers/:id/accept', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const o = row<TradeOffer | undefined>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(req.params.id));
  if (!o) { res.status(404).json({ error: 'Trade not found.' }); return; }
  const err = transitionGuard(o, req.user, ['pending'], 'to');
  if (err) { res.status(err.status).json({ error: err.error }); return; }
  // double-check requested item still active
  const requested = row<Item | undefined>(getDb().prepare('SELECT * FROM items WHERE id = ?').get(o.requested_item_id));
  if (!requested || requested.status !== 'active') {
    res.status(409).json({ error: 'The listing is no longer available.' }); return;
  }
  getDb().prepare("UPDATE trade_offers SET status = 'accepted', accepted_at = ? WHERE id = ?").run(now(), o.id);
  notify(o.from_user_id, 'offer_accepted', 'Offer accepted',
    `${req.user.display_name} accepted your offer for "${requested.title}". Arrange your exchange.`,
    { trade_id: o.id });
  track(req.user.id, 'offer_accepted', { trade_id: o.id });
  res.json(tradeDetail(row<TradeOffer>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(o.id)), req.user));
});

tradesRouter.post('/offers/:id/decline', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const o = row<TradeOffer | undefined>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(req.params.id));
  if (!o) { res.status(404).json({ error: 'Trade not found.' }); return; }
  const err = transitionGuard(o, req.user, ['pending'], 'to');
  if (err) { res.status(err.status).json({ error: err.error }); return; }
  getDb().prepare("UPDATE trade_offers SET status = 'declined' WHERE id = ?").run(o.id);
  notify(o.from_user_id, 'offer_declined', 'Offer declined', `${req.user.display_name} declined your offer.`, { trade_id: o.id });
  res.json(tradeDetail(row<TradeOffer>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(o.id)), req.user));
});

tradesRouter.post('/offers/:id/cancel', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const o = row<TradeOffer | undefined>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(req.params.id));
  if (!o) { res.status(404).json({ error: 'Trade not found.' }); return; }
  const err = transitionGuard(o, req.user, ['pending', 'accepted', 'meetup'], 'either');
  if (err) { res.status(err.status).json({ error: err.error }); return; }
  getDb().prepare("UPDATE trade_offers SET status = 'cancelled', cancelled_by = ? WHERE id = ?").run(req.user.id, o.id);
  const other = o.from_user_id === req.user.id ? o.to_user_id : o.from_user_id;
  notify(other, 'offer_cancelled', 'Trade cancelled', `${req.user.display_name} cancelled the trade.`, { trade_id: o.id });
  res.json(tradeDetail(row<TradeOffer>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(o.id)), req.user));
});

tradesRouter.post('/offers/:id/dispute', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 1000) : '';
  if (reason.length < 10) { res.status(400).json({ error: 'Describe what went wrong (at least 10 characters).' }); return; }
  const o = row<TradeOffer | undefined>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(req.params.id));
  if (!o) { res.status(404).json({ error: 'Trade not found.' }); return; }
  const err = transitionGuard(o, req.user, ['accepted', 'meetup'], 'either');
  if (err) { res.status(err.status).json({ error: err.error }); return; }
  getDb().prepare("UPDATE trade_offers SET status = 'disputed', dispute_reason = ? WHERE id = ?").run(reason, o.id);
  const other = o.from_user_id === req.user.id ? o.to_user_id : o.from_user_id;
  notify(other, 'system', 'Trade disputed', `${req.user.display_name} opened a dispute on your trade. Badel admins have been notified.`, { trade_id: o.id });
  res.json(tradeDetail(row<TradeOffer>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(o.id)), req.user));
});

// ---- Meetup ----------------------------------------------------

tradesRouter.post('/offers/:id/meetup', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const o = row<TradeOffer | undefined>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(req.params.id));
  if (!o) { res.status(404).json({ error: 'Trade not found.' }); return; }
  const err = transitionGuard(o, req.user, ['accepted', 'meetup'], 'either');
  if (err) { res.status(err.status).json({ error: err.error }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const locationName = typeof body.location_name === 'string' ? body.location_name.trim() : '';
  const meetDate = typeof body.meet_date === 'string' ? body.meet_date : '';
  const meetTime = typeof body.meet_time === 'string' ? body.meet_time : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 300) : '';
  if (locationName.length < 3) { res.status(400).json({ error: 'Choose a meetup location (a public place is safest).' }); return; }
  if (!meetDate) { res.status(400).json({ error: 'Pick a date.' }); return; }
  const lat = typeof body.latitude === 'number' && Number.isFinite(body.latitude) ? body.latitude : null;
  const lng = typeof body.longitude === 'number' && Number.isFinite(body.longitude) ? body.longitude : null;

  const d = getDb();
  const existing = row<Meetup | undefined>(
    d.prepare('SELECT * FROM meetups WHERE trade_id = ? ORDER BY created_at DESC LIMIT 1').get(o.id)
  );
  if (existing) {
    d.prepare(`
      UPDATE meetups SET location_name = ?, latitude = ?, longitude = ?, meet_date = ?, meet_time = ?, notes = ?,
        status = 'proposed', from_confirmed = 0, to_confirmed = 0, created_by = ?, created_at = ?
      WHERE id = ?
    `).run(locationName, lat, lng, meetDate, meetTime, notes, req.user.id, now(), existing.id);
  } else {
    d.prepare(`
      INSERT INTO meetups (id, trade_id, created_by, location_name, latitude, longitude, meet_date, meet_time, notes, status, from_confirmed, to_confirmed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', 0, 0, ?)
    `).run(uid(), o.id, req.user.id, locationName, lat, lng, meetDate, meetTime, notes, now());
  }
  if (o.status !== 'meetup') {
    d.prepare("UPDATE trade_offers SET status = 'meetup' WHERE id = ?").run(o.id);
  }
  const other = o.from_user_id === req.user.id ? o.to_user_id : o.from_user_id;
  notify(other, 'meetup_proposed', 'Exchange proposed',
    `${req.user.display_name} proposed a meetup: ${locationName} on ${meetDate}${meetTime ? ' at ' + meetTime : ''}. Please confirm.`,
    { trade_id: o.id });
  res.json(tradeDetail(row<TradeOffer>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(o.id)), req.user));
});

tradesRouter.post('/offers/:id/meetup/confirm', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const o = row<TradeOffer | undefined>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(req.params.id));
  if (!o) { res.status(404).json({ error: 'Trade not found.' }); return; }
  const err = transitionGuard(o, req.user, ['accepted', 'meetup'], 'either');
  if (err) { res.status(err.status).json({ error: err.error }); return; }
  const m = row<Meetup | undefined>(
    getDb().prepare('SELECT * FROM meetups WHERE trade_id = ? ORDER BY created_at DESC LIMIT 1').get(o.id)
  );
  if (!m) { res.status(400).json({ error: 'No meetup has been proposed yet.' }); return; }
  if (m.status === 'cancelled') { res.status(409).json({ error: 'This meetup was cancelled. Propose a new one.' }); return; }

  const mine = o.from_user_id === req.user.id;
  if (mine && m.from_confirmed === 1) { res.status(409).json({ error: 'You already confirmed this meetup.' }); return; }
  if (!mine && m.to_confirmed === 1) { res.status(409).json({ error: 'You already confirmed this meetup.' }); return; }

  const d = getDb();
  if (mine) d.prepare('UPDATE meetups SET from_confirmed = 1 WHERE id = ?').run(m.id);
  else d.prepare('UPDATE meetups SET to_confirmed = 1 WHERE id = ?').run(m.id);

  const updated = row<Meetup>(d.prepare('SELECT * FROM meetups WHERE id = ?').get(m.id));
  const other = o.from_user_id === req.user.id ? o.to_user_id : o.from_user_id;
  if (updated.from_confirmed === 1 && updated.to_confirmed === 1) {
    d.prepare("UPDATE meetups SET status = 'confirmed' WHERE id = ?").run(m.id);
    notify(other, 'meetup_confirmed', 'Meetup confirmed',
      `${req.user.display_name} confirmed the exchange at ${m.location_name}. See you there!`, { trade_id: o.id });
    track(o.from_user_id, 'meetup_confirmed', { trade_id: o.id });
  } else {
    notify(other, 'meetup_confirmed', 'Meetup confirmed by one side',
      `${req.user.display_name} confirmed the meetup. Waiting for your confirmation.`, { trade_id: o.id });
  }
  res.json(tradeDetail(row<TradeOffer>(d.prepare('SELECT * FROM trade_offers WHERE id = ?').get(o.id)), req.user));
});

tradesRouter.post('/offers/:id/meetup/cancel', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const o = row<TradeOffer | undefined>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(req.params.id));
  if (!o) { res.status(404).json({ error: 'Trade not found.' }); return; }
  const err = transitionGuard(o, req.user, ['accepted', 'meetup'], 'either');
  if (err) { res.status(err.status).json({ error: err.error }); return; }
  const m = row<Meetup | undefined>(
    getDb().prepare('SELECT * FROM meetups WHERE trade_id = ? ORDER BY created_at DESC LIMIT 1').get(o.id)
  );
  if (m) {
    getDb().prepare("UPDATE meetups SET status = 'cancelled' WHERE id = ?").run(m.id);
    getDb().prepare("UPDATE trade_offers SET status = 'accepted' WHERE id = ? AND status = 'meetup'").run(o.id);
  }
  res.json(tradeDetail(row<TradeOffer>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(o.id)), req.user));
});

// ---- Exchange confirmation (both parties) ----------------------

tradesRouter.post('/offers/:id/exchange/confirm', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const o = row<TradeOffer | undefined>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(req.params.id));
  if (!o) { res.status(404).json({ error: 'Trade not found.' }); return; }
  const err = transitionGuard(o, req.user, ['meetup'], 'either');
  if (err) {
    if (err.status === 403) { res.status(403).json({ error: err.error }); return; }
    res.status(409).json({ error: 'Confirm the exchange arrangement first — the trade must be in the exchange stage.' });
    return;
  }
  const meetupRow = row<Meetup | undefined>(
    getDb().prepare('SELECT * FROM meetups WHERE trade_id = ? ORDER BY created_at DESC LIMIT 1').get(o.id)
  );
  if (!meetupRow || meetupRow.status !== 'confirmed') {
    res.status(409).json({ error: 'Both sides must confirm the meetup before the exchange can be completed.' });
    return;
  }
  const mine = o.from_user_id === req.user.id;
  const myFlag = mine ? 'from_exchange_confirmed' : 'to_exchange_confirmed';
  if ((mine && o.from_exchange_confirmed === 1) || (!mine && o.to_exchange_confirmed === 1)) {
    res.status(409).json({ error: 'You already confirmed this exchange.' }); return;
  }
  const d = getDb();
  d.prepare(`UPDATE trade_offers SET ${myFlag} = 1 WHERE id = ?`).run(o.id);
  const updated = row<TradeOffer>(d.prepare('SELECT * FROM trade_offers WHERE id = ?').get(o.id));
  const otherId = mine ? o.to_user_id : o.from_user_id;
  if (updated.from_exchange_confirmed === 1 && updated.to_exchange_confirmed === 1) {
    d.prepare("UPDATE trade_offers SET status = 'completed', completed_at = ? WHERE id = ?").run(now(), o.id);
    d.prepare("UPDATE items SET status = 'traded', updated_at = ? WHERE id IN (?, ?)")
      .run(now(), o.offered_item_id, o.requested_item_id);
    refreshUserStats(o.from_user_id);
    refreshUserStats(o.to_user_id);
    notify(otherId, 'trade_completed', 'Trade completed',
      `${req.user.display_name} confirmed the exchange — your trade is complete. Rate each other!`,
      { trade_id: o.id });
    notify(mine ? o.to_user_id : o.from_user_id, 'rating_request', 'Rate your recent trade',
      'Your trade is complete. Take a moment to rate the experience.', { trade_id: o.id });
    track(o.from_user_id, 'trade_completed', { trade_id: o.id });
    track(o.to_user_id, 'trade_completed', { trade_id: o.id });
  } else {
    notify(otherId, 'exchange_confirm', 'Exchange confirmed by one side',
      `${req.user.display_name} confirmed the exchange. Confirm it on your side to complete the trade.`,
      { trade_id: o.id });
  }
  res.json(tradeDetail(row<TradeOffer>(d.prepare('SELECT * FROM trade_offers WHERE id = ?').get(o.id)), req.user));
});

// ---- Ratings ---------------------------------------------------

tradesRouter.post('/offers/:id/rate', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const o = row<TradeOffer | undefined>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(req.params.id));
  if (!o) { res.status(404).json({ error: 'Trade not found.' }); return; }
  if (!isParticipant(o, req.user.id)) {
    res.status(403).json({ error: 'You are not part of this trade.' }); return;
  }
  if (o.status !== 'completed') {
    res.status(409).json({ error: 'Ratings are only possible after a completed trade.' }); return;
  }
  const existing = row<{ id: string } | undefined>(
    getDb().prepare('SELECT id FROM ratings WHERE trade_id = ? AND rater_id = ?').get(o.id, req.user.id)
  );
  if (existing) { res.status(409).json({ error: 'You already rated this trade.' }); return; }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const ints = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5 ? v : -1);
  const reliability = ints(b.reliability);
  const communication = ints(b.communication);
  const itemAccuracy = ints(b.item_accuracy);
  const overall = ints(b.overall);
  if (reliability < 0 || communication < 0 || itemAccuracy < 0 || overall < 0) {
    res.status(400).json({ error: 'All ratings must be between 1 and 5 stars.' }); return;
  }
  const comment = typeof b.comment === 'string' ? b.comment.trim().slice(0, 400) : '';
  const rateeId = o.from_user_id === req.user.id ? o.to_user_id : o.from_user_id;

  getDb().prepare(`
    INSERT INTO ratings (id, trade_id, rater_id, ratee_id, reliability, communication, item_accuracy, overall, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uid(), o.id, req.user.id, rateeId, reliability, communication, itemAccuracy, overall, comment, now());
  refreshUserStats(rateeId);
  notify(rateeId, 'system', 'You received a rating',
    `${req.user.display_name} rated your recent trade (${overall}/5).`, { trade_id: o.id });
  res.json(tradeDetail(row<TradeOffer>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(o.id)), req.user));
});

// ---- Messaging -------------------------------------------------

tradesRouter.get('/offers/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const o = row<TradeOffer | undefined>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(req.params.id));
  if (!o || !canView(o, req.user)) { res.status(403).json({ error: 'You do not have access to this trade.' }); return; }
  const messages = rows<Message>(
    getDb().prepare('SELECT * FROM messages WHERE trade_id = ? ORDER BY created_at ASC').all(o.id)
  );
  res.json({ messages });
});

tradesRouter.post('/offers/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const o = row<TradeOffer | undefined>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(req.params.id));
  if (!o || !canView(o, req.user)) { res.status(403).json({ error: 'You do not have access to this trade.' }); return; }
  if (o.status === 'cancelled' || o.status === 'declined' || o.status === 'completed') {
    res.status(409).json({ error: 'This trade is finished — messaging is closed.' }); return;
  }
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (body.length < 1 || body.length > 2000) {
    res.status(400).json({ error: 'Message must be 1–2000 characters.' }); return;
  }
  const other = o.from_user_id === req.user.id ? o.to_user_id : o.from_user_id;
  if (isBlocked(other, req.user.id)) {
    res.status(403).json({ error: 'You cannot message this user.' }); return;
  }
  const id = uid();
  getDb().prepare(
    'INSERT INTO messages (id, trade_id, sender_id, body, read, created_at) VALUES (?, ?, ?, ?, 1, ?)'
  ).run(id, o.id, req.user.id, body, now());
  notify(other, 'new_message', 'New message',
    `${req.user.display_name}: "${body.slice(0, 90)}${body.length > 90 ? '…' : ''}"`, { trade_id: o.id });
  track(req.user.id, 'message_sent', { trade_id: o.id });
  const m = row<Message>(getDb().prepare('SELECT * FROM messages WHERE id = ?').get(id));
  res.status(201).json({ message: m });
});

tradesRouter.post('/offers/:id/messages/read', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const o = row<TradeOffer | undefined>(getDb().prepare('SELECT * FROM trade_offers WHERE id = ?').get(req.params.id));
  if (!o || !canView(o, req.user)) { res.status(403).json({ error: 'You do not have access to this trade.' }); return; }
  getDb().prepare('UPDATE messages SET read = 1 WHERE trade_id = ? AND sender_id != ?').run(o.id, req.user.id);
  res.json({ ok: true });
});

// ---- Blocking --------------------------------------------------

tradesRouter.post('/users/:id/block', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const target = req.params.id;
  if (target === req.user.id) { res.status(400).json({ error: 'You cannot block yourself.' }); return; }
  getDb().prepare('INSERT OR IGNORE INTO user_blocks (user_id, blocked_user_id, created_at) VALUES (?, ?, ?)')
    .run(req.user.id, target, now());
  res.json({ ok: true });
});

tradesRouter.post('/users/:id/unblock', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  getDb().prepare('DELETE FROM user_blocks WHERE user_id = ? AND blocked_user_id = ?').run(req.user.id, req.params.id);
  res.json({ ok: true });
});

tradesRouter.get('/users/:id/blocked', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user) return;
  const blocked = rows<{ blocked_user_id: string }>(
    getDb().prepare('SELECT blocked_user_id FROM user_blocks WHERE user_id = ?').all(req.user.id)
  );
  res.json({ blocked: blocked.map((b) => b.blocked_user_id) });
});

