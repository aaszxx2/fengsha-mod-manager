-- 修复：作者打赏码对匿名访客不可读
--
-- 上一版把判断直接写在存储策略的子查询里：
--   exists (select 1 from public.profiles p where p.donation_path = name and ...)
-- 但策略里的子查询同样受 public.profiles 的行级安全约束，而 profiles 只允许
-- 「本人可读」，匿名访客查不到任何行 —— 于是子查询恒为空，策略永不通过，
-- 作品页永远拿不到作者的收款码。
--
-- 改用一个 security definer 函数来做这个判断：它以函数属主的身份执行，
-- 绕过 profiles 的 RLS，但只对外返回一个布尔值，不泄露任何资料字段。

create or replace function public.is_fengsha_public_tip_image(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.mods m on m.owner_id = p.id and m.status = 'published'
    where p.donation_path = p_name
  );
$$;
revoke all on function public.is_fengsha_public_tip_image(text) from public;
grant execute on function public.is_fengsha_public_tip_image(text) to anon, authenticated;

drop policy if exists "read public or own mod packages" on storage.objects;
create policy "read public or own mod packages" on storage.objects for select to anon, authenticated
using (
  bucket_id = 'fengsha-mods' and (
    (storage.foldername(name))[1] = (select auth.uid())::text or
    exists (
      select 1 from public.mods m where m.status = 'published' and
        (m.package_path = name or m.cover_path = name or m.donation_path = name or name = any(m.screenshot_paths))
    ) or exists (select 1 from public.community_settings s where s.platform_donation_path = name)
    or public.is_fengsha_public_tip_image(name)
  )
);

-- 删除策略同理：必须用同一个函数判断「是否仍被作者资料引用」，
-- 否则匿名判断不到引用关系，用户就能删掉正在被作品页使用的收款码。
drop policy if exists "remove own unpublished package" on storage.objects;
create policy "remove own unpublished package" on storage.objects for delete to authenticated
using (
  bucket_id = 'fengsha-mods' and (storage.foldername(name))[1] = (select auth.uid())::text and
  not exists (
    select 1 from public.mods m
    where m.package_path = name or m.cover_path = name or m.donation_path = name or name = any(m.screenshot_paths)
  ) and not exists (select 1 from public.community_settings s where s.platform_donation_path = name)
    and not public.is_fengsha_public_tip_image(name)
);
