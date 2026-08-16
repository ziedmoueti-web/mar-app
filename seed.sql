-- =============================================================
-- BADEL — demo seed data (fictional users & listings)
--
-- Run automatically by `supabase db reset` after the migrations.
-- All names, places and listings are fictional demo content.
-- Passwords are demo-only: demo@badel.tn / badel-demo,
-- admin@badel.tn / badel-admin.
-- =============================================================

create extension if not exists pgcrypto;

-- ---- Categories ----------------------------------------------
insert into public.categories (slug, name, icon, sort_order) values
  ('phones',      'Phones & Tablets',      '📱', 0),
  ('gaming',      'Gaming',                '🎮', 1),
  ('computers',   'Computers & Laptops',   '💻', 2),
  ('cameras',     'Cameras & Photo',       '📷', 3),
  ('audio',       'Audio & Headphones',    '🎧', 4),
  ('television',  'TV & Home Cinema',      '📺', 5),
  ('bicycles',    'Bicycles & Scooters',   '🚲', 6),
  ('furniture',   'Furniture',             '🪑', 7),
  ('appliances',  'Home Appliances',       '🔌', 8),
  ('fashion',     'Fashion & Accessories', '🧥', 9),
  ('watches',     'Watches & Jewellery',   '⌚', 10),
  ('books',       'Books & Media',         '📚', 11),
  ('instruments', 'Instruments',           '🎸', 12),
  ('sports',      'Sports & Outdoors',     '⚽', 13),
  ('toys',        'Toys & Kids',           '🧸', 14),
  ('tools',       'Tools & DIY',           '🛠️', 15),
  ('other',       'Other',                 '📦', 16)
on conflict (slug) do nothing;

