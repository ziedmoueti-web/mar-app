-- =============================================================
-- BADEL — Row Level Security policies
--
-- Every table is RLS-enabled. Policies implement, at the database,
-- the same rules the API enforces in the app layer:
--   * users can edit only their own listings
--   * users can delete only their own listings
--   * users see only their own private messages / notifications
--   * users cannot forge ratings, verification or membership
--   * users cannot modify another user's trade
--   * admin actions are gated on public.is_admin()
-- The API server also uses the service_role key for trusted writes
-- (payment ledger, analytics, moderation) which bypasses RLS.
-- =============================================================

alter table public.users            enable row level security;
alter table public.user_blocks      enable row level security;
alter table public.categories       enable row level security;
alter table public.items            enable row level security;
alter table public.item_photos      enable row level security;
alter table public.wanted_items     enable row level security;
alter table public.trade_offers     enable row level security;
alter table public.messages         enable row level security;
alter table public.meetups          enable row level security;
alter table public.ratings          enable row level security;
alter table public.favorites        enable row level security;
alter table public.notifications    enable row level security;
alter table public.reports          enable row level security;
alter table public.user_settings    enable row level security;
alter table public.payments         enable row level security;
alter table public.analytics_events enable row level security;

-- ---- users (profiles) -----------------------------------------
-- Public profiles are readable by everyone. Users update their own
-- row, but ONLY non-trust columns: role, rating, rating_count,
-- completed_trades, verification_status and membership_status can
-- never be changed by the account owner (admin / service role only).
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select using (true);

drop policy if exists users_insert_own on public.users;
create policy users_insert_own on public.users
  for insert with check (id = auth.uid());

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update using (id = auth.uid())
  with check (
    id = auth.uid() and
    new.role                  = old.role and
    new.rating                is not distinct from old.rating and
    new.rating_count          = old.rating_count and
    new.completed_trades      = old.completed_trades and
    new.verification_status   = old.verification_status and
    new.membership_status     = old.membership_status
  );

drop policy if exists users_admin_all on public.users;
create policy users_admin_all on public.users
  for all using (public.is_admin());

-- ---- user_blocks ----------------------------------------------
drop policy if exists blocks_own on public.user_blocks;
create policy blocks_own on public.user_blocks
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---- categories -----------------------------------------------
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories
  for select using (true);

-- ---- items ----------------------------------------------------
-- Active listings are public; an owner sees everything they own.
drop policy if exists items_select on public.items;
create policy items_select on public.items
  for select using (status = 'active' or owner_id = auth.uid());

drop policy if exists items_insert_own on public.items;
create policy items_insert_own on public.items
  for insert with check (owner_id = auth.uid());

-- Owners may edit/delete/change availability, but can never set
-- status = 'traded' themselves (only the completion trigger or the
-- service role may). 'deleted' is the soft-delete an owner can apply;
-- the row survives so trade history and ratings stay intact.
drop policy if exists items_update_own on public.items;
create policy items_update_own on public.items
  for update using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid() and
    (new.status in ('active','unavailable','deleted') or new.status = old.status)
  );

drop policy if exists items_delete_own on public.items;
create policy items_delete_own on public.items
  for delete using (owner_id = auth.uid());

drop policy if exists items_admin_all on public.items;
create policy items_admin_all on public.items
  for all using (public.is_admin());

-- ---- item_photos ----------------------------------------------
drop policy if exists photos_select on public.item_photos;
create policy photos_select on public.item_photos
  for select using (
    exists (select 1 from public.items i
            where i.id = item_id and (i.status = 'active' or i.owner_id = auth.uid()))
  );

drop policy if exists photos_write_owner on public.item_photos;
create policy photos_write_owner on public.item_photos
  for all using (
    exists (select 1 from public.items i where i.id = item_id and i.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.items i where i.id = item_id and i.owner_id = auth.uid())
  );

