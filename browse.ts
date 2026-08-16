// =============================================================
// Browse API — home feed sections and search.
//
// Filtering happens in SQL on the server (category, condition,
// status, text, value, distance window). The browser never
// downloads the whole catalog. Distance + match scoring run
// server-side too.
// =============================================================

import { Router } from 'express';
import { getDb, rows, type SQLValue } from '../db.js';
import { AuthedRequest } from '../auth.js';
import { enrichItems, getCategoryMap, buildMatchContext } from '../items-view.js';
import { haversineKm, matchItem } from '../matching.js';
import type { Category, HomeFeed, Item, Paginated, SearchFilters, WantedItem } from '../../shared/types.js';

export const browseRouter = Router();

function activeItems(): Item[] {
  return rows<Item>(getDb().prepare("SELECT * FROM items WHERE status = 'active'").all());
}

// ---- Categories ------------------------------------------------

browseRouter.get('/categories', (_req, res) => {
  const cats = rows<Category>(getDb().prepare('SELECT * FROM categories ORDER BY sort_order').all());
  res.json({ categories: cats });
});

// ---- Home feed -------------------------------------------------

browseRouter.get('/home', (req: AuthedRequest, res) => {
  const viewer = req.user ?? null;
  const all = activeItems();
  const categories = getCategoryMap();
  const enriched = enrichItems(all, viewer, { withMatch: !!viewer });
  const sections: HomeFeed['sections'] = [];
  const viewerLat = viewer?.latitude ?? null;
  const viewerLng = viewer?.longitude ?? null;

  const wantedByItem = new Map<string, WantedItem[]>();
  for (const w of rows<WantedItem>(getDb().prepare('SELECT * FROM wanted_items').all())) {
    if (!wantedByItem.has(w.item_id)) wantedByItem.set(w.item_id, []);
    wantedByItem.get(w.item_id)!.push(w);
  }

  if (viewer) {
    const ctx = buildMatchContext(viewer, categories);
    const ranked = all
      .map((it) => ({ it, m: matchItem(ctx.ctx, it, wantedByItem.get(it.id) ?? []) }))
      .filter((r) => r.m.score >= 30)
      .sort((a, b) => b.m.score - a.m.score)
      .slice(0, 12);
    const perfect = ranked.filter((r) => r.m.perfect);
    if (perfect.length >= 2) {
      sections.push({
        key: 'matches',
        title: '🔥 Potential matches',
        subtitle: 'High-confidence barter fits for you',
        items: enriched.filter((e) => perfect.some((p) => p.it.id === e.id)),
      });
    } else if (ranked.length >= 2) {
      sections.push({
        key: 'recommended',
        title: 'Recommended for you',
        subtitle: 'Based on what you want',
        items: enriched.filter((e) => ranked.some((r) => r.it.id === e.id)),
      });
    }
  }

  // Nearby (only when viewer has a location, or show nation-wide picks otherwise)
  const nearby = enriched
    .filter((e) => e.owner_id !== viewer?.id)
    .sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity))
    .slice(0, 12);
  sections.push({
    key: 'nearby',
    title: viewerLat != null ? 'Near you' : 'Across Tunisia',
    subtitle: viewerLat != null ? 'Sorted by distance' : 'From Megrine to Sousse',
    items: nearby,
  });

  // New listings
  const fresh = enriched
    .filter((e) => e.owner_id !== viewer?.id)
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 12);
  sections.push({
    key: 'new',
    title: 'New listings',
    subtitle: 'Freshly added to Badel',
    items: fresh,
  });

  res.json({ sections } satisfies HomeFeed);
});

// ---- Search ----------------------------------------------------

browseRouter.get('/items', (req: AuthedRequest, res) => {
  const viewer = req.user ?? null;
  const f: SearchFilters = {
    q: typeof req.query.q === 'string' ? req.query.q.trim() : undefined,
    category_id: typeof req.query.category_id === 'string' ? req.query.category_id : undefined,
    conditions: (typeof req.query.conditions === 'string' ? req.query.conditions.split(',') : undefined) as SearchFilters['conditions'],
    max_distance_km: req.query.max_distance_km ? Number(req.query.max_distance_km) : undefined,
    sort: (req.query.sort as SearchFilters['sort']) || 'newest',
    min_value: req.query.min_value ? Number(req.query.min_value) : undefined,
    max_value: req.query.max_value ? Number(req.query.max_value) : undefined,
    page: req.query.page ? Math.max(1, Number(req.query.page)) : 1,
    per_page: req.query.per_page ? Math.min(60, Math.max(1, Number(req.query.per_page))) : 20,
  };

  // ---- Server-side SQL filtering (never client-side) ----------
  const where: string[] = ["status = 'active'"];
  const params: SQLValue[] = [];
  if (f.category_id) { where.push('category_id = ?'); params.push(f.category_id); }
  if (f.conditions && f.conditions.length > 0) {
    where.push(`condition IN (${f.conditions.map(() => '?').join(',')})`);
    params.push(...f.conditions);
  }
  if (f.min_value != null) { where.push('value_max IS NULL OR value_max >= ?'); params.push(f.min_value); }
  if (f.max_value != null) { where.push('value_min IS NULL OR value_min <= ?'); params.push(f.max_value); }
  if (f.q) {
    where.push('(title LIKE ? OR description LIKE ?)');
    const like = `%${f.q}%`;
    params.push(like, like);
  }
  const items = rows<Item>(
    getDb().prepare(`SELECT * FROM items WHERE ${where.join(' AND ')}`).all(...params)
  );

  // ---- Distance window + sort (server-side) -------------------
  let candidates = items.filter((i) => i.owner_id !== viewer?.id);
  if (f.max_distance_km != null && viewer?.latitude != null) {
    candidates = candidates.filter((i) => {
      const d = haversineKm(viewer.latitude, viewer.longitude, i.latitude, i.longitude);
      return d != null && d <= f.max_distance_km!;
    });
  }

  // Match scores are computed for signed-in viewers on every result set
  const enriched = enrichItems(candidates, viewer, { withMatch: !!viewer });
  let sorted = enriched;
  if (f.sort === 'newest') sorted = [...enriched].sort((a, b) => b.created_at - a.created_at);
  else if (f.sort === 'closest') sorted = [...enriched].sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
  else if (f.sort === 'recommended') sorted = [...enriched].sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1));

  const total = sorted.length;
  const start = (f.page! - 1) * f.per_page!;
  const pageItems = sorted.slice(start, start + f.per_page!);
  const paginated: Paginated<typeof pageItems[number]> = { items: pageItems, total, page: f.page!, per_page: f.per_page! };
  res.json(paginated);
});
