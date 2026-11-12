-- 玩家互评：回复不再限定「作品作者」，任何登录玩家都能回复评论，形成楼中楼讨论。
-- 原策略（20261012000004）要求回复者必须是作品作者，等于评论区只能作者单方面回应，
-- 玩家之间无法对话。
--
-- 保留的约束：
--   1. 只能以自己身份发言（user_id = auth.uid()）
--   2. 只能评论「已发布」的作品
--   3. 回复的父评论必须属于同一件作品（防止把回复挂到别的作品的评论上）
-- 仍然只支持两级：所有回复都挂在顶层评论下，不做无限嵌套（避免楼层错乱与查询复杂化）。
drop policy if exists "comment on published mods" on public.mod_comments;
create policy "comment on published mods" on public.mod_comments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.mods m where m.id = mod_id and m.status = 'published')
  and (
    parent_id is null
    or exists (select 1 from public.mod_comments pc where pc.id = parent_id and pc.mod_id = mod_id)
  )
);
