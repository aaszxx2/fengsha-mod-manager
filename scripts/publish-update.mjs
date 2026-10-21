#!/usr/bin/env node
// 把桌面版更新包发布到 Supabase Storage 的公共 bucket（fengsha-updates）。
//
// 用法：
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service_role key> \
//   node scripts/publish-update.mjs
//
// 可选参数：
//   --dry-run   只打印将要上传的内容，不实际请求
//   --version x.y.z  指定版本（默认取 package.json 的 version）
//
// 前置：先跑 `npm run desktop:release`，它会生成
//   public/updates/windows/<version>/app-<sha16>.zip
//
// 为什么用 service_role：bucket 没有开放任何写入策略，只有 service_role 能上传。
// 这个 key 只能存在于本机环境变量或 CI secret 中，绝不能写进前端代码或提交进仓库。

import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const versionArgIndex = args.indexOf('--version')

// 先读项目根目录的 .env.local（已在 .gitignore 中）。
// service_role 属于高权限密钥，放进这个文件可以避免出现在命令行历史或对话记录里。
// 已存在的真实环境变量优先，不会被文件覆盖。
try {
  const envText = (await readFile(path.join(root, '.env.local'), 'utf8')).replace(/^\uFEFF/, '')
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (value.length > 1 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1)
    }
    if (key && !process.env[key]) process.env[key] = value
  }
} catch {
  // 没有 .env.local 就只依赖环境变量
}

const BUCKET = 'fengsha-updates'
const MANIFEST_PATH = 'updates/windows/latest.json'
const CONFIG_PATH = 'api/config.json'
const MOD_BUCKET = 'fengsha-mods'

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const version = versionArgIndex >= 0 ? args[versionArgIndex + 1] : pkg.version
if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw new Error(`无效版本号：${version}`)

const releaseDirectory = path.join(root, 'public', 'updates', 'windows', version)
const entries = await readdir(releaseDirectory).catch(() => {
  throw new Error(`找不到 ${releaseDirectory}，请先运行 npm run desktop:release`)
})
const packageName = entries.find(name => /^app-[a-f\d]{16}\.zip$/.test(name))
if (!packageName) throw new Error(`${releaseDirectory} 下没有 app-<sha16>.zip`)

const packageBytes = await readFile(path.join(releaseDirectory, packageName))
const sha256 = createHash('sha256').update(packageBytes).digest('hex')
if (packageName !== `app-${sha256.slice(0, 16)}.zip`) {
  throw new Error(`补丁包文件名与内容哈希不一致：${packageName} vs ${sha256.slice(0, 16)}`)
}

// 相对路径：桌面版用 new URL(release.url, manifestUrl) 解析，
// manifest 位于 .../fengsha-updates/updates/windows/latest.json，
// 因此 "<version>/<file>.zip" 会解析到同一 bucket 的对应目录下。
const manifest = {
  version,
  url: `${version}/${packageName}`,
  // 自动更新走「下载安装包 + 静默安装」，所以清单必须带上安装包地址。
  // 它指向 GitHub Release，因此发布顺序是：先发 Release（含 Setup.exe），再跑本脚本 ——
  // 否则玩家点更新会下到 404。下面会做一次可达性检查兜底。
  installerUrl: `https://github.com/aaszxx2/fengsha-mod-manager/releases/download/v${version}/Fengsha-Mod-Manager-Setup.exe`,
  size: packageBytes.length,
  sha256,
  releaseNotes: JSON.parse(
    await readFile(path.join(root, 'public', 'updates', 'windows', 'latest.json'), 'utf8')
  ).releaseNotes
}

// 安装包哈希：客户端下载完会比对，避免被本地代理或中间人替换。
// 本地没有安装包时（例如只重发增量包）就跳过，清单不带该字段，客户端也会跳过校验。
const installerPath = path.join(root, 'release-installer', `Fengsha-Mod-Manager-Setup-${version}.exe`)
try {
  const installerBytes = await readFile(installerPath)
  manifest.installerSha256 = createHash('sha256').update(installerBytes).digest('hex')
  manifest.installerSize = installerBytes.length
  console.log(`  安装包哈希：${manifest.installerSha256.slice(0, 16)}… · ${(installerBytes.length / 1024 / 1024).toFixed(1)} MB`)
} catch {
  console.warn(`  ⚠️ 本地没有 ${path.basename(installerPath)}，清单不带 installerSha256（客户端跳过哈希校验）`)
}

