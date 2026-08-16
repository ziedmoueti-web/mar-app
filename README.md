# BADEL — TRADE, NOT MONEY

Peer-to-peer barter marketplace. Users don't buy items with money —
they swap what they have for what they actually need.

**Demo accounts:** `demo@badel.tn` / `badel-demo` · admin: `admin@badel.tn` / `badel-admin`

## Run it

```bash
npm install
npm run dev        # API on :8787 (BADEL_PORT) + Vite on :5173
npm run build      # typecheck + production SPA build
```

The first boot seeds a relational database with fictional Tunisian
demo users and listings (all demo data is explicitly fictional).

## Architecture

```
src/            React SPA (Vite) — mobile-first, bottom nav
shared/types.ts Domain types shared by client and server
server/         Express API — all business logic lives here
  db.ts           data layer (dev store, below)
  routes/         auth, items, trades, browse, social, admin
  matching.ts     deterministic match scoring (no fake AI)
  payments.ts     PaymentProvider abstraction (mock in demo)
scripts/        API test suites
supabase/       production PostgreSQL schema, RLS, storage, seed
```

### Database strategy (two stores, one schema, one source of truth)

| | Development (this repo) | Production (Supabase) |
|---|---|---|
| Store | SQLite via `node:sqlite` (`server/data/badel.db`) | PostgreSQL |
| Schema | `server/db.ts` mirrors it | `supabase/migrations/` |
| Auth | custom sessions + bcrypt | Supabase Auth (email/password, verification, reset, Google) |
| Files | disk under `server/data/uploads` | Supabase Storage bucket `item-photos` |
| Source of truth | dev-only convenience | **PostgreSQL — production data never touches SQLite** |

The SQLite store exists so the project runs fully offline with zero
infrastructure. It is deliberately *not* a second product: the schema,
constraints and indexes match the PostgreSQL migration files, and the
frontend never touches the database directly — it only talks to the
API. Production deployment swaps the data layer (`server/db.ts`) for
the Supabase one; route logic is unchanged because queries target the
same schema. See `supabase/README.md` for the wiring steps.

### Business rules are server- and database-enforced

Everything below is validated in the API **and** re-enforced by
PostgreSQL triggers / RLS for production:

- **Trade lifecycle** — `pending → accepted → meetup → completed`.
  Completion requires *both* parties to confirm the exchange; a trade
  is never completed by pressing Accept alone.
- **Double-booking** — an item can never be part of two active trades
  (API busy-check + partial unique indexes + trigger).
- **Ratings** — only after a completed trade, by a participant, once
  per trade. Ratings are write-only; aggregates are recomputed by
  trigger. New users show **"No ratings yet"** (rating is NULL).
- **Trust columns** — role, rating, completed trades, verification and
  membership status can't be set by the account owner.
- **Ownership** — edit/delete/status changes require the owner;
  admin routes require the `admin` role server-side.
- **Privacy** — messages, meetups and notifications are visible only to
  participants; a third party gets 403 on every trade endpoint.
- **Location** — listings expose only approximate area + distance;
  exact meetup details are shared only inside an accepted trade.
- **Suspension** — a suspended account is rejected at the auth boundary
  and cannot log in.
- **Payments** — abstracted behind `PaymentProvider`; the demo provider
  is explicitly mock (`MOCK-…`, `method='mock'`) and never claims a
  real charge. Membership (`free` / `verified` / `premium`) is a state,
  not a hard-coded fee, and never blocks browsing or listing.

## Tests

```bash
# server must be running on :8787
node scripts/smoke-api.mjs   # full happy path: signup→…→offer→accept→meetup→confirm→complete→rate
node scripts/authz-test.mjs  # ownership, trade privacy, guards, suspension, blocking, uploads
```

The authz suite asserts the API (not just the UI) rejects: editing or
deleting someone else's item, reading another user's trade or messages,
rating before completion, duplicate ratings, fake completion, blocked
messaging, suspended accounts, oversized uploads, and non-admin admin
access.

## Env vars

See `.env.example`. Only `BACKEND=local` is required for the demo;
Supabase variables are needed only when `BACKEND=supabase`. The
service-role key is server-only and never shipped to the browser.

## Feature map (V1)

Auth & email verification · 5-step onboarding (no payment wall) ·
browse/search with server-side SQL filters · item detail + gallery ·
list item (8 photos, structured wants) · offers with deterministic
match scores ("94% match", never "AI") · full trade lifecycle ·
meetup arrangement · in-trade chat · ratings · favorites · in-app
notifications · reports/moderation · admin dashboard (users, items,
trades, reports, categories, analytics) · mock membership upgrade ·
analytics events.

Trade chains (multi-person swaps) are deliberately Phase 2.

## Deploy

1. Provision a Supabase project, run `supabase link` + `supabase db push` (see `supabase/README.md`).
2. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` server-side.
3. Build the SPA (`npm run build`) — the Express server serves it.
4. Set `BACKEND=supabase` and point the data layer at PostgREST/`pg`.
