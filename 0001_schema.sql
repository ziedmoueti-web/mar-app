-- =============================================================
-- BADEL — production PostgreSQL schema (Supabase)
--
-- This is the source of truth for production data. The local
-- development server (server/db.ts) mirrors this schema in SQLite
-- so the two stay in sync. Every table below ships with:
--   * foreign keys           (referential integrity)
--   * CHECK constraints      (valid values, ranges)
--   * indexes                (search/filter performance)
--   * triggers               (business rules that must never be
--                             bypassed, enforced at the database)
--
-- Convention: ids are UUIDs. status/condition/verification are
-- TEXT + CHECK so new values can be added with a single ALTER.
-- =============================================================

-- Identities & credentials live in Supabase Auth (auth.users).
-- This table is the public + trust profile, keyed 1:1 to auth.users.
create table if not exists public.users (
  id                   uuid primary key references auth.users (id) on delete cascade,
  username             text not null unique,
  display_name         text not null,
  avatar_url           text,
  bio                  text not null default '',
  location             text not null default '',
  latitude             double precision,
  longitude            double precision,
  rating               real,                                   -- NULL = "No ratings yet"
  rating_count         integer not null default 0,
  completed_trades     integer not null default 0,
  verification_status  text not null default 'unverified' check (verification_status in ('unverified','verified')),
  membership_status    text not null default 'free'     check (membership_status in ('free','verified','premium')),
  role                 text not null default 'user'      check (role in ('user','admin','suspended')),
  onboarded            boolean not null default false,
  created_at           timestamptz not null default now()
);

create index if not exists idx_users_location on public.users (latitude, longitude);
create index if not exists idx_users_rating   on public.users (rating desc);

-- Blocks (privacy / safety)
create table if not exists public.user_blocks (
  user_id          uuid not null references public.users (id) on delete cascade,
  blocked_user_id  uuid not null references public.users (id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (user_id, blocked_user_id)
);

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  icon        text not null default '',
  sort_order  integer not null default 0
);

