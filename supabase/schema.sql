-- Run once in the Supabase SQL Editor for the project used by the workshop.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(username) between 2 and 24),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

create table if not exists public.mods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  summary text not null check (char_length(summary) between 1 and 180),
  description text not null default '' check (char_length(description) <= 10000),
  version text not null check (char_length(version) between 1 and 32),
  author text not null,
  category text not null check (char_length(category) between 1 and 24),
  compatibility text not null default '' check (char_length(compatibility) <= 120),
  dependencies text not null default '' check (char_length(dependencies) <= 500),
  tags text not null default '' check (char_length(tags) <= 300),
  changelog text not null default '' check (char_length(changelog) <= 500),
  package_path text not null unique,
  package_name text not null check (char_length(package_name) <= 180),
  package_size bigint not null check (package_size between 1 and 52428800),
  cover_path text,
  screenshot_paths text[] not null default '{}',
  status text not null default 'published' check (status in ('pending', 'published', 'rejected')),
  created_at timestamptz not null default now()
);
alter table public.mods add column if not exists cover_path text;
alter table public.mods add column if not exists screenshot_paths text[] not null default '{}';
alter table public.mods alter column status set default 'published';
create index if not exists mods_published_newest on public.mods (created_at desc) where status = 'published';
create index if not exists mods_owner_newest on public.mods (owner_id, created_at desc);

create or replace function public.create_fengsha_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text := trim(coalesce(new.raw_user_meta_data ->> 'username', ''));
begin
  if char_length(wanted) < 2 or char_length(wanted) > 24 then
    wanted := 'player_' || left(replace(new.id::text, '-', ''), 10);
  end if;
  insert into public.profiles (id, username) values (new.id, wanted);
  return new;
end;
$$;
drop trigger if exists fengsha_profile_on_signup on auth.users;
create trigger fengsha_profile_on_signup after insert on auth.users
for each row execute function public.create_fengsha_profile();

alter table public.profiles enable row level security;
alter table public.mods enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated
using (id = (select auth.uid()));

drop policy if exists "published mods and own submissions" on public.mods;
create policy "published mods and own submissions" on public.mods for select to anon, authenticated
using (status = 'published' or owner_id = (select auth.uid()) or coalesce((select is_admin from public.profiles where id = (select auth.uid())), false));

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

drop policy if exists "review mods as admin" on public.mods;
create policy "review mods as admin" on public.mods for update to authenticated
using (coalesce((select is_admin from public.profiles where id = (select auth.uid())), false))
with check (coalesce((select is_admin from public.profiles where id = (select auth.uid())), false));

drop policy if exists "remove own unpublished submission" on public.mods;
create policy "remove own unpublished submission" on public.mods for delete to authenticated
using (owner_id = (select auth.uid()) and status in ('pending', 'rejected'));

grant select on public.profiles to authenticated;
grant select on public.mods to anon, authenticated;
grant insert, update, delete on public.mods to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fengsha-mods', 'fengsha-mods', false, 52428800, array['application/zip', 'application/x-zip-compressed', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "upload to own folder" on storage.objects;
create policy "upload to own folder" on storage.objects for insert to authenticated
with check (bucket_id = 'fengsha-mods' and (storage.foldername(name))[1] = (select auth.uid())::text);

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

drop policy if exists "remove own unpublished package" on storage.objects;
create policy "remove own unpublished package" on storage.objects for delete to authenticated
using (
  bucket_id = 'fengsha-mods' and
  (storage.foldername(name))[1] = (select auth.uid())::text and
  not exists (select 1 from public.mods m where m.package_path = name)
);

-- After registering your own account, promote it once from the SQL Editor:
-- update public.profiles set is_admin = true where id = (select id from auth.users where email = 'YOUR_EMAIL');

-- Add community interactions, creator updates, and opt-in donation codes.
alter table public.mods add column if not exists donation_path text;

drop policy if exists "publish as self" on public.mods;
create policy "publish as self" on public.mods for insert to authenticated
with check (
  owner_id = (select auth.uid()) and status = 'published' and
  (storage.foldername(package_path))[1] = (select auth.uid())::text and
  (cover_path is null or (storage.foldername(cover_path))[1] = (select auth.uid())::text) and
  (donation_path is null or (storage.foldername(donation_path))[1] = (select auth.uid())::text) and
  not exists (
    select 1 from unnest(coalesce(screenshot_paths, array[]::text[])) as image_paths(path)
    where (storage.foldername(image_paths.path))[1] <> (select auth.uid())::text
  )
);

drop policy if exists "update own published mod" on public.mods;
create policy "update own published mod" on public.mods for update to authenticated
using (owner_id = (select auth.uid()) and status = 'published')
with check (
  owner_id = (select auth.uid()) and status = 'published' and
  (storage.foldername(package_path))[1] = (select auth.uid())::text and
  (cover_path is null or (storage.foldername(cover_path))[1] = (select auth.uid())::text) and
  (donation_path is null or (storage.foldername(donation_path))[1] = (select auth.uid())::text) and
  not exists (
    select 1 from unnest(coalesce(screenshot_paths, array[]::text[])) as image_paths(path)
    where (storage.foldername(image_paths.path))[1] <> (select auth.uid())::text
  )
);

