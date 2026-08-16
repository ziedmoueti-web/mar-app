-- =============================================================
-- BADEL — Storage buckets & object policies
--
-- One public bucket for item photos. Readable by everyone (listings
-- are public), writable only by the listing owner. Object keys are
-- namespaced as {owner_id}/{photo-uuid}.ext so ownership can be
-- asserted directly on the path.
-- =============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'item-photos',
  'item-photos',
  true,
  10485760, -- 10 MB, matches the API upload limit
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do nothing;

-- Public read (listings must render for everyone)
drop policy if exists item_photos_public_read on storage.objects;
create policy item_photos_public_read on storage.objects
  for select using (bucket_id = 'item-photos');

-- Only the owner of the listing may upload, replace or delete a photo
drop policy if exists item_photos_owner_write on storage.objects;
create policy item_photos_owner_write on storage.objects
  for insert with check (
    bucket_id = 'item-photos' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists item_photos_owner_update on storage.objects;
create policy item_photos_owner_update on storage.objects
  for update using (
    bucket_id = 'item-photos' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists item_photos_owner_delete on storage.objects;
create policy item_photos_owner_delete on storage.objects
  for delete using (
    bucket_id = 'item-photos' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- =============================================================
-- Note on image optimization
-- The Supabase Image Transformation service (`?width=..&height=..`)
-- is enabled on the public bucket, so the frontend requests
-- thumbnails as `.../photo.jpg?width=480` instead of shipping the
-- original to every client. The original is stored once at upload;
-- the API refuses files above 10 MB and only jpeg/png/webp/avif.
-- =============================================================
