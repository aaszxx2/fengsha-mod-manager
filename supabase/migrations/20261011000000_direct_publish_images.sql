alter table public.mods add column if not exists cover_path text;
alter table public.mods add column if not exists screenshot_paths text[] not null default '{}';
alter table public.mods alter column status set default 'published';

drop policy if exists "submit as self for review" on public.mods;
drop policy if exists "publish as self" on public.mods;
create policy "publish as self" on public.mods for insert to authenticated
with check (
  owner_id = (select auth.uid()) and
  status = 'published' and
  (storage.foldername(package_path))[1] = (select auth.uid())::text and
  (cover_path is null or (storage.foldername(cover_path))[1] = (select auth.uid())::text) and
  not exists (
    select 1 from unnest(coalesce(screenshot_paths, array[]::text[])) as image_paths(path)
    where (storage.foldername(image_paths.path))[1] <> (select auth.uid())::text
  )
);

update public.mods set status = 'published' where status = 'pending';

update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['application/zip', 'application/x-zip-compressed', 'image/jpeg', 'image/png', 'image/webp']
where id = 'fengsha-mods';

drop policy if exists "read public or own mod packages" on storage.objects;
create policy "read public or own mod packages" on storage.objects for select to anon, authenticated
using (
  bucket_id = 'fengsha-mods' and (
    (storage.foldername(name))[1] = (select auth.uid())::text or
    exists (
      select 1 from public.mods m
      where m.status = 'published' and
        (m.package_path = name or m.cover_path = name or name = any(m.screenshot_paths))
    )
  )
);