-- Listings
create table if not exists public.items (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.users (id) on delete cascade,
  title           text not null check (char_length(title) between 4 and 90),
  description     text not null default '' check (char_length(description) >= 10),
  category_id     uuid not null references public.categories (id),
  condition       text not null default 'good' check (condition in ('new','like_new','good','fair','poor')),
  status          text not null default 'active' check (status in ('active','unavailable','traded','deleted')),
  location        text not null default '',
  latitude        double precision,
  longitude       double precision,
  value_min       integer check (value_min is null or value_min >= 0),
  value_max       integer check (value_max is null or value_max >= 0),
  value_currency  text not null default 'TND',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_items_category on public.items (category_id);
create index if not exists idx_items_owner   on public.items (owner_id);
create index if not exists idx_items_status  on public.items (status);
create index if not exists idx_items_created on public.items (created_at desc);
create index if not exists idx_items_location on public.items (latitude, longitude);

-- Photos (paths point into the item-photos storage bucket)
create table if not exists public.item_photos (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.items (id) on delete cascade,
  storage_path text not null,
  thumb_path   text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists idx_photos_item on public.item_photos (item_id, sort_order);

-- Structured "what the owner wants in exchange"
create table if not exists public.wanted_items (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users (id) on delete cascade,
  item_id            uuid not null references public.items (id) on delete cascade,
  wanted_category_id uuid references public.categories (id),
  wanted_keywords    text not null default '',
  created_at         timestamptz not null default now()
);

create index if not exists idx_wanted_item on public.wanted_items (item_id);
create index if not exists idx_wanted_user on public.wanted_items (user_id);

-- Trade offers — the heart of the marketplace.
-- Lifecycle (enforced by trigger enforce_trade_transition):
--   pending  → accepted | declined | cancelled
--   accepted → meetup | cancelled | disputed
--   meetup   → completed | cancelled | disputed | accepted
--   completed/declined/cancelled/disputed are terminal for users
create table if not exists public.trade_offers (
  id                       uuid primary key default gen_random_uuid(),
  from_user_id             uuid not null references public.users (id) on delete cascade,
  to_user_id               uuid not null references public.users (id) on delete cascade,
  offered_item_id          uuid not null references public.items (id),
  requested_item_id        uuid not null references public.items (id),
  message                  text not null default '',
  status                   text not null default 'pending'
                           check (status in ('pending','accepted','meetup','completed','declined','cancelled','disputed')),
  created_at               timestamptz not null default now(),
  accepted_at              timestamptz,
  completed_at             timestamptz,
  from_exchange_confirmed  boolean not null default false,
  to_exchange_confirmed    boolean not null default false,
  cancelled_by             uuid references public.users (id),
  dispute_reason           text,
  check (from_user_id <> to_user_id),
  check (offered_item_id <> requested_item_id)
);

create index if not exists idx_offers_from      on public.trade_offers (from_user_id, status);
create index if not exists idx_offers_to        on public.trade_offers (to_user_id, status);
create index if not exists idx_offers_item      on public.trade_offers (offered_item_id);
create index if not exists idx_offers_requested on public.trade_offers (requested_item_id);

-- Backstop #1 against double-booking: an item can be offered in at
-- most one active trade, and requested in at most one active trade.
create unique index uq_active_offered
  on public.trade_offers (offered_item_id)
  where status in ('pending','accepted','meetup');
create unique index uq_active_requested
  on public.trade_offers (requested_item_id)
  where status in ('pending','accepted','meetup');

-- Messaging between the two participants of a trade
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  trade_id    uuid not null references public.trade_offers (id) on delete cascade,
  sender_id   uuid not null references public.users (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_messages_trade   on public.messages (trade_id, created_at);
create index if not exists idx_messages_unread  on public.messages (trade_id, read);

-- Meetup arrangements — exact location shared only between participants
create table if not exists public.meetups (
  id              uuid primary key default gen_random_uuid(),
  trade_id        uuid not null references public.trade_offers (id) on delete cascade,
  created_by      uuid not null references public.users (id),
  location_name   text not null check (char_length(location_name) >= 3),
  latitude        double precision,
  longitude       double precision,
  meet_date       date,
  meet_time       time,
  notes           text not null default '',
  status          text not null default 'proposed' check (status in ('proposed','confirmed','cancelled')),
  from_confirmed  boolean not null default false,
  to_confirmed    boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists idx_meetups_trade on public.meetups (trade_id);

-- Ratings: only possible after a completed trade (trigger-enforced),
-- one rating per (trade, rater), immutable once written.
create table if not exists public.ratings (
  id             uuid primary key default gen_random_uuid(),
  trade_id       uuid not null references public.trade_offers (id) on delete cascade,
  rater_id       uuid not null references public.users (id) on delete cascade,
  ratee_id       uuid not null references public.users (id) on delete cascade,
  reliability    integer not null check (reliability between 1 and 5),
  communication  integer not null check (communication between 1 and 5),
  item_accuracy  integer not null check (item_accuracy between 1 and 5),
  overall        integer not null check (overall between 1 and 5),
  comment        text not null default '',
  created_at     timestamptz not null default now(),
  unique (trade_id, rater_id)
);

create index if not exists idx_ratings_ratee on public.ratings (ratee_id);

-- Saved listings
create table if not exists public.favorites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  item_id     uuid not null references public.items (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, item_id)
);

create index if not exists idx_favorites_user on public.favorites (user_id);

-- In-app notifications
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text not null default '',
  data        jsonb,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_notifications_user on public.notifications (user_id, read, created_at desc);

-- Moderation reports
create table if not exists public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.users (id) on delete cascade,
  reported_user_id uuid references public.users (id) on delete cascade,
  item_id          uuid references public.items (id) on delete set null,
  trade_id         uuid references public.trade_offers (id) on delete set null,
  reason           text not null check (reason in (
                     'scam','counterfeit','stolen_item','inappropriate','harassment','fake_listing','not_as_described'
                   )),
  details          text not null default '',
  status           text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  admin_notes      text,
  created_at       timestamptz not null default now(),
  check (reported_user_id is not null or item_id is not null or trade_id is not null),
  check (reporter_id <> reported_user_id)
);

create index if not exists idx_reports_status on public.reports (status, created_at desc);

-- Per-user preferences (notifications/privacy) — JSONB, opaque to the app
create table if not exists public.user_settings (
  user_id   uuid primary key references public.users (id) on delete cascade,
  settings  jsonb not null default '{}'::jsonb
);

-- Payment ledger — written only by the payment provider layer (service role)
create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  provider    text not null,
  method      text not null,
  amount      integer not null check (amount > 0),
  currency    text not null default 'TND',
  reference   text not null,
  status      text not null,
  created_at  timestamptz not null default now()
);

-- Product analytics
create table if not exists public.analytics_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users (id) on delete set null,
  name        text not null,
  data        jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_events_name_time on public.analytics_events (name, created_at);
create index if not exists idx_events_time      on public.analytics_events (created_at);

-- =============================================================
-- Triggers — business rules enforced at the database layer
-- =============================================================

-- 1) Trade state machine. Only legal transitions are allowed and a
--    completion requires BOTH exchange confirmations.
create or replace function public.enforce_trade_transition()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.status <> old.status then
      if not (
        (old.status = 'pending'  and new.status in ('accepted','declined','cancelled')) or
        (old.status = 'accepted' and new.status in ('meetup','cancelled','disputed')) or
        (old.status = 'meetup'   and new.status in ('completed','cancelled','disputed','accepted'))
      ) then
        raise exception 'Illegal trade transition % → %', old.status, new.status;
      end if;
      if new.status = 'completed' then
        if not (new.from_exchange_confirmed and new.to_exchange_confirmed) then
          raise exception 'Trade cannot complete until both parties confirm the exchange';
        end if;
        new.completed_at := coalesce(new.completed_at, now());
      end if;
    end if;
    -- participants / items may never be swapped
    if new.from_user_id is distinct from old.from_user_id
       or new.to_user_id is distinct from old.to_user_id
       or new.offered_item_id is distinct from old.offered_item_id
       or new.requested_item_id is distinct from old.requested_item_id then
      raise exception 'Trade participants and items are immutable';
    end if;
    -- completed trades can never be reopened
    if old.status = 'completed' then
      raise exception 'Completed trades are immutable';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_trade_transition on public.trade_offers;