-- ---- Demo users ----------------------------------------------
-- auth.users + identities so the accounts can sign in via Supabase
-- Auth, then public.users profiles with trust fields.
do $$
declare
  u_demo   uuid := gen_random_uuid();
  u_ahmed  uuid := gen_random_uuid();
  u_sara   uuid := gen_random_uuid();
  u_karim  uuid := gen_random_uuid();
  u_yasmine uuid := gen_random_uuid();
  u_zied   uuid := gen_random_uuid();
  u_imen   uuid := gen_random_uuid();
  u_oussama uuid := gen_random_uuid();
  u_rim    uuid := gen_random_uuid();
  u_mehdi  uuid := gen_random_uuid();
  u_admin  uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token,
                          email_change_token_new, email_change)
  values
    (u_demo,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo@badel.tn',   crypt('badel-demo',  gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"username":"demo"}',   now(), now(), '', '', '', ''),
    (u_ahmed,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ahmed@badel.tn',  crypt('badel-demo',  gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"username":"ahmed"}',  now(), now(), '', '', '', ''),
    (u_sara,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sara@badel.tn',   crypt('badel-demo',  gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"username":"sara"}',   now(), now(), '', '', '', ''),
    (u_karim,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'karim@badel.tn',  crypt('badel-demo',  gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"username":"karim"}',  now(), now(), '', '', '', ''),
    (u_yasmine,'00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'yasmine@badel.tn',crypt('badel-demo',  gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"username":"yasmine"}',now(), now(), '', '', '', ''),
    (u_zied,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zied@badel.tn',   crypt('badel-demo',  gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"username":"zied"}',   now(), now(), '', '', '', ''),
    (u_imen,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'imen@badel.tn',   crypt('badel-demo',  gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"username":"imen"}',   now(), now(), '', '', '', ''),
    (u_oussama,'00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'oussama@badel.tn',crypt('badel-demo',  gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"username":"oussama"}',now(), now(), '', '', '', ''),
    (u_rim,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rim@badel.tn',    crypt('badel-demo',  gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"username":"rim"}',    now(), now(), '', '', '', ''),
    (u_mehdi,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mehdi@badel.tn',  crypt('badel-demo',  gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"username":"mehdi"}',  now(), now(), '', '', '', ''),
    (u_admin,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@badel.tn',  crypt('badel-admin', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"username":"admin"}',  now(), now(), '', '', '', '')
  on conflict (email) do nothing;

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), id, id::text,
         jsonb_build_object('sub', id::text, 'email', email),
         'email', now(), now(), now()
  from auth.users where email in ('demo@badel.tn','ahmed@badel.tn','sara@badel.tn','karim@badel.tn',
    'yasmine@badel.tn','zied@badel.tn','imen@badel.tn','oussama@badel.tn','rim@badel.tn','mehdi@badel.tn','admin@badel.tn')
  on conflict (provider_id, provider) do nothing;

  insert into public.users (id, username, display_name, bio, location, latitude, longitude,
                            rating, rating_count, completed_trades, verification_status, membership_status, role, onboarded, created_at)
  values
    (u_demo,   'demo',   'Demo User',        'Demo account to explore BADEL. Trading my Switch for your camera gear.', 'Tunis',      36.8065, 10.1815, 4.6,  3, 2,  'verified', 'verified', 'user',  true,  now() - interval '6 months'),
    (u_ahmed,  'ahmed',  'Ahmed Ben Salah',  'Photographer and gamer. Looking for a PS5 or a new lens.',              'Megrine',    36.7672, 10.2292, 4.8, 12, 8,  'verified', 'verified', 'user',  true,  now() - interval '11 months'),
    (u_sara,   'sara',   'Sara Mansouri',    'Cyclist & bookworm. My bike is my everything.',                           'La Marsa',   36.8772, 10.3256, 4.9,  9, 6,  'verified', 'premium',  'user',  true,  now() - interval '14 months'),
    (u_karim,  'karim',  'Karim Trabelsi',   'Tech enthusiast. Always trading up.',                                     'Ben Arous',  36.7536, 10.2224, 4.4,  5, 3,  'verified', 'free',     'user',  true,  now() - interval '8 months'),
    (u_yasmine,'yasmine','Yasmine Gharbi',   'Interior design student. Furniture and fashion.',                         'Ariana',     36.8625, 10.1955, 4.7,  7, 4,  'verified', 'free',     'user',  true,  now() - interval '10 months'),
    (u_zied,   'zied',   'Zied Bouazizi',    'Gaming setup collector. PS5 up for the right trade.',                     'Tunis',      36.8065, 10.1815, 4.5,  4, 2,  'unverified','free',    'user',  true,  now() - interval '5 months'),
    (u_imen,   'imen',   'Imen Kallel',      'Music teacher. Trading instruments and books.',                           'Carthage',   36.8616, 10.3305, null, 0, 0,  'unverified','free',    'user',  true,  now() - interval '2 months'),
    (u_oussama,'oussama','Oussama Haddad',   'Drone pilot. Electronics in, electronics out.',                          'Nabeul',     36.4563, 10.7352, 4.3,  3, 2,  'unverified','free',    'user',  true,  now() - interval '4 months'),
    (u_rim,    'rim',    'Rim Jaziri',       'Home cook. Kitchen gear swap specialist.',                                'Hammamet',   36.4043, 10.5058, 4.6,  6, 4,  'verified', 'verified', 'user',  true,  now() - interval '9 months'),
    (u_mehdi,  'mehdi',  'Mehdi Chaabane',   'Watch collector. Trading my way to a nicer Seiko.',                       'Sousse',     35.8256, 10.6084, 4.2,  2, 1,  'unverified','free',    'user',  true,  now() - interval '3 months'),
    (u_admin,  'admin',  'Badel Admin',      'Marketplace administrator.',                                              'Tunis',      36.8065, 10.1815, null, 0, 0,  'verified', 'premium',  'admin', true,  now() - interval '12 months')
  on conflict (username) do nothing;
end $$;

-- ---- Items, photos, wanted lists ------------------------------
-- Demo photos are placeholder SVG paths inside the item-photos
-- bucket; the seed assets are generated by the dev tooling.
do $$
declare
  c  record;
  u  record;
  i  uuid;
  t1 uuid; t3 uuid; t4 uuid; t6 uuid; t7 uuid; t8 uuid;
begin
  for c in select * from public.categories loop
    -- Zied's PS5 — wants iPhone / gaming laptop / bicycle
    if c.slug = 'gaming' then
      select id into u from public.users where username = 'zied';
      insert into public.items (owner_id, title, description, category_id, condition, status, location, latitude, longitude, value_min, value_max) values
        (u.id, 'PlayStation 5 — Disc Edition', 'PS5 disc edition with one DualSense controller, HDMI and power cables. Bought in 2023, played lightly, kept in a dust-free cabinet. Looking for a fair swap — phone, gaming laptop or a good bicycle.', c.id, 'like_new', 'active', 'Tunis', 36.8065, 10.1815, 2200, 2500)
      returning id into i;
      insert into public.item_photos (item_id, storage_path, thumb_path, sort_order) values (i, 'item-photos/zied/ps5-1.svg', 'item-photos/zied/ps5-1.svg', 0);
      insert into public.wanted_items (user_id, item_id, wanted_category_id, wanted_keywords)
        select u.id, i, id, 'iPhone 13, iPhone 14, Samsung S23' from public.categories where slug = 'phones';
      insert into public.wanted_items (user_id, item_id, wanted_category_id, wanted_keywords)
        select u.id, i, id, 'gaming laptop, MacBook' from public.categories where slug = 'computers';
      insert into public.wanted_items (user_id, item_id, wanted_category_id, wanted_keywords)
        select u.id, i, id, 'mountain bike, road bike' from public.categories where slug = 'bicycles';
    end if;

    -- Ahmed's iPhone 13 — perfect match with Zied's PS5
    if c.slug = 'phones' then
      select id into u from public.users where username = 'ahmed';
      insert into public.items (owner_id, title, description, category_id, condition, status, location, latitude, longitude, value_min, value_max) values
        (u.id, 'iPhone 13 — 128GB Midnight', 'iPhone 13 in excellent condition. Battery health 89%. Always had a case and screen protector. Includes original box and a new cable. Face ID works perfectly. Swapping for a PS5 or camera gear.', c.id, 'good', 'active', 'Megrine', 36.7672, 10.2292, 1800, 2100)
      returning id into i;
      insert into public.item_photos (item_id, storage_path, thumb_path, sort_order) values (i, 'item-photos/ahmed/iphone13-1.svg', 'item-photos/ahmed/iphone13-1.svg', 0);
      insert into public.wanted_items (user_id, item_id, wanted_category_id, wanted_keywords)
        select u.id, i, id, 'PS5, Xbox Series X, Nintendo Switch' from public.categories where slug = 'gaming';
      insert into public.wanted_items (user_id, item_id, wanted_category_id, wanted_keywords)
        select u.id, i, id, 'mirrorless camera, DSLR, lens' from public.categories where slug = 'cameras';
    end if;

    -- Sara's bicycle
    if c.slug = 'bicycles' then
      select id into u from public.users where username = 'sara';
      insert into public.items (owner_id, title, description, category_id, condition, status, location, latitude, longitude, value_min, value_max) values
        (u.id, 'Giant Escape 3 — City Bicycle', 'Giant Escape 3 hybrid bike, size M. Recently serviced, new brake pads and tyres. Perfect for commuting around La Marsa. Includes a U-lock and front light.', c.id, 'good', 'active', 'La Marsa', 36.8772, 10.3256, 900, 1100)
      returning id into i;
      insert into public.item_photos (item_id, storage_path, thumb_path, sort_order) values (i, 'item-photos/sara/bike-1.svg', 'item-photos/sara/bike-1.svg', 0);
      insert into public.wanted_items (user_id, item_id, wanted_category_id, wanted_keywords)
        select u.id, i, id, 'design books, novels' from public.categories where slug = 'books';
      insert into public.wanted_items (user_id, item_id, wanted_category_id, wanted_keywords)
        select u.id, i, id, 'headphones, speaker' from public.categories where slug = 'audio';
    end if;

    -- Demo's Nintendo Switch
    if c.slug = 'gaming' and exists (select 1 from public.users where username = 'demo') then
      select id into u from public.users where username = 'demo';
      insert into public.items (owner_id, title, description, category_id, condition, status, location, latitude, longitude, value_min, value_max) values
        (u.id, 'Nintendo Switch — OLED', 'Nintendo Switch OLED white with two Joy-Cons, dock, and 3 games (Mario Kart 8, Zelda BOTW, Smash). Barely used.', c.id, 'like_new', 'active', 'Tunis', 36.8065, 10.1815, 1400, 1600)
      returning id into i;
      insert into public.item_photos (item_id, storage_path, thumb_path, sort_order) values (i, 'item-photos/demo/switch-1.svg', 'item-photos/demo/switch-1.svg', 0);
      insert into public.wanted_items (user_id, item_id, wanted_category_id, wanted_keywords)
        select u.id, i, id, 'camera, DSLR, mirrorless' from public.categories where slug = 'cameras';
      insert into public.wanted_items (user_id, item_id, wanted_category_id, wanted_keywords)
        select u.id, i, id, 'tablet, iPad' from public.categories where slug = 'phones';
    end if;
  end loop;

  -- ---- Trade history (fictional) ------------------------------
  -- Pending: Ahmed offers his iPhone for Demo's Switch
  insert into public.trade_offers (from_user_id, to_user_id, offered_item_id, requested_item_id, message, status, created_at)
  select a.id, d.id, ip.id, sw.id,
         'Salam! Would you trade your Switch OLED for my iPhone 13? Battery is at 89% and it is in great shape.',
         'pending', now() - interval '1 day'
  from public.users a, public.users d, public.items ip, public.items sw
  where a.username='ahmed' and d.username='demo' and ip.title like 'iPhone 13%' and sw.title like 'Nintendo Switch%';

  -- Meetup stage: Ahmed's Canon for Demo's Switch
  insert into public.trade_offers (from_user_id, to_user_id, offered_item_id, requested_item_id, message, status, created_at, accepted_at)
  select a.id, d.id, ca.id, sw.id,
         'My Canon DSLR kit for your Switch OLED — what do you think?',
         'meetup', now() - interval '6 days', now() - interval '5 days'
  from public.users a, public.users d, public.items ca, public.items sw
  where a.username='ahmed' and d.username='demo' and ca.title like 'Canon EOS%' and sw.title like 'Nintendo Switch%';

  -- Completed: Karim's monitor for Demo's Switch (with ratings)
  insert into public.trade_offers (from_user_id, to_user_id, offered_item_id, requested_item_id, message, status, created_at, accepted_at, completed_at, from_exchange_confirmed, to_exchange_confirmed)
  select k.id, d.id, mo.id, sw.id, 'My LG monitor for your Switch?',
         'completed', now() - interval '40 days', now() - interval '38 days', now() - interval '30 days', true, true
  from public.users k, public.users d, public.items mo, public.items sw
  where k.username='karim' and d.username='demo' and mo.title like '27" 144Hz%' and sw.title like 'Nintendo Switch%'
  returning id into t4;

  insert into public.ratings (trade_id, rater_id, ratee_id, reliability, communication, item_accuracy, overall, comment)
  select t4, (select id from public.users where username='karim'), (select id from public.users where username='demo'), 5,5,5,5, 'Super smooth trade, item exactly as described.'
  where t4 is not null;
  insert into public.ratings (trade_id, rater_id, ratee_id, reliability, communication, item_accuracy, overall, comment)
  select t4, (select id from public.users where username='demo'), (select id from public.users where username='karim'), 4,5,5,5, 'Reliable, showed up on time.'
  where t4 is not null;
end $$;
