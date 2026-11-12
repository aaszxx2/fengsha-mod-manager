-- Blueprint metadata and code are deliberately separate: public lists never return code.
create table public.blueprint_works (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  author text not null,
  category text not null check (category in ('住宅庭院','城池要塞','生产工坊','景观装饰','其他建筑')),
  cover_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index blueprint_works_owner_idx on public.blueprint_works(owner_id);
create index blueprint_works_created_idx on public.blueprint_works(created_at desc);
create table public.blueprint_likes (
  blueprint_id uuid not null references public.blueprint_works(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blueprint_id, user_id)
);
create index blueprint_likes_user_idx on public.blueprint_likes(user_id);
create table public.blueprint_codes (
  blueprint_id uuid primary key references public.blueprint_works(id) on delete cascade,
  code text not null check (char_length(btrim(code)) > 0 and octet_length(code) <= 2097152)
);
alter table public.blueprint_works enable row level security;
alter table public.blueprint_likes enable row level security;
alter table public.blueprint_codes enable row level security;
grant select on public.blueprint_works, public.blueprint_likes to anon, authenticated;
grant insert, update, delete on public.blueprint_works to authenticated;
grant select, insert, update, delete on public.blueprint_codes to authenticated;
grant insert, delete on public.blueprint_likes to authenticated;
revoke all on public.blueprint_codes from anon;

create policy "browse blueprint metadata" on public.blueprint_works for select to anon, authenticated using (true);
create policy "publish own blueprint" on public.blueprint_works for insert to authenticated
with check (owner_id = (select auth.uid()) and (storage.foldername(cover_path))[1] = (select auth.uid())::text);
create policy "edit own blueprint" on public.blueprint_works for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()) and (storage.foldername(cover_path))[1] = (select auth.uid())::text);
create policy "delete own blueprint" on public.blueprint_works for delete to authenticated using (owner_id = (select auth.uid()));
create policy "count blueprint likes" on public.blueprint_likes for select to anon, authenticated using (true);
create policy "like as self" on public.blueprint_likes for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.blueprint_works w where w.id = blueprint_id));
create policy "remove own blueprint like" on public.blueprint_likes for delete to authenticated using (user_id = (select auth.uid()));
create policy "read blueprint code after like" on public.blueprint_codes for select to authenticated
using (
  exists (select 1 from public.blueprint_works w where w.id = blueprint_id and w.owner_id = (select auth.uid()))
  or exists (select 1 from public.blueprint_likes l where l.blueprint_id = blueprint_codes.blueprint_id and l.user_id = (select auth.uid()))
);
create policy "write own blueprint code" on public.blueprint_codes for insert to authenticated
with check (exists (select 1 from public.blueprint_works w where w.id = blueprint_id and w.owner_id = (select auth.uid())));
create policy "edit own blueprint code" on public.blueprint_codes for update to authenticated
using (exists (select 1 from public.blueprint_works w where w.id = blueprint_id and w.owner_id = (select auth.uid())))
with check (exists (select 1 from public.blueprint_works w where w.id = blueprint_id and w.owner_id = (select auth.uid())));
create policy "delete own blueprint code" on public.blueprint_codes for delete to authenticated
using (exists (select 1 from public.blueprint_works w where w.id = blueprint_id and w.owner_id = (select auth.uid())));

-- Invoker rights preserve RLS; metadata + code commit together or both roll back.
create function public.save_fengsha_blueprint(p_id uuid, p_title text, p_description text, p_category text, p_cover text, p_code text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare author_name text;
begin
  if auth.uid() is null then raise exception '请先登录工坊'; end if;
  select username into author_name from public.profiles where id = auth.uid();
  if author_name is null then raise exception '请先完善工坊账号'; end if;
  insert into public.blueprint_works(id, owner_id, title, description, author, category, cover_path)
  values (p_id, auth.uid(), p_title, p_description, author_name, p_category, p_cover)
  on conflict (id) do update set title = excluded.title, description = excluded.description,
    author = excluded.author, category = excluded.category, cover_path = excluded.cover_path, updated_at = now();
  insert into public.blueprint_codes(blueprint_id, code) values (p_id, p_code)
  on conflict (blueprint_id) do update set code = excluded.code;
  return p_id;
end;
$$;
revoke all on function public.save_fengsha_blueprint(uuid,text,text,text,text,text) from public, anon;
grant execute on function public.save_fengsha_blueprint(uuid,text,text,text,text,text) to authenticated;
create policy "read blueprint previews" on storage.objects for select to anon, authenticated
using (bucket_id = 'fengsha-mods' and exists (select 1 from public.blueprint_works w where w.cover_path = name));