create table if not exists public.mod_comments (
  id uuid primary key default gen_random_uuid(),
  mod_id uuid not null references public.mods(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null default '',
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists mod_comments_recent on public.mod_comments (mod_id, created_at desc);

create or replace function public.set_fengsha_comment_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select p.username into new.display_name from public.profiles p where p.id = (select auth.uid());
  if new.display_name is null then raise exception 'A valid workshop account is required'; end if;
  return new;
end;
$$;
drop trigger if exists fengsha_comment_author on public.mod_comments;
create trigger fengsha_comment_author before insert on public.mod_comments
for each row execute function public.set_fengsha_comment_author();

alter table public.mod_comments enable row level security;
drop policy if exists "read published mod comments" on public.mod_comments;
create policy "read published mod comments" on public.mod_comments for select to anon, authenticated
using (exists (select 1 from public.mods m where m.id = mod_id and m.status = 'published'));
drop policy if exists "comment on published mods" on public.mod_comments;
create policy "comment on published mods" on public.mod_comments for insert to authenticated
with check (
  user_id = (select auth.uid()) and
  exists (select 1 from public.mods m where m.id = mod_id and m.status = 'published')
);
drop policy if exists "delete own mod comments" on public.mod_comments;
create policy "delete own mod comments" on public.mod_comments for delete to authenticated
using (user_id = (select auth.uid()));
grant select on public.mod_comments to anon, authenticated;
grant insert, delete on public.mod_comments to authenticated;

create table if not exists public.mod_reactions (
  mod_id uuid not null references public.mods(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('like', 'favorite')),
  created_at timestamptz not null default now(),
  primary key (mod_id, user_id, kind)
);
alter table public.mod_reactions enable row level security;
revoke all on public.mod_reactions from anon, authenticated;

create or replace function public.get_fengsha_community(p_mod_id uuid)
returns table (likes bigint, favorites bigint, comments bigint, liked boolean, favorited boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.mod_reactions r where r.mod_id = m.id and r.kind = 'like'),
    (select count(*) from public.mod_reactions r where r.mod_id = m.id and r.kind = 'favorite'),
    (select count(*) from public.mod_comments c where c.mod_id = m.id),
    exists (select 1 from public.mod_reactions r where r.mod_id = m.id and r.user_id = (select auth.uid()) and r.kind = 'like'),
    exists (select 1 from public.mod_reactions r where r.mod_id = m.id and r.user_id = (select auth.uid()) and r.kind = 'favorite')
  from public.mods m where m.id = p_mod_id and m.status = 'published';
$$;
revoke all on function public.get_fengsha_community(uuid) from public;
grant execute on function public.get_fengsha_community(uuid) to anon, authenticated;

create or replace function public.toggle_fengsha_reaction(p_mod_id uuid, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  is_active boolean;
begin
  if current_user_id is null then raise exception 'Sign in to like or save a mod'; end if;
  if p_kind not in ('like', 'favorite') then raise exception 'Invalid reaction'; end if;
  if not exists (select 1 from public.mods m where m.id = p_mod_id and m.status = 'published') then
    raise exception 'Published mod not found';
  end if;
  delete from public.mod_reactions r where r.mod_id = p_mod_id and r.user_id = current_user_id and r.kind = p_kind;
  if found then return false; end if;
  insert into public.mod_reactions (mod_id, user_id, kind) values (p_mod_id, current_user_id, p_kind)
  on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.toggle_fengsha_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_fengsha_reaction(uuid, text) to authenticated;

create table if not exists public.community_settings (
  id smallint primary key check (id = 1),
  platform_donation_path text
);
insert into public.community_settings (id, platform_donation_path) values (1, null) on conflict (id) do nothing;
alter table public.community_settings enable row level security;
drop policy if exists "read community settings" on public.community_settings;
create policy "read community settings" on public.community_settings for select to anon, authenticated using (true);
drop policy if exists "admin updates community settings" on public.community_settings;
create policy "admin updates community settings" on public.community_settings for update to authenticated
using (coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false))
with check (
  coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false) and
  (platform_donation_path is null or (storage.foldername(platform_donation_path))[1] = (select auth.uid())::text)
);
grant select on public.community_settings to anon, authenticated;
grant update on public.community_settings to authenticated;

drop policy if exists "read public or own mod packages" on storage.objects;
create policy "read public or own mod packages" on storage.objects for select to anon, authenticated
using (
  bucket_id = 'fengsha-mods' and (
    (storage.foldername(name))[1] = (select auth.uid())::text or
    exists (
      select 1 from public.mods m where m.status = 'published' and
        (m.package_path = name or m.cover_path = name or m.donation_path = name or name = any(m.screenshot_paths))
    ) or exists (select 1 from public.community_settings s where s.platform_donation_path = name)
  )
);

drop policy if exists "remove own unpublished package" on storage.objects;
create policy "remove own unpublished package" on storage.objects for delete to authenticated
using (
  bucket_id = 'fengsha-mods' and (storage.foldername(name))[1] = (select auth.uid())::text and
  not exists (
    select 1 from public.mods m where m.package_path = name or m.cover_path = name or m.donation_path = name or name = any(m.screenshot_paths)
  ) and not exists (select 1 from public.community_settings s where s.platform_donation_path = name)
);

