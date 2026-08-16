// =============================================================
// Item view assembly — batched enrichment (photos, wants, owner,
// distance, match score) so the API never does N+1 requests.
// =============================================================

import { getDb, rows, row } from './db.js';
import type { Category, Item, ItemPhoto, ItemWithDetails, PublicUser, User, WantedItem } from '../shared/types.js';
import { publicUser } from './users-view.js';
import { haversineKm, matchItem, type MatchBreakdown } from './matching.js';

export function getCategoryMap(): Map<string, Category> {
  const m = new Map<string, Category>();
  for (const c of rows<Category>(getDb().prepare('SELECT * FROM categories ORDER BY sort_order').all())) {
    m.set(c.id, c);
  }
  return m;
}

export function getCategoryBySlug(slug: string): Category | null {
  const c = row<Category | undefined>(getDb().prepare('SELECT * FROM categories WHERE slug = ?').get(slug));
  return c ?? null;
}

export function activeOfferCountForItem(itemId: string): number {
  const r = row<{ c: number }>(
    getDb().prepare(
      `SELECT COUNT(*) AS c FROM trade_offers WHERE requested_item_id = ? AND status IN ('pending','accepted','meetup')`
    ).get(itemId)
  );
  return r?.c ?? 0;
}

export function loadActiveOffersForItems(itemIds: string[]): Map<string, number> {
  const m = new Map<string, number>();
  if (itemIds.length === 0) return m;
  const q = `SELECT requested_item_id, COUNT(*) AS c FROM trade_offers
             WHERE requested_item_id IN (${itemIds.map(() => '?').join(',')})
               AND status IN ('pending','accepted','meetup')
             GROUP BY requested_item_id`;
  for (const r of rows<{ requested_item_id: string; c: number }>(getDb().prepare(q).all(...itemIds))) {
    m.set(r.requested_item_id, r.c);
  }
  return m;
}

export interface EnrichOptions {
  withMatch?: boolean;
}

export function enrichItems(items: Item[], viewer: User | null, opts: EnrichOptions = {}): ItemWithDetails[] {
  if (items.length === 0) return [];
  const d = getDb();
  const ids = items.map((i) => i.id);
  const q = (ids: string[]) => `${ids.map(() => '?').join(',')}`;

  // Batched lookups
  const photosByItem = new Map<string, ItemPhoto[]>();
  for (const p of rows<ItemPhoto>(
    d.prepare(`SELECT * FROM item_photos WHERE item_id IN (${q(ids)}) ORDER BY sort_order`).all(...ids)
  )) {
    if (!photosByItem.has(p.item_id)) photosByItem.set(p.item_id, []);
    photosByItem.get(p.item_id)!.push(p);
  }

  const wantsByItem = new Map<string, WantedItem[]>();
  for (const w of rows<WantedItem>(
    d.prepare(`SELECT * FROM wanted_items WHERE item_id IN (${q(ids)})`).all(...ids)
  )) {
    if (!wantsByItem.has(w.item_id)) wantsByItem.set(w.item_id, []);
    wantsByItem.get(w.item_id)!.push(w);
  }

  const owners = new Map<string, PublicUser>();
  const ownerIds = [...new Set(items.map((i) => i.owner_id))];
  for (const u of rows<User>(
    d.prepare(`SELECT * FROM users WHERE id IN (${q(ownerIds)})`).all(...ownerIds)
  )) {
    owners.set(u.id, publicUser(u));
  }

  const categories = getCategoryMap();

  const favIds = new Set<string>();
  if (viewer) {
    for (const f of rows<{ item_id: string }>(
      d.prepare(`SELECT item_id FROM favorites WHERE user_id = ? AND item_id IN (${q(ids)})`).all(viewer.id, ...ids)
    )) {
      favIds.add(f.item_id);
    }
  }

  const activeOffers = loadActiveOffersForItems(ids);

  // Match context for the viewer
  let matchCtx: ReturnType<typeof buildMatchContext> | null = null;
  if (viewer && opts.withMatch) {
    matchCtx = buildMatchContext(viewer, categories);
  }

  return items.map((it) => {
    const photos = photosByItem.get(it.id) ?? [];
    const wanted = wantsByItem.get(it.id) ?? [];
    const owner = owners.get(it.owner_id);
    let match: MatchBreakdown | null = null;
    if (matchCtx) {
      match = matchItem(matchCtx.ctx, it, wanted);
    }
    const dist = haversineKm(viewer?.latitude ?? null, viewer?.longitude ?? null, it.latitude, it.longitude);
    return {
      ...it,
      owner: owner ?? ({} as PublicUser),
      photos,
      wanted,
      category: categories.get(it.category_id) ?? { id: it.category_id, slug: 'other', name: 'Other', icon: '📦', sort_order: 99 },
      distance_km: dist,
      match_score: match?.score ?? null,
      match_perfect: match?.perfect ?? false,
      match_reasons: match?.reasons ?? [],
      is_favorite: favIds.has(it.id),
      active_offer_count: activeOffers.get(it.id) ?? 0,
    };
  });
}

export function buildMatchContext(viewer: User, categories: Map<string, Category>) {
  const d = getDb();
  const viewerWants = rows<WantedItem>(
    d.prepare('SELECT * FROM wanted_items WHERE user_id = ?').all(viewer.id)
  );
  const viewerItems = rows<Item>(
    d.prepare(`SELECT * FROM items WHERE owner_id = ? AND status = 'active'`).all(viewer.id)
  );
  const ctx = { viewer, viewerWants, viewerItems, categories };
  return { ctx };
}

export function getItemDetail(itemId: string, viewer: User | null): ItemWithDetails | null {
  const it = row<Item | undefined>(getDb().prepare('SELECT * FROM items WHERE id = ?').get(itemId));
  if (!it) return null;
  const [enriched] = enrichItems([it], viewer, { withMatch: !!viewer });
  return enriched;
}

export function isOwnedBy(itemId: string, userId: string): boolean {
  const r = row<{ owner_id: string } | undefined>(
    getDb().prepare('SELECT owner_id FROM items WHERE id = ?').get(itemId)
  );
  return !!r && r.owner_id === userId;
}
