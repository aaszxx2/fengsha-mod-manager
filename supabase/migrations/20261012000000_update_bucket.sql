-- 桌面版更新通道：独立的公共 bucket
--
-- 桌面管理器的自动更新需要「永久不变」的 HTTPS 地址，因此不能复用私有的
-- fengsha-mods bucket（那里的对象走签名 URL，会过期）。这里单独建一个公共
-- bucket，只存放桌面版的更新清单、补丁包和公开的运行时配置。
--
-- 公共 bucket 的对象地址形如：
--   https://<project-ref>.supabase.co/storage/v1/object/public/fengsha-updates/<path>
-- 该地址不需要鉴权、不会过期，适合写进桌面程序。
--
-- 目录约定：
--   api/config.json                     桌面版读取的 Supabase 公开配置
--   updates/windows/latest.json         桌面版更新清单
--   updates/windows/<version>/app-*.zip 只含程序文件的增量补丁包
--
-- 写入权限：不建任何 insert/update 策略，只有 service_role（发布脚本 / CI）
-- 能上传。公开读由 bucket 的 public = true 提供。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fengsha-updates',
  'fengsha-updates',
  true,
  52428800,
  array['application/zip', 'application/json', 'application/octet-stream']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 公共 bucket 的 /object/public/ 路径本身不经过 RLS；这条策略是给
-- 已登录客户端走标准 Storage API 读取时用的，保持行为一致。
drop policy if exists "public read of update packages" on storage.objects;
create policy "public read of update packages" on storage.objects for select to anon, authenticated
using (bucket_id = 'fengsha-updates');

-- 明确不创建写入策略：客户端（含管理员账号）都不能改更新包，
-- 避免有人伪造更新清单把任意可执行文件推给玩家。
drop policy if exists "no client writes to update packages" on storage.objects;
