// =============================================================
// BADEL server — data layer
//
// The demo backend uses a real relational store (SQLite via the
// built-in node:sqlite module) with the SAME schema, constraints
// and indexes as the production PostgreSQL schema shipped in
// /supabase/schema.sql. All access goes through the helpers below,
// so the store can be swapped for Supabase without touching routes.
// =============================================================

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dirname, 'data');
export const UPLOAD_DIR = join(DATA_DIR, 'uploads');

let db: DatabaseSync | null = null;

export type SQLValue = string | number | bigint | Uint8Array | null;

export function uid(): string {
  return randomUUID();
}

export function now(): number {
  return Date.now();
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('Database not initialised');
  return db;
}

// Row mapping — node:sqlite returns null-prototype objects.
export function row<T>(r: unknown): T {
  return r as T;
}

export function rows<T>(r: unknown[]): T[] {
  return (r ?? []) as T[];
}

export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed/.test(e.message);
}

// ---------------------------------------------------------------
// Schema
// ---------------------------------------------------------------

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id                 TEXT PRIMARY KEY,
  username           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name       TEXT NOT NULL,
  email              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash      TEXT NOT NULL,
  avatar_url         TEXT,
  bio                TEXT NOT NULL DEFAULT '',
  location           TEXT NOT NULL DEFAULT '',
  latitude           REAL,
  longitude          REAL,
  rating             REAL,
  rating_count       INTEGER NOT NULL DEFAULT 0,
  completed_trades   INTEGER NOT NULL DEFAULT 0,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  membership_status  TEXT NOT NULL DEFAULT 'free',
  role               TEXT NOT NULL DEFAULT 'user',
  onboarded          INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_location ON users(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating DESC);

CREATE TABLE IF NOT EXISTS user_blocks (
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at     INTEGER NOT NULL,
  PRIMARY KEY (user_id, blocked_user_id)
);