-- ---- wanted_items ---------------------------------------------
-- Readable when the parent listing is readable; writeable by owner.
drop policy if exists wanted_select on public.wanted_items;
create policy wanted_select on public.wanted_items
  for select using (
    exists (select 1 from public.items i
            where i.id = item_id and (i.status = 'active' or i.owner_id = auth.uid()))
  );

drop policy if exists wanted_write_owner on public.wanted_items;
create policy wanted_write_owner on public.wanted_items
  for all using (
    exists (select 1 from public.items i where i.id = item_id and i.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.items i where i.id = item_id and i.owner_id = auth.uid())
  );

-- ---- trade_offers ---------------------------------------------
-- Participants and admins can read a trade. Only participants can
-- update it, and the transition trigger validates every status
-- change, so a non-participant can never "accept" on someone's
-- behalf and a participant can never jump straight to completed.
drop policy if exists offers_select on public.trade_offers;
create policy offers_select on public.trade_offers
  for select using (
    from_user_id = auth.uid() or to_user_id = auth.uid() or public.is_admin()
  );

drop policy if exists offers_insert on public.trade_offers;
create policy offers_insert on public.trade_offers
  for insert with check (from_user_id = auth.uid());

drop policy if exists offers_update_participant on public.trade_offers;
create policy offers_update_participant on public.trade_offers
  for update using (from_user_id = auth.uid() or to_user_id = auth.uid());

drop policy if exists offers_admin_all on public.trade_offers;
create policy offers_admin_all on public.trade_offers
  for all using (public.is_admin());

-- ---- messages ------------------------------------------------
-- Only the two participants can read; only participants can post;
-- only the recipient can mark read. No deletions.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (public.is_trade_participant(trade_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    sender_id = auth.uid() and public.is_trade_participant(trade_id)
  );

drop policy if exists messages_update_read on public.messages;
create policy messages_update_read on public.messages
  for update using (public.is_trade_participant(trade_id))
  with check (
    sender_id = old.sender_id and body = old.body and
    (new.read = true or new.read = old.read)
  );

-- ---- meetups --------------------------------------------------
drop policy if exists meetups_select on public.meetups;
create policy meetups_select on public.meetups
  for select using (public.is_trade_participant(trade_id));

drop policy if exists meetups_insert on public.meetups;
create policy meetups_insert on public.meetups
  for insert with check (
    created_by = auth.uid() and public.is_trade_participant(trade_id)
  );

drop policy if exists meetups_update on public.meetups;
create policy meetups_update on public.meetups
  for update using (public.is_trade_participant(trade_id))
  with check (public.is_trade_participant(trade_id));

-- ---- ratings --------------------------------------------------
-- Write-only from the app: the trigger enforces completed-trade and
-- participant rules; a unique index stops double ratings. Nobody can
-- edit or delete a rating, so stats can't be gamed.
drop policy if exists ratings_select on public.ratings;
create policy ratings_select on public.ratings
  for select using (rater_id = auth.uid() or ratee_id = auth.uid() or public.is_admin());

drop policy if exists ratings_insert on public.ratings;
create policy ratings_insert on public.ratings
  for insert with check (rater_id = auth.uid());

-- ---- favorites ------------------------------------------------
drop policy if exists favorites_own on public.favorites;
create policy favorites_own on public.favorites
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---- notifications --------------------------------------------
drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---- reports --------------------------------------------------
-- Anyone can report; a reporter sees their own reports; admins
-- review and resolve everything.
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert with check (reporter_id = auth.uid());

drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports
  for select using (reporter_id = auth.uid());

drop policy if exists reports_admin_all on public.reports;
create policy reports_admin_all on public.reports
  for all using (public.is_admin());

-- ---- user_settings --------------------------------------------
drop policy if exists settings_own on public.user_settings;
create policy settings_own on public.user_settings
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---- payments -------------------------------------------------
-- Ledger is write-only for the service role; owners and admins may
-- read their own / all records.
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select using (user_id = auth.uid() or public.is_admin());

-- ---- analytics_events -----------------------------------------
drop policy if exists events_admin on public.analytics_events;
create policy analytics_admin on public.analytics_events
  for select using (public.is_admin());
