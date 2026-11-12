-- 0.2.4：作者控制台（评论回复、作品统计、头像、删除已发布作品）
--
-- 四件事：
-- 1. 评论支持作者回复：parent_id 自引用，只有作品作者能写回复
-- 2. 头像：profiles.avatar_path + 公开 bucket fengsha-avatars；评论表冗余快照
-- 3. mods.updated_at：作品表格需要「更新时间」，置顶和下载计数不算更新
-- 4. 作者控制台：作品统计 RPC（收藏/点赞/评论前端读不到，必须走 security definer）
--    并允许作者删除自己的已发布作品（现有策略只允许删未发布的）

-- ---------------------------------------------------------------- 1. 评论回复
alter table public.mod_comments
  add column if not exists parent_id uuid references public.mod_comments(id) on delete cascade;
create index if not exists mod_comments_parent on public.mod_comments (parent_id) where parent_id is not null;

-- 重建插入策略：顶层评论任何登录用户可发；回复只有作品作者可发，且父评论必须属于同一作品
drop policy if exists "comment on published mods" on public.mod_comments;
create policy "comment on published mods" on public.mod_comments for insert to authenticated
with check (
  user_id = (select auth.uid()) and
  exists (select 1 from public.mods m where m.id = mod_id and m.status = 'published') and
  (
    parent_id is null
    or (
      exists (select 1 from public.mods m where m.id = mod_id and m.owner_id = (select auth.uid()))
      and exists (select 1 from public.mod_comments pc where pc.id = parent_id and pc.mod_id = mod_id)
    )
  )
);

-- ---------------------------------------------------------------- 2. 头像
alter table public.profiles add column if not exists avatar_path text;
alter table public.mod_comments add column if not exists avatar_path text;

-- 触发器同时写入昵称与头像快照。
-- 头像做成快照（而不是查询时 join profiles）是有意的：profiles 的 RLS 只允许本人读自己那一行，
-- 匿名访客查不到作者资料，join 会让评论区所有人的头像都变成空。
create or replace function public.set_fengsha_comment_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select p.username, p.avatar_path into new.display_name, new.avatar_path
    from public.profiles p where p.id = (select auth.uid());
  if new.display_name is null then raise exception 'A valid workshop account is required'; end if;
  return new;
end;
$$;

-- 公开头像 bucket：头像要展示在评论区给所有人看，私有 bucket 会让匿名访客拿不到图
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fengsha-avatars', 'fengsha-avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "upload own avatar" on storage.objects;
create policy "upload own avatar" on storage.objects for insert to authenticated
with check (bucket_id = 'fengsha-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "update own avatar" on storage.objects;
create policy "update own avatar" on storage.objects for update to authenticated
using (bucket_id = 'fengsha-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'fengsha-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "remove own avatar" on storage.objects;
create policy "remove own avatar" on storage.objects for delete to authenticated
using (bucket_id = 'fengsha-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------- 3. 作品更新时间
alter table public.mods add column if not exists updated_at timestamptz;
update public.mods set updated_at = created_at where updated_at is null;
alter table public.mods alter column updated_at set default now();
alter table public.mods alter column updated_at set not null;

-- 只有内容字段变化才算一次「更新」；置顶、下载计数、管理员标记都不应该刷新这个时间
create or replace function public.touch_fengsha_mod_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.title is distinct from old.title
     or new.summary is distinct from old.summary
     or new.description is distinct from old.description
     or new.version is distinct from old.version
     or new.package_path is distinct from old.package_path
     or new.cover_path is distinct from old.cover_path
     or new.screenshot_paths is distinct from old.screenshot_paths
     or new.changelog is distinct from old.changelog then
    new.updated_at = now();
  else
    new.updated_at = old.updated_at;
  end if;
  return new;
end;
$$;
drop trigger if exists fengsha_mod_touch on public.mods;
create trigger fengsha_mod_touch before update on public.mods
for each row execute function public.touch_fengsha_mod_updated_at();

-- ---------------------------------------------------------------- 4. 作者控制台
-- mod_reactions 是 revoke all，mod_comments 的 RLS 也拦住了跨用户统计，
-- 所以作者自己的作品要带互动数据就必须走 security definer。
create or replace function public.get_fengsha_author_works()
returns table (
  id uuid, owner_id uuid, title text, summary text, description text, version text,
  author text, category text, status text, created_at timestamptz, updated_at timestamptz,
  package_size bigint, package_name text, package_path text, cover_path text,
  screenshot_paths text[], donation_path text, compatibility text, dependencies text,
  tags text, changelog text, pinned_at timestamptz, downloads bigint,
  likes bigint, favorites bigint, comments bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id, m.owner_id, m.title, m.summary, m.description, m.version,
    m.author, m.category, m.status, m.created_at, m.updated_at,
    m.package_size, m.package_name, m.package_path, m.cover_path,
    m.screenshot_paths, m.donation_path, m.compatibility, m.dependencies,
    m.tags, m.changelog, m.pinned_at, m.downloads,
    (select count(*) from public.mod_reactions r where r.mod_id = m.id and r.kind = 'like'),
    (select count(*) from public.mod_reactions r where r.mod_id = m.id and r.kind = 'favorite'),
    (select count(*) from public.mod_comments c where c.mod_id = m.id)
  from public.mods m
  where m.owner_id = (select auth.uid())
  order by m.created_at desc;
$$;
revoke all on function public.get_fengsha_author_works() from public;
-- Supabase 默认把 public schema 里新函数的 EXECUTE 授给 anon/authenticated，
-- 只 revoke PUBLIC 撤不掉 anon，必须显式点名。
revoke all on function public.get_fengsha_author_works() from anon;
grant execute on function public.get_fengsha_author_works() to authenticated;

-- 允许作者删除自己的已发布作品（现有 "remove own unpublished submission" 只覆盖未发布的）
drop policy if exists "delete own published mod" on public.mods;
create policy "delete own published mod" on public.mods for delete to authenticated
using (owner_id = (select auth.uid()));

-- 删除作品前要先删掉它在 storage 里的文件，此时 mods 行还在，所以按引用关系放行
drop policy if exists "remove own work files" on storage.objects;
create policy "remove own work files" on storage.objects for delete to authenticated
using (
  bucket_id = 'fengsha-mods' and
  (storage.foldername(name))[1] = (select auth.uid())::text and
  exists (
    select 1 from public.mods m
    where m.owner_id = (select auth.uid())
      and (
        m.package_path = name or m.cover_path = name or m.donation_path = name
        or name = any(m.screenshot_paths)
      )
  )
);