CREATE TABLE IF NOT EXISTS items (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  category_id    TEXT NOT NULL REFERENCES categories(id),
  condition      TEXT NOT NULL DEFAULT 'good',
  status         TEXT NOT NULL DEFAULT 'active',
  location       TEXT NOT NULL DEFAULT '',
  latitude       REAL,
  longitude      REAL,
  value_min      INTEGER,
  value_max      INTEGER,
  value_currency TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_owner ON items(owner_id);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_created ON items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_location ON items(latitude, longitude);

CREATE TABLE IF NOT EXISTS item_photos (
  id           TEXT PRIMARY KEY,
  item_id      TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  thumb_path   TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_item ON item_photos(item_id, sort_order);

CREATE TABLE IF NOT EXISTS wanted_items (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id            TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  wanted_category_id TEXT REFERENCES categories(id),
  wanted_keywords    TEXT NOT NULL DEFAULT '',
  created_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wanted_item ON wanted_items(item_id);
CREATE INDEX IF NOT EXISTS idx_wanted_user ON wanted_items(user_id);

CREATE TABLE IF NOT EXISTS trade_offers (
  id                    TEXT PRIMARY KEY,
  from_user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offered_item_id       TEXT NOT NULL REFERENCES items(id),
  requested_item_id     TEXT NOT NULL REFERENCES items(id),
  message               TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'pending',
  created_at            INTEGER NOT NULL,
  accepted_at           INTEGER,
  completed_at          INTEGER,
  from_exchange_confirmed INTEGER NOT NULL DEFAULT 0,
  to_exchange_confirmed   INTEGER NOT NULL DEFAULT 0,
  cancelled_by          TEXT REFERENCES users(id),
  dispute_reason        TEXT
);
CREATE INDEX IF NOT EXISTS idx_offers_from ON trade_offers(from_user_id, status);
CREATE INDEX IF NOT EXISTS idx_offers_to ON trade_offers(to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_offers_item ON trade_offers(offered_item_id);
CREATE INDEX IF NOT EXISTS idx_offers_requested ON trade_offers(requested_item_id);
-- Backstop against duplicate active offers between the same pair of items
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_item_pair
  ON trade_offers(offered_item_id, requested_item_id)
  WHERE status IN ('pending','accepted','meetup');

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  trade_id   TEXT NOT NULL REFERENCES trade_offers(id) ON DELETE CASCADE,
  sender_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_trade ON messages(trade_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(trade_id, read);

CREATE TABLE IF NOT EXISTS meetups (
  id            TEXT PRIMARY KEY,
  trade_id      TEXT NOT NULL REFERENCES trade_offers(id) ON DELETE CASCADE,
  created_by    TEXT NOT NULL REFERENCES users(id),
  location_name TEXT NOT NULL,
  latitude      REAL,
  longitude     REAL,
  meet_date     TEXT,
  meet_time     TEXT,
  notes         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'proposed',
  from_confirmed INTEGER NOT NULL DEFAULT 0,
  to_confirmed    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meetups_trade ON meetups(trade_id);

CREATE TABLE IF NOT EXISTS ratings (
  id             TEXT PRIMARY KEY,
  trade_id       TEXT NOT NULL REFERENCES trade_offers(id) ON DELETE CASCADE,
  rater_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ratee_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reliability    INTEGER NOT NULL CHECK (reliability BETWEEN 1 AND 5),
  communication  INTEGER NOT NULL CHECK (communication BETWEEN 1 AND 5),
  item_accuracy  INTEGER NOT NULL CHECK (item_accuracy BETWEEN 1 AND 5),
  overall        INTEGER NOT NULL CHECK (overall BETWEEN 1 AND 5),
  comment        TEXT NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL,
  UNIQUE (trade_id, rater_id)
);
CREATE INDEX IF NOT EXISTS idx_ratings_ratee ON ratings(ratee_id);

CREATE TABLE IF NOT EXISTS favorites (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  data       TEXT,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id               TEXT PRIMARY KEY,
  reporter_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  item_id          TEXT REFERENCES items(id) ON DELETE SET NULL,
  trade_id         TEXT REFERENCES trade_offers(id) ON DELETE SET NULL,
  reason           TEXT NOT NULL,
  details          TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'open',
  admin_notes      TEXT,
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS email_codes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  purpose    TEXT NOT NULL, -- 'verify' | 'reset'
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id  TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS payments (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,
  method      TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'TND',
  reference   TEXT NOT NULL,
  status      TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  name       TEXT NOT NULL,
  data       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_name_time ON analytics_events(name, created_at);
CREATE INDEX IF NOT EXISTS idx_events_time ON analytics_events(created_at);
`;

// ---------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------

export const CATEGORIES: Array<[string, string, string]> = [
  ['phones', 'Phones & Tablets', '📱'],
  ['gaming', 'Gaming', '🎮'],
  ['computers', 'Computers & Laptops', '💻'],
  ['cameras', 'Cameras & Photo', '📷'],
  ['audio', 'Audio & Headphones', '🎧'],
  ['television', 'TV & Home Cinema', '📺'],
  ['bicycles', 'Bicycles & Scooters', '🚲'],
  ['furniture', 'Furniture', '🪑'],
  ['appliances', 'Home Appliances', '🔌'],
  ['fashion', 'Fashion & Accessories', '🧥'],
  ['watches', 'Watches & Jewellery', '⌚'],
  ['books', 'Books & Media', '📚'],
  ['instruments', 'Instruments', '🎸'],
  ['sports', 'Sports & Outdoors', '⚽'],
  ['toys', 'Toys & Kids', '🧸'],
  ['tools', 'Tools & DIY', '🛠️'],
  ['other', 'Other', '📦'],
];

export const CONDITIONS: Record<string, string> = {
  new: 'New',
  like_new: 'Like new',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

// Tunisian locations (fictional demo data)
const LOC = {
  tunis: { name: 'Tunis', lat: 36.8065, lng: 10.1815 },
  megrine: { name: 'Megrine', lat: 36.7672, lng: 10.2292 },
  benarous: { name: 'Ben Arous', lat: 36.7536, lng: 10.2224 },
  lamarsa: { name: 'La Marsa', lat: 36.8772, lng: 10.3256 },
  ariana: { name: 'Ariana', lat: 36.8625, lng: 10.1955 },
  carthage: { name: 'Carthage', lat: 36.8616, lng: 10.3305 },
  manouba: { name: 'Manouba', lat: 36.8075, lng: 10.0931 },
  rades: { name: 'Radès', lat: 36.7693, lng: 10.2746 },
  ezzahra: { name: 'Ezzahra', lat: 36.7515, lng: 10.2509 },
  hammamet: { name: 'Hammamet', lat: 36.4043, lng: 10.5058 },
  nabeul: { name: 'Nabeul', lat: 36.4563, lng: 10.7352 },
  sousse: { name: 'Sousse', lat: 35.8256, lng: 10.6084 },
};

export const GRADIENTS: Record<string, [string, string]> = {
  phones: ['#1d2b53', '#d9922e'],
  gaming: ['#2d1b4e', '#e0664a'],
  computers: ['#14344b', '#2fb59a'],
  cameras: ['#3b2b16', '#d9b23a'],
  audio: ['#262038', '#8b7bd8'],
  television: ['#0f2f2c', '#2fb59a'],
  bicycles: ['#0d2b3b', '#4aa3d8'],
  furniture: ['#33271a', '#c98f5a'],
  appliances: ['#1b2620', '#7ec850'],
  fashion: ['#331c2a', '#d86a9a'],
  watches: ['#241f16', '#d9b23a'],
  books: ['#2a1e14', '#d9922e'],
  instruments: ['#2f1f14', '#e0664a'],
  sports: ['#14293a', '#4aa3d8'],
  toys: ['#35203a', '#d86a9a'],
  tools: ['#26261f', '#c9a53c'],
  other: ['#20222a', '#8b93a3'],
};

function makeItemSvg(category: string, title: string): string {
  const [c1, c2] = GRADIENTS[category] ?? GRADIENTS.other;
  const icon = CATEGORIES.find((c) => c[0] === category)?.[2] ?? '📦';
  const esc = title.replace(/[<>&"]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
    <radialGradient id="h" cx="50%" cy="30%" r="70%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.18)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="900" fill="url(#g)"/>
  <rect width="1200" height="900" fill="url(#h)"/>
  <text x="600" y="430" font-size="300" text-anchor="middle" dominant-baseline="middle">${icon}</text>
  <text x="600" y="640" font-family="Georgia, serif" font-size="54" fill="rgba(255,255,255,0.92)" text-anchor="middle" letter-spacing="4">${esc}</text>
  <text x="600" y="706" font-family="sans-serif" font-size="26" fill="rgba(255,255,255,0.55)" text-anchor="middle" letter-spacing="6">B A D E L</text>
</svg>`;
}

export function writeSeedImage(filename: string, svg: string): string {
  const path = join(UPLOAD_DIR, filename);
  writeFileSync(path, svg);
  return `/uploads/${filename}`;
}

export function seedIfEmpty(): void {
  const d = getDb();
  const existing = d.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
  if (existing.c > 0) return;

  mkdirSync(UPLOAD_DIR, { recursive: true });

  const insertCat = d.prepare(
    'INSERT INTO categories (id, slug, name, icon, sort_order) VALUES (?, ?, ?, ?, ?)'
  );
  CATEGORIES.forEach(([slug, name, icon], i) => {
    insertCat.run(uid(), slug, name, icon, i);
  });

  const catBySlug: Record<string, string> = {};
  for (const r of rows<{ id: string; slug: string }>(d.prepare('SELECT id, slug FROM categories').all())) {
    catBySlug[r.slug] = r.id;
  }

  const hash = (p: string) => bcrypt.hashSync(p, 10);

  const insertUser = d.prepare(`
    INSERT INTO users (id, username, display_name, email, password_hash, avatar_url, bio, location, latitude, longitude,
      rating, rating_count, completed_trades, verification_status, membership_status, role, onboarded, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const monthsAgo = (m: number) => now() - m * 30 * 24 * 3600 * 1000;

  const users: Record<string, string> = {};
  const mkUser = (
    key: string, uname: string, dname: string, email: string, pass: string, bio: string,
    loc: keyof typeof LOC, rating: number | null, count: number, trades: number,
    vstatus: string, mstatus: string, role: string, onboarded: number, ageMonths: number,
    avatar?: string
  ) => {
    const id = uid();
    users[key] = id;
    const l = LOC[loc];
    insertUser.run(
      id, uname, dname, email, hash(pass), avatar ?? null, bio, l.name, l.lat, l.lng,
      rating, count, trades, vstatus, mstatus, role, onboarded, monthsAgo(ageMonths)
    );
  };

  mkUser('demo', 'demo', 'Demo User', 'demo@badel.tn', 'badel-demo',
    'Demo account to explore BADEL. Trading my Switch for your camera gear.', 'tunis',
    4.6, 3, 2, 'verified', 'verified', 'user', 1, 6);
  mkUser('ahmed', 'ahmed', 'Ahmed Ben Salah', 'ahmed@badel.tn', 'badel-demo',
    'Photographer and gamer. Looking for a PS5 or a new lens.', 'megrine',
    4.8, 12, 8, 'verified', 'verified', 'user', 1, 11);
  mkUser('sara', 'sara', 'Sara Mansouri', 'sara@badel.tn', 'badel-demo',
    'Cyclist & bookworm. My bike is my everything.', 'lamarsa',
    4.9, 9, 6, 'verified', 'premium', 'user', 1, 14);
  mkUser('karim', 'karim', 'Karim Trabelsi', 'karim@badel.tn', 'badel-demo',
    'Tech enthusiast. Always trading up.', 'benarous',
    4.4, 5, 3, 'verified', 'free', 'user', 1, 8);
  mkUser('yasmine', 'yasmine', 'Yasmine Gharbi', 'yasmine@badel.tn', 'badel-demo',
    'Interior design student. Furniture and fashion.', 'ariana',
    4.7, 7, 4, 'verified', 'free', 'user', 1, 10);
  mkUser('zied', 'zied', 'Zied Bouazizi', 'zied@badel.tn', 'badel-demo',
    'Gaming setup collector. PS5 up for the right trade.', 'tunis',
    4.5, 4, 2, 'unverified', 'free', 'user', 1, 5);
  mkUser('imen', 'imen', 'Imen Kallel', 'imen@badel.tn', 'badel-demo',
    'Music teacher. Trading instruments and books.', 'carthage',
    null, 0, 0, 'unverified', 'free', 'user', 1, 2);
  mkUser('oussama', 'oussama', 'Oussama Haddad', 'oussama@badel.tn', 'badel-demo',
    'Drone pilot. Electronics in, electronics out.', 'nabeul',
    4.3, 3, 2, 'unverified', 'free', 'user', 1, 4);
  mkUser('rim', 'rim', 'Rim Jaziri', 'rim@badel.tn', 'badel-demo',
    'Home cook. Kitchen gear swap specialist.', 'hammamet',
    4.6, 6, 4, 'verified', 'verified', 'user', 1, 9);
  mkUser('mehdi', 'mehdi', 'Mehdi Chaabane', 'mehdi@badel.tn', 'badel-demo',
    'Watch collector. Trading my way to a nicer Seiko.', 'sousse',
    4.2, 2, 1, 'unverified', 'free', 'user', 1, 3);
  mkUser('admin', 'admin', 'Badel Admin', 'admin@badel.tn', 'badel-admin',
    'Marketplace administrator.', 'tunis',
    null, 0, 0, 'verified', 'premium', 'admin', 1, 12);

  // ---- Items -------------------------------------------------
  const insertItem = d.prepare(`
    INSERT INTO items (id, owner_id, title, description, category_id, condition, status, location, latitude, longitude,
      value_min, value_max, value_currency, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPhoto = d.prepare(
    'INSERT INTO item_photos (id, item_id, storage_path, thumb_path, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertWanted = d.prepare(
    'INSERT INTO wanted_items (id, user_id, item_id, wanted_category_id, wanted_keywords, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const mkItem = (
    ownerKey: string, key: string, title: string, desc: string, cat: string, cond: string,
    loc: keyof typeof LOC, ageDays: number, wants: Array<[string, string]>, value?: [number, number],
    status: string = 'active'
  ): string => {
    const id = uid();
    const l = LOC[loc];
    const t = monthsAgo(0) - ageDays * 24 * 3600 * 1000;
    insertItem.run(id, users[ownerKey], title, desc, catBySlug[cat], cond, status, l.name, l.lat, l.lng,
      value?.[0] ?? null, value?.[1] ?? null, 'TND', t, t);
    const img = makeItemSvg(cat, title.split(' ').slice(0, 3).join(' '));
    const mainPath = writeSeedImage(`${id}-0.svg`, img);
    insertPhoto.run(uid(), id, mainPath, mainPath, 0, t);
    wants.forEach(([catSlug, keywords], i) => {
      insertWanted.run(uid(), users[ownerKey], id, catBySlug[catSlug], keywords, t + i);
    });
    return id;
  };

  const items: Record<string, string> = {};

  // Zied's PS5 — wants iPhone / gaming laptop / bicycle (creates a PERFECT MATCH with Ahmed)
  items.ziedPs5 = mkItem('zied', 'ps5', 'PlayStation 5 — Disc Edition',
    'PS5 disc edition with one DualSense controller, HDMI and power cables. Bought in 2023, played lightly, kept in a dust-free cabinet. No scratches, works perfectly. Looking for a fair swap — phone, gaming laptop or a good bicycle.',
    'gaming', 'like_new', 'tunis', 3, [['phones', 'iPhone 13, iPhone 14, Samsung S23'], ['computers', 'gaming laptop, MacBook'], ['bicycles', 'mountain bike, road bike']], [2200, 2500]);

  // Ahmed's iPhone 13 — wants PS5 / camera (perfect match with Zied)
  items.ahmedIphone = mkItem('ahmed', 'iphone', 'iPhone 13 — 128GB Midnight',
    'iPhone 13 in excellent condition. Battery health 89%. Always had a case and screen protector. Includes original box and a new cable. Face ID works perfectly. Swapping for a PS5 or camera gear.',
    'phones', 'good', 'megrine', 5, [['gaming', 'PS5, Xbox Series X, Nintendo Switch'], ['cameras', 'mirrorless camera, DSLR, lens']], [1800, 2100]);

  // Sara's bicycle
  items.saraBike = mkItem('sara', 'bike', 'Giant Escape 3 — City Bicycle',
    'Giant Escape 3 hybrid bike, size M. Recently serviced, new brake pads and tyres. Perfect for commuting around La Marsa. Includes a U-lock and front light. Want electronics or books.',
    'bicycles', 'good', 'lamarsa', 9, [['books', 'design books, novels'], ['audio', 'headphones, speaker'], ['phones', 'phone']], [900, 1100]);

  // Demo's Nintendo Switch
  items.demoSwitch = mkItem('demo', 'switch', 'Nintendo Switch — OLED',
    'Nintendo Switch OLED white with two Joy-Cons, dock, and 3 games (Mario Kart 8, Zelda BOTW, Smash). Barely used. Looking for camera gear or a tablet.',
    'gaming', 'like_new', 'tunis', 12, [['cameras', 'camera, DSLR, mirrorless'], ['phones', 'tablet, iPad']], [1400, 1600]);

  // Karim's gaming laptop
  items.karimLaptop = mkItem('karim', 'laptop', 'ASUS ROG Gaming Laptop — RTX 3060',
    'ASUS ROG Strix G15 with Ryzen 7 5800H, RTX 3060, 16GB RAM, 512GB SSD. Great condition, thermal paste renewed. Swapping for a console or phone.',
    'computers', 'good', 'benarous', 7, [['gaming', 'PS5, Xbox, Switch'], ['phones', 'iPhone, Samsung']], [2400, 2800]);

  // Yasmine's furniture
  items.yasmineSofa = mkItem('yasmine', 'sofa', 'Scandinavian 3-Seater Sofa',
    'Light grey 3-seater sofa, very comfortable, from a smoke-free home. Minor wear on one armrest. I need a dining table or bookshelf.',
    'furniture', 'good', 'ariana', 15, [['furniture', 'dining table, bookshelf, desk'], ['appliances', 'coffee machine']], [600, 900]);

  // Oussama's drone
  items.oussamaDrone = mkItem('oussama', 'drone', 'DJI Mini 3 Drone',
    'DJI Mini 3 with fly-more combo: 3 batteries, charging hub, ND filters, carrying case. Flown a handful of times. Looking for a gaming console or phone.',
    'cameras', 'like_new', 'nabeul', 6, [['gaming', 'PS5, Switch'], ['phones', 'iPhone 12 or newer, Samsung S22+']], [1500, 1800]);

  // Rim's espresso machine
  items.rimCoffee = mkItem('rim', 'coffee', 'Delonghi Espresso Machine',
    'Delonghi Dedica EC685. Works perfectly, descaled monthly. Includes milk frother and tamper. Want kitchen gear, a bicycle, or books.',
    'appliances', 'good', 'hammamet', 20, [['appliances', 'air fryer, mixer, blender'], ['bicycles', 'bicycle'], ['books', 'cookbooks']], [350, 500]);

  // Mehdi's watch
  items.mehdiWatch = mkItem('mehdi', 'watch', 'Seiko 5 Automatic Watch',
    'Seiko 5 Sports automatic, black dial with steel bracelet. Recently serviced, keeps great time. Open to electronics or another watch.',
    'watches', 'good', 'sousse', 18, [['watches', 'automatic watch, diver watch'], ['audio', 'headphones']], [450, 650]);

  // Imen's guitar
  items.imenGuitar = mkItem('imen', 'guitar', 'Yamaha Acoustic Guitar',
    'Yamaha F310 acoustic guitar, warm tone, ready to play. Slight pickwear on the top. Looking for books, a keyboard, or headphones.',
    'instruments', 'good', 'carthage', 10, [['instruments', 'keyboard, ukulele'], ['books', 'novels, music books'], ['audio', 'headphones']], [280, 380]);

  // More items to fill browse: 
  items.karimMonitor = mkItem('karim', 'monitor', '27" 144Hz Gaming Monitor',
    'LG UltraGear 27" 144Hz IPS monitor. Zero dead pixels, stand included. Want a console or mechanical keyboard setup trade.',
    'television', 'good', 'benarous', 4, [['gaming', 'controller, console'], ['computers', 'keyboard, mouse, SSD']], [700, 900]);
  items.saraKindle = mkItem('sara', 'kindle', 'Kindle Paperwhite 11',
    'Kindle Paperwhite 11th gen, 16GB, ad-free. Like new with original box. Looking for a bicycle accessory or headphones.',
    'books', 'like_new', 'lamarsa', 8, [['audio', 'headphones, earbuds'], ['bicycles', 'bike light, helmet, lock']], [350, 450]);
  items.ahmedCamera = mkItem('ahmed', 'camera', 'Canon EOS 2000D DSLR Kit',
    'Canon 2000D with 18-55mm kit lens, bag, 2 batteries, 64GB SD. Great starter DSLR. Want a PS5 or gaming laptop.',
    'cameras', 'good', 'megrine', 14, [['gaming', 'PS5, gaming laptop'], ['phones', 'iPhone']], [1200, 1400]);
  items.yasmineDesk = mkItem('yasmine', 'desk', 'Standing Desk — Electric',
    'Electric sit-stand desk, walnut top, 140x70cm. Slight scratch on the frame. Want furniture or appliances.',
    'furniture', 'fair', 'ariana', 25, [['furniture', 'chair, shelf, cabinet'], ['appliances', 'robot vacuum']], [400, 600]);
  items.oussamaHeadphones = mkItem('oussama', 'headphones', 'Sony WH-1000XM4 Headphones',
    'Sony XM4 noise cancelling headphones, black. Ear cushions replaced recently. Original case included. Want gaming stuff or a fitness tracker.',
    'audio', 'like_new', 'nabeul', 2, [['gaming', 'controller, headset'], ['sports', 'smartwatch, fitness band']], [600, 750]);
  items.rimMixer = mkItem('rim', 'mixer', 'KitchenAid Stand Mixer',
    'KitchenAid Artisan 4.8L in cream. Works perfectly, comes with paddle, whisk, dough hook and pouring shield. Want an espresso machine or bicycle.',
    'appliances', 'good', 'hammamet', 30, [['appliances', 'espresso machine, air fryer'], ['bicycles', 'bicycle']], [1100, 1400]);
  items.mehdiEarbuds = mkItem('mehdi', 'earbuds', 'AirPods Pro 2',
    'AirPods Pro 2 with USB-C case. All tips included, minimal use. Swapping for a watch or headphones.',
    'audio', 'like_new', 'sousse', 1, [['watches', 'automatic watch'], ['audio', 'headphones, speaker']], [650, 800]);
  items.ziedBike = mkItem('zied', 'mountain', 'Trek Marlin 5 Mountain Bike',
    'Trek Marlin 5, size L, disc brakes, recently tuned. Upgraded pedals. Want a console, laptop or camera.',
    'bicycles', 'good', 'tunis', 11, [['gaming', 'PS5, Xbox'], ['computers', 'laptop'], ['cameras', 'camera']], [1000, 1200]);
  items.imenKeyboard = mkItem('imen', 'keyboard', 'Casio Keyboard — 61 Keys',
    'Casio CT-S300 portable keyboard, 61 keys, very light. Slight yellowing on keys. Want an acoustic guitar or headphones.',
    'instruments', 'fair', 'carthage', 16, [['instruments', 'guitar, ukulele'], ['audio', 'headphones']], [250, 350]);
  items.demoWatch = mkItem('demo', 'smartwatch', 'Apple Watch Series 8',
    'Apple Watch Series 8, 45mm midnight, GPS. 92% battery health, screen perfect. Comes with an extra sport band. Want a DSLR or tablet.',
    'watches', 'good', 'tunis', 21, [['cameras', 'DSLR, mirrorless camera'], ['phones', 'iPad, tablet']], [1300, 1500]);

  // ---- Trade offers / history ---------------------------------
  const insertOffer = d.prepare(`
    INSERT INTO trade_offers (id, from_user_id, to_user_id, offered_item_id, requested_item_id, message, status,
      created_at, accepted_at, completed_at, from_exchange_confirmed, to_exchange_confirmed, cancelled_by, dispute_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMessage = d.prepare(
    'INSERT INTO messages (id, trade_id, sender_id, body, read, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertRating = d.prepare(
    'INSERT INTO ratings (id, trade_id, rater_id, ratee_id, reliability, communication, item_accuracy, overall, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertNotification = d.prepare(
    'INSERT INTO notifications (id, user_id, type, title, body, data, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertEvent = d.prepare(
    'INSERT INTO analytics_events (id, user_id, name, data, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const insertMeetup = d.prepare(
    'INSERT INTO meetups (id, trade_id, created_by, location_name, latitude, longitude, meet_date, meet_time, notes, status, from_confirmed, to_confirmed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const days = (n: number) => now() - n * 24 * 3600 * 1000;

  // 1) Incoming pending offer for Demo (Ahmed wants Demo's Switch)
  const t1 = uid();
  insertOffer.run(t1, users.ahmed, users.demo, items.ahmedIphone, items.demoSwitch,
    "Salam! Would you trade your Switch OLED for my iPhone 13? Battery is at 89% and it's in great shape.", 'pending',
    days(1), null, null, 0, 0, null, null);
  insertNotification.run(uid(), users.demo, 'offer_received', 'New trade offer',
    'Ahmed offered his iPhone 13 — 128GB Midnight for your Nintendo Switch — OLED.', JSON.stringify({ trade_id: t1 }), 0, days(1));

  // 2) Sent pending offer by Demo (wants Sara's bike)
  const t2 = uid();
  insertOffer.run(t2, users.demo, users.sara, items.demoWatch, items.saraBike,
    "Hi Sara! Would you swap your Giant Escape for my Apple Watch Series 8? It's in great condition.", 'pending',
    days(2), null, null, 0, 0, null, null);

  // 3) Accepted trade for Demo — iPhone ↔ Switch (Ahmed accepted, arranging meetup)
  const t3 = uid();
  insertOffer.run(t3, users.ahmed, users.demo, items.ahmedCamera, items.demoSwitch,
    "My Canon DSLR kit for your Switch OLED — what do you think?", 'meetup',
    days(6), days(5), null, 0, 0, null, null);
  const m3 = uid();
  insertMeetup.run(m3, t3, users.demo, 'Café de Paris, Avenue Habib Bourguiba', 36.8008, 10.1813,
    formatDate(days(1)), '18:00', 'Next to the terrace, I will be wearing a black jacket. Meet in a public place!', 'proposed', 1, 0, days(3));
  insertMessage.run(uid(), t3, users.ahmed, 'Sounds good! Is the switch complete with all games?', 1, days(4));
  insertMessage.run(uid(), t3, users.demo, 'Yes — Mario Kart, Zelda BOTW and Smash, plus the dock.', 1, days(4));
  insertMessage.run(uid(), t3, users.ahmed, 'Perfect. Can we meet near Megrine on Saturday?', 1, days(3));
  insertMessage.run(uid(), t3, users.demo, 'Sure — I proposed Café de Paris downtown, Saturday 18:00. Please confirm!', 0, days(2));
  insertNotification.run(uid(), users.demo, 'meetup_proposed', 'Meetup proposed',
    'You proposed a meetup for your trade with Ahmed. Waiting for his confirmation.', JSON.stringify({ trade_id: t3 }), 0, days(2));

  // 4) Completed trade for Demo (Switch → old phone, with ratings) 
  const t4 = uid();
  insertOffer.run(t4, users.karim, users.demo, items.karimMonitor, items.demoSwitch,
    'My LG monitor for your Switch?', 'completed', days(40), days(38), days(30), 1, 1, null, null);
  insertMessage.run(uid(), t4, users.karim, 'Great trade, thanks!', 1, days(30));
  insertMessage.run(uid(), t4, users.demo, 'Thank you too! Enjoy the Switch.', 1, days(30));
  insertRating.run(uid(), t4, users.karim, users.demo, 5, 5, 5, 5, 'Super smooth trade, item exactly as described.', days(29));
  insertRating.run(uid(), t4, users.demo, users.karim, 4, 5, 5, 5, 'Reliable, showed up on time.', days(29));
  insertNotification.run(uid(), users.demo, 'trade_completed', 'Trade completed',
    'Your trade with Karim was completed. Rate your experience.', JSON.stringify({ trade_id: t4 }), 1, days(30));

  // 5) Declined offer (history)
  const t5 = uid();
  insertOffer.run(t5, users.demo, users.zied, items.demoSwitch, items.ziedPs5,
    'My Switch OLED for your PS5?', 'declined', days(12), null, null, 0, 0, users.zied, null);

  // 6) Completed trade between others (for admin analytics) with ratings
  const t6 = uid();
  insertOffer.run(t6, users.sara, users.ahmed, items.saraKindle, items.ahmedCamera,
    'Kindle for your camera?', 'completed', days(55), days(53), days(45), 1, 1, null, null);
  insertRating.run(uid(), t6, users.sara, users.ahmed, 5, 5, 4, 5, 'Kind and punctual.', days(44));
  insertRating.run(uid(), t6, users.ahmed, users.sara, 5, 4, 5, 5, 'Item as described, great communication.', days(44));

  // 7) Accepted/meetup trade between Zied and Ahmed (PS5 ↔ iPhone) — perfect match showcase
  const t7 = uid();
  insertOffer.run(t7, users.ahmed, users.zied, items.ahmedIphone, items.ziedPs5,
    'Your PS5 for my iPhone 13? I can add a case too.', 'meetup', days(3), days(2), null, 0, 0, null, null);
  const m7 = uid();
  insertMeetup.run(m7, t7, users.zied, 'Géant, Tunisia Mall', 36.8363, 10.1841,
    formatDate(days(0)), '17:30', 'By the entrance near the fountains.', 'proposed', 1, 0, days(1));
  insertNotification.run(uid(), users.zied, 'offer_accepted', 'Offer accepted',
    'Ahmed accepted your trade. Arrange your exchange now.', JSON.stringify({ trade_id: t7 }), 0, days(2));

  // 8) A disputed trade (admin demo)
  const t8 = uid();
  insertOffer.run(t8, users.oussama, users.rim, items.oussamaDrone, items.rimMixer,
    'DJI Mini 3 for your KitchenAid?', 'disputed', days(20), days(18), null, 0, 0, null,
    'Item was not as described — the drone has a cracked gimbal not mentioned in the listing.');
  insertMessage.run(uid(), t8, users.rim, 'The drone arrived with a cracked gimbal. Not as described.', 1, days(15));
  insertMessage.run(uid(), t8, users.oussama, 'It was fine when I packed it. I want the mixer back.', 1, days(15));
  insertReport(d, users.rim, users.oussama, null, t8, 'not_as_described',
    'The DJI Mini 3 has a cracked gimbal that was not shown or mentioned. Photos were taken before the damage.', days(15));

  // ---- Favorites, notifications, events -----------------------
  const insertFavorite = d.prepare('INSERT INTO favorites (id, user_id, item_id, created_at) VALUES (?, ?, ?, ?)');
  insertFavorite.run(uid(), users.demo, items.ziedPs5, days(2));
  insertFavorite.run(uid(), users.demo, items.saraBike, days(1));
  insertFavorite.run(uid(), users.ahmed, items.ziedPs5, days(2));
  insertFavorite.run(uid(), users.zied, items.ahmedIphone, days(2));
  insertFavorite.run(uid(), users.sara, items.demoSwitch, days(1));

  const notifs: Array<[string, string, string, string, number, number]> = [
    [users.demo, 'offer_declined', 'Offer declined', 'Zied declined your offer for his PlayStation 5 — Disc Edition.', 1, days(12)],
    [users.demo, 'rating_request', 'Rate your trade', 'Your trade with Karim is complete — take a moment to rate it.', 1, days(29)],
    [users.demo, 'system', 'Welcome to BADEL', 'Trade what you have for what you actually need. Add your items to get started.', 1, days(30)],
    [users.ahmed, 'offer_accepted', 'Offer accepted', 'Zied accepted your PS5 for iPhone trade — arrange your exchange.', 0, days(2)],
    [users.sara, 'offer_received', 'New trade offer', 'Demo User offered his Apple Watch Series 8 for your Giant Escape 3 — City Bicycle.', 0, days(2)],
    [users.zied, 'offer_received', 'New trade offer', 'Ahmed offered his iPhone 13 — 128GB Midnight for your PlayStation 5 — Disc Edition.', 0, days(3)],
  ];
  const insNot = d.prepare(
    'INSERT INTO notifications (id, user_id, type, title, body, data, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  notifs.forEach(([u, type, title, body, read, ts]) => {
    insNot.run(uid(), u, type, title, body, null, read, ts);
  });

  // ---- Analytics events ---------------------------------------
  const ev: Array<[string | null, string, number]> = [
    [users.demo, 'signup', days(30)], [users.demo, 'onboarding_complete', days(30)],
    [users.demo, 'listing_created', days(21)], [users.demo, 'listing_created', days(12)],
    [users.demo, 'item_viewed', days(3)], [users.demo, 'offer_sent', days(2)],
    [users.demo, 'search_performed', days(2)], [users.demo, 'favorite_added', days(2)],
    [users.ahmed, 'signup', days(330)], [users.ahmed, 'listing_created', days(14)],
    [users.ahmed, 'offer_sent', days(3)], [users.ahmed, 'offer_accepted', days(2)],
    [users.sara, 'signup', days(420)], [users.sara, 'listing_created', days(9)],
    [users.zied, 'signup', days(150)], [users.zied, 'listing_created', days(3)],
    [null, 'item_viewed', days(1)], [null, 'item_viewed', days(1)], [null, 'search_performed', days(1)],
    [null, 'signup', days(0)], [null, 'signup', days(0)],
  ];
  ev.forEach(([u, name, ts]) => insertEvent.run(uid(), u, name, null, ts));

  // A report on an item (for admin demo)
  insertReport(d, users.zied, users.mehdi, items.mehdiWatch, null, 'fake_listing',
    'This watch is listed as a Seiko 5 but the serial number does not match.', days(4));

  console.log('[badel] database seeded with demo data');
}

function insertReport(
  d: DatabaseSync, reporter: string, target: string, itemId: string | null, tradeId: string | null,
  reason: string, details: string, ts: number
): void {
  d.prepare(`
    INSERT INTO reports (id, reporter_id, reported_user_id, item_id, trade_id, reason, details, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(uid(), reporter, target, itemId, tradeId, reason, details, ts);
}

function formatDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function initDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const d = new DatabaseSync(join(DATA_DIR, 'badel.db'));
  d.exec(SCHEMA);
  db = d;
  seedIfEmpty();
  return d;
}

export function closeDb(): void {
  if (db) { db.close(); db = null; }
}

// Keep existsSync import used
export { existsSync };
