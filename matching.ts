// =============================================================
// BADEL smart matching — deterministic, explainable scoring.
//
// No AI is claimed. A score is derived from:
//   • what the viewer owns   vs  what the item owner wants   (A)
//   • what the viewer wants  vs  what the item owner offers  (B)
//   • category alignment, distance, condition, value overlap
//
// A PERFECT MATCH requires both directions (A and B) to match
// with a high score — the classic two-way barter fit.
// =============================================================

import type { Category, Item, ItemWithDetails, User, WantedItem } from '../shared/types.js';

export interface MatchBreakdown {
  score: number;
  perfect: boolean;
  reasons: string[];
}

const KEYWORD_STOPWORDS = new Set([
  'a', 'an', 'the', 'for', 'and', 'or', 'with', 'my', 'your', 'new', 'like', 'good', 'want', 'looking',
  'any', 'in', 'of', 'to', 'on', 'i', '13', 's23', 'samsung', '256gb', '128gb',
]);

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]+/g, ' ');
}

function keywords(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of norm(s).split(/\s+/)) {
    const t = w.trim();
    if (t.length < 3 || KEYWORD_STOPWORDS.has(t)) continue;
    out.add(t);
  }
  return out;
}

function wordsMatch(a: string, b: string): boolean {
  const ka = keywords(a);
  const kb = keywords(b);
  if (ka.size === 0 || kb.size === 0) return false;
  for (const w of ka) if (kb.has(w)) return true;
  return false;
}

export function haversineKm(
  lat1: number | null, lng1: number | null, lat2: number | null, lng2: number | null
): number | null {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

export interface MatchContext {
  viewer: User;
  viewerWants: WantedItem[];   // everything the viewer wants (union across their listings)
  viewerItems: Item[];         // the viewer's active items
  categories: Map<string, Category>;
}

const VALUE_TOLERANCE = 0.35; // values within ±35% count as "similar"

export function matchItem(
  ctx: MatchContext,
  item: Item,
  ownerWantsForItem: WantedItem[]
): MatchBreakdown {
  const { viewer, viewerWants, viewerItems, categories } = ctx;
  const reasons: string[] = [];
  const cat = categories.get(item.category_id);

  // ---- Direction A: what the viewer owns ↔ what the owner wants
  let hasFit = false;
  let aScore = 0;
  for (const mine of viewerItems) {
    const mineCat = categories.get(mine.category_id);
    if (ownerWantsForItem.some((w) => w.wanted_category_id === mine.category_id)) {
      hasFit = true;
      aScore = Math.max(aScore, 34);
      if (!reasons.includes(`You own ${mineCat?.name ?? 'something'} the owner wants`)) {
        reasons.push(`You own ${mineCat?.name ?? 'something'} the owner wants`);
      }
    }
    const want = ownerWantsForItem.find((w) => wordsMatch(w.wanted_keywords, mine.title));
    if (want) {
      hasFit = true;
      aScore = Math.max(aScore, 40);
      reasons.push(`Your "${mine.title}" matches what the owner wants${want.wanted_keywords ? ` (${want.wanted_keywords})` : ''}`);
    }
  }

  // ---- Direction B: what the viewer wants ↔ this item
  let wantsFit = false;
  let bScore = 0;
  if (viewerWants.some((w) => w.wanted_category_id === item.category_id)) {
    wantsFit = true;
    bScore = Math.max(bScore, 30);
    reasons.push(`You want ${cat?.name ?? 'this category'}`);
  }
  if (viewerWants.some((w) => wordsMatch(w.wanted_keywords, item.title))) {
    wantsFit = true;
    bScore = Math.max(bScore, 36);
    reasons.push(`You want something like "${item.title}"`);
  }

  // ---- Distance
  const d = haversineKm(viewer.latitude, viewer.longitude, item.latitude, item.longitude);
  let dScore = 0;
  if (d != null) {
    if (d <= 5) { dScore = 14; reasons.push(`${d} km away — very close`); }
    else if (d <= 15) { dScore = 10; }
    else if (d <= 30) { dScore = 6; }
    else if (d <= 60) { dScore = 3; }
  }

  // ---- Condition
  let cScore = 0;
  if (['new', 'like_new', 'good'].includes(item.condition)) cScore = 5;

  // ---- Value overlap with the best candidate of viewer's items
  let vScore = 0;
  if (item.value_min != null && item.value_max != null) {
    for (const mine of viewerItems) {
      if (mine.value_min != null && mine.value_max != null) {
        const lo = Math.max(item.value_min, mine.value_min);
        const hi = Math.min(item.value_max, mine.value_max);
        if (lo <= hi) { vScore = 10; break; }
        const itemMid = (item.value_min + item.value_max) / 2;
        const mineMid = (mine.value_min + mine.value_max) / 2;
        if (itemMid > 0 && Math.abs(itemMid - mineMid) / itemMid <= VALUE_TOLERANCE) { vScore = 7; break; }
      }
    }
  }

  const base = hasFit || wantsFit ? 18 : 0; // being relevant at all
  const score = Math.min(100, Math.round(base + aScore + bScore + dScore + cScore + vScore));
  const perfect = hasFit && wantsFit && score >= 80;

  return { score, perfect, reasons };
}

export function scoreLabel(score: number): string {
  if (score >= 90) return '🔥 PERFECT MATCH';
  if (score >= 70) return 'Strong match';
  if (score >= 45) return 'Good match';
  if (score >= 25) return 'Possible';
  return 'Low match';
}