create trigger trg_trade_transition
  before update on public.trade_offers
  for each row execute function public.enforce_trade_transition();

-- 2) Double-booking: an item can never be part of two active trades
--    at once, whether offered or requested. (Backstop #2 on top of
--    the partial unique indexes.)
create or replace function public.enforce_no_double_booking()
returns trigger language plpgsql as $$
begin
  if new.status in ('pending','accepted','meetup') then
    if exists (
      select 1 from public.trade_offers t
      where t.id <> new.id
        and t.status in ('pending','accepted','meetup')
        and (t.offered_item_id in (new.offered_item_id, new.requested_item_id)
          or t.requested_item_id in (new.offered_item_id, new.requested_item_id))
    ) then
      raise exception 'One of the items is already committed to an active trade';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_no_double_booking on public.trade_offers;
create trigger trg_no_double_booking
  before insert or update on public.trade_offers
  for each row execute function public.enforce_no_double_booking();

-- 3) Ratings integrity: only participants of a COMPLETED trade may
--    rate, and only once (unique index). Updating the ratee's stats
--    happens in the AFTER trigger below.
create or replace function public.enforce_rating_rules()
returns trigger language plpgsql as $$
declare
  t public.trade_offers;
begin
  select * into t from public.trade_offers where id = new.trade_id;
  if t is null then
    raise exception 'Trade does not exist';
  end if;
  if t.status <> 'completed' then
    raise exception 'Ratings are only allowed after a completed trade';
  end if;
  if new.rater_id not in (t.from_user_id, t.to_user_id) then
    raise exception 'Only trade participants can rate';
  end if;
  new.ratee_id := case when new.rater_id = t.from_user_id then t.to_user_id else t.from_user_id end;
  return new;
end $$;

drop trigger if exists trg_rating_rules on public.ratings;
create trigger trg_rating_rules
  before insert on public.ratings
  for each row execute function public.enforce_rating_rules();

-- 4) Recompute the ratee's aggregate rating after each new rating,
--    so client-side values can never diverge or be forged.
create or replace function public.refresh_rating_stats()
returns trigger language plpgsql as $$
begin
  update public.users u
  set rating = s.avg_rating, rating_count = s.cnt
  from (
    select ratee_id, round(avg(overall)::numeric, 2)::real as avg_rating, count(*)::int as cnt
    from public.ratings where ratee_id = new.ratee_id group by ratee_id
  ) s
  where u.id = s.ratee_id;
  return new;
end $$;

drop trigger if exists trg_refresh_rating_stats on public.ratings;
create trigger trg_refresh_rating_stats
  after insert on public.ratings
  for each row execute function public.refresh_rating_stats();

-- 5) When a trade completes, mark both items as traded (idempotent).
create or replace function public.complete_trade_items()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' then
    update public.items set status = 'traded', updated_at = now()
      where id in (new.offered_item_id, new.requested_item_id) and status <> 'traded';
    update public.users set completed_trades = completed_trades + 1
      where id in (new.from_user_id, new.to_user_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_complete_trade_items on public.trade_offers;
create trigger trg_complete_trade_items
  after update on public.trade_offers
  for each row when (new.status = 'completed')
  execute function public.complete_trade_items();

-- 6) Keep items.updated_at fresh on edits.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_touch_item on public.items;
create trigger trg_touch_item
  before update on public.items
  for each row execute function public.touch_updated_at();

-- 7) RLS helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'admin'
  );
$$;

-- 8) RLS helper: is the current user a participant of a trade?
create or replace function public.is_trade_participant(trade uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.trade_offers
    where id = trade and (from_user_id = auth.uid() or to_user_id = auth.uid())
  );
$$;