// 清单里的安装包地址必须真的能下载，否则玩家点更新只会拿到 404
if (!dryRun) {
  try {
    const probe = await fetch(manifest.installerUrl, { method: 'HEAD', redirect: 'follow' })
    if (!probe.ok) console.warn(`  ⚠️ 安装包地址暂时不可达（HTTP ${probe.status}）：${manifest.installerUrl}\n     请确认 v${version} 的 Release 已经发布并上传了 Fengsha-Mod-Manager-Setup.exe`)
    else console.log(`  安装包地址可达：HTTP ${probe.status}`)
  } catch (error) {
    console.warn(`  ⚠️ 安装包地址检查失败：${error.message}`)
  }
}

// 把最终清单（含安装包哈希）写回本地：站点镜像和源码提交都以这份为准。
// 之前只上传不写回，导致站点上的镜像清单缺少 installerSha256。
if (!dryRun) {
  await writeFile(path.join(root, 'public', 'updates', 'windows', 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

const runtimeConfig = {
  supabaseUrl,
  publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
  bucket: MOD_BUCKET,
  // 分享链接的落地域名。换托管域名时改这里重新发布即可，不用重建桌面版。
  workshopUrl: (process.env.WORKSHOP_URL || '').replace(/\/*$/, '/') || undefined
}

if (!runtimeConfig.publishableKey) {
  throw new Error('缺少 SUPABASE_PUBLISHABLE_KEY（桌面版读配置时要用）')
}
if (!dryRun && (!supabaseUrl || !serviceRoleKey)) {
  throw new Error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY')
}

const uploads = [
  // 与清单同目录：清单在 updates/windows/latest.json，
  // 其中 url 写成 "<version>/<file>.zip"，相对解析后正好落到这里。
  { path: `updates/windows/${version}/${packageName}`, body: packageBytes, contentType: 'application/zip' },
  { path: MANIFEST_PATH, body: Buffer.from(JSON.stringify(manifest, null, 2)), contentType: 'application/json' },
  { path: CONFIG_PATH, body: Buffer.from(JSON.stringify(runtimeConfig, null, 2)), contentType: 'application/json' }
]

console.log(`版本 ${version} → bucket ${BUCKET}`)
for (const item of uploads) {
  console.log(`  ${item.path}  (${item.body.length} bytes, ${item.contentType})`)
}

if (dryRun) {
  console.log('\n[dry-run] 未发起任何请求。')
  process.exit(0)
}

// 幂等确保 bucket 存在：等价于 supabase/migrations/20261012000000_update_bucket.sql，
// 但不依赖 SQL Editor。public = true 提供免鉴权读取，且不创建任何写入策略，
// 因此只有 service_role 能改动更新包。
const bucketProbe = await fetch(`${supabaseUrl}/storage/v1/bucket/${BUCKET}`, {
  headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` }
})
// Storage API 对「bucket 不存在」返回 400 + {"statusCode":"404","code":"NoSuchBucket"}，
// 而不是裸 404，所以要按响应体判断，不能只看状态码。
const probeBody = await bucketProbe.text()
let bucketMissing = bucketProbe.status === 404
try {
  const parsed = JSON.parse(probeBody)
  if (parsed?.code === 'NoSuchBucket' || String(parsed?.statusCode) === '404') bucketMissing = true
} catch { /* 非 JSON 响应 */ }

if (bucketMissing) {
  const created = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      // 与项目全局上限保持一致（免费套餐默认 50 MB）。增量补丁约 6 MB，余量充足。
      file_size_limit: 52428800,
      allowed_mime_types: ['application/zip', 'application/json', 'application/octet-stream']
    })
  })
  if (!created.ok) throw new Error(`创建 bucket ${BUCKET} 失败：${created.status} ${await created.text()}`)
  console.log(`  + 已创建公共 bucket ${BUCKET}`)
} else if (!bucketProbe.ok) {
  throw new Error(`读取 bucket ${BUCKET} 失败：${bucketProbe.status} ${probeBody}`)
} else {
  const existing = JSON.parse(probeBody)
  if (!existing.public) throw new Error(`bucket ${BUCKET} 已存在但不是公共 bucket，无法作为更新源`)
  console.log(`  = bucket ${BUCKET} 已存在（public）`)
}

for (const item of uploads) {
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${item.path}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': item.contentType,
      'cache-control': 'public, max-age=300',
      'x-upsert': 'true'
    },
    body: item.body
  })
  if (!response.ok) {
    throw new Error(`上传 ${item.path} 失败：${response.status} ${await response.text()}`)
  }
  console.log(`  ✓ ${item.path}`)
}

const publicBase = `${supabaseUrl}/storage/v1/object/public/${BUCKET}`
console.log('\n完成。线上地址：')
console.log(`  更新清单 ${publicBase}/${MANIFEST_PATH}`)
console.log(`  运行配置 ${publicBase}/${CONFIG_PATH}`)
