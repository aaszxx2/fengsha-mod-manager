-- 打赏码从「作品级」改为「作者级」
--
-- 之前每个作品都要单独上传一张收款码，作者更新作品时还得再传一次，玩家在作品页
-- 看到的是「这一版作品附带的那张图」。改成挂在作者资料上之后：作者在用户中心上传
-- 一次，他名下的所有作品共用同一张；玩家在任意作品页点「打赏作者」，看到的都是
-- 作者当前设置的收款码。作品表上的 donation_path 保留为历史数据，不再写入。

alter table public.profiles add column if not exists donation_path text;

-- 把已有的作品级打赏码迁到作者资料上（取该作者最新一件作品的）
update public.profiles p
set donation_path = latest.donation_path
from (
  select distinct on (owner_id) owner_id, donation_path
  from public.mods
  where donation_path is not null
  order by owner_id, created_at desc
) as latest
where latest.owner_id = p.id and p.donation_path is null;

-- 作品页只需要知道「这个作品的作者有没有设置收款码」，不需要读取 profiles 的其他字段，
-- 所以用 RPC 返回路径，而不是开放整张 profiles 表。
create or replace function public.get_fengsha_author_donation(p_mod_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.donation_path
  from public.mods m
  join public.profiles p on p.id = m.owner_id
  where m.id = p_mod_id and m.status = 'published';
$$;
revoke all on function public.get_fengsha_author_donation(uuid) from public;
grant execute on function public.get_fengsha_author_donation(uuid) to anon, authenticated;

-- 允许用户更新自己的资料（目前只有 select 策略，用户中心保存收款码会失败）。
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (
  id = (select auth.uid()) and
  (donation_path is null or (storage.foldername(donation_path))[1] = (select auth.uid())::text)
);
grant update on public.profiles to authenticated;

-- 上面的 update 策略允许用户提交任意 is_admin 值，这里用触发器强制它不可变，
-- 否则任何人都能把自己提成管理员。
create or replace function public.protect_fengsha_profile_flags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.is_admin := old.is_admin;
  new.id := old.id;
  return new;
end;
$$;
drop trigger if exists fengsha_protect_profile_flags on public.profiles;
create trigger fengsha_protect_profile_flags before update on public.profiles
for each row execute function public.protect_fengsha_profile_flags();

-- 存储读策略：额外允许读取「有公开作品的作者」的收款码图片。
-- 加这个限定是为了不让任意注册用户的私有图片变成可读。
drop policy if exists "read public or own mod packages" on storage.objects;
create policy "read public or own mod packages" on storage.objects for select to anon, authenticated
using (
  bucket_id = 'fengsha-mods' and (
    (storage.foldername(name))[1] = (select auth.uid())::text or
    exists (
      select 1 from public.mods m where m.status = 'published' and
        (m.package_path = name or m.cover_path = name or m.donation_path = name or name = any(m.screenshot_paths))
    ) or exists (select 1 from public.community_settings s where s.platform_donation_path = name)
    or exists (
      select 1 from public.profiles p
      where p.donation_path = name
        and exists (select 1 from public.mods m2 where m2.owner_id = p.id and m2.status = 'published')
    )
  )
);

-- 删除策略同步保护：被作者资料引用的收款码不允许被清掉
drop policy if exists "remove own unpublished package" on storage.objects;
create policy "remove own unpublished package" on storage.objects for delete to authenticated
using (
  bucket_id = 'fengsha-mods' and (storage.foldername(name))[1] = (select auth.uid())::text and
  not exists (
    select 1 from public.mods m
    where m.package_path = name or m.cover_path = name or m.donation_path = name or name = any(m.screenshot_paths)
  ) and not exists (select 1 from public.community_settings s where s.platform_donation_path = name)
    and not exists (select 1 from public.profiles p where p.donation_path = name)
);
