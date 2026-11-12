-- 作品置顶（管理员）+ 作品下载量统计。
--
-- 置顶：mods 表现有 update 策略只允许 owner 改自己的已发布作品，管理员改别人的作品
-- 会被 RLS 直接拒绝，所以置顶必须走 security definer RPC（函数内以 definer 身份写库，
-- 但在入口显式校验调用者 is_admin）。
--
-- 下载量：下载不需要登录，客户端不能直接 update mods.downloads（会绕过 RLS 或被拒），
-- 因此同样走 security definer RPC，仅对已发布作品自增，并开放给 anon + authenticated。

alter table public.mods add column if not exists pinned_at timestamptz;
alter table public.mods add column if not exists downloads bigint not null default 0;

-- 置顶 / 取消置顶。返回更新后的 pinned_at（取消置顶时为 null）。
create or replace function public.toggle_fengsha_pin(p_mod_id uuid, p_pinned boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_is_admin boolean;
  pinned timestamp with time zone;
begin
  select coalesce(p.is_admin, false) into caller_is_admin
  from public.profiles p where p.id = (select auth.uid());
  if not coalesce(caller_is_admin, false) then
    raise exception 'Only administrators can pin mods';
  end if;
  if not exists (select 1 from public.mods m where m.id = p_mod_id and m.status = 'published') then
    raise exception 'Published mod not found';
  end if;
  pinned := case when p_pinned then now() else null end;
  update public.mods set pinned_at = pinned where id = p_mod_id;
  return pinned;
end;
$$;
revoke all on function public.toggle_fengsha_pin(uuid, boolean) from public, anon;
grant execute on function public.toggle_fengsha_pin(uuid, boolean) to authenticated;

-- 下载量自增。仅统计已发布作品；下载无需登录，因此开放给 anon + authenticated。
create or replace function public.increment_fengsha_download(p_mod_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.mods set downloads = downloads + 1
  where id = p_mod_id and status = 'published';
$$;
revoke all on function public.increment_fengsha_download(uuid) from public;
grant execute on function public.increment_fengsha_download(uuid) to anon, authenticated;
