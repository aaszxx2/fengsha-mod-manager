#!/usr/bin/env node
// 构建 GitHub Pages 站点：把网页工坊 + 下载页打包到 docs/ 目录。
//
// GitHub Pages 的项目站点部署在子路径下（https://<user>.github.io/<repo>/），
// 所以 Vite 必须用对应的 base 构建，否则 /assets/... 会解析到域名根目录而 404。
//
// 用法：
//   PAGES_BASE=/fengsha-mod-manager/ node scripts/build-pages.mjs
//
// 产出 docs/ 目录，直接提交到公开仓库即可，Pages 源设为 main 分支的 /docs。

import { spawnSync } from 'node:child_process'
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const docs = path.join(root, 'docs')

const base = process.env.PAGES_BASE || '/fengsha-mod-manager/'
if (!base.startsWith('/') || !base.endsWith('/')) throw new Error(`PAGES_BASE 必须以 / 开头和结尾：${base}`)

const supabaseUrl = (process.env.SUPABASE_URL || 'https://ysnajhzywykjwlfhmhuu.supabase.co').replace(/\/+$/, '')
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_uWB720U2o1_vfOmuAMX76A_zU-_DawS'
const workshopUrl = process.env.WORKSHOP_URL || `https://aaszxx2.github.io${base}`
const bucket = 'fengsha-mods'

// 1. 用子路径 base 构建前端
const vite = spawnSync(
  process.execPath,
  [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', `--base=${base}`],
  { stdio: 'inherit' }
)
if (vite.status !== 0) process.exit(vite.status ?? 1)

// 2. 清空 docs/ 后从 dist 复制（排除 Worker 产物和站点上的旧更新包）
await rm(docs, { recursive: true, force: true })
await mkdir(docs, { recursive: true })
await cp(path.join(dist, 'assets'), path.join(docs, 'assets'), { recursive: true })
await cp(path.join(dist, 'index.html'), path.join(docs, 'index.html'))
await cp(path.join(dist, 'download.html'), path.join(docs, 'download.html'))
await cp(path.join(dist, 'download.json'), path.join(docs, 'download.json'))

// 宣传页：独立静态页，不参与 Vite 构建，整目录原样复制到 /promo/
await cp(path.join(root, 'public', 'promo'), path.join(docs, 'promo'), { recursive: true })

// 3. 网页版读取的运行时配置。GitHub Pages 没有服务端，
//    所以这里是一个静态文件；路径不带扩展名，与前端 fetch(`${BASE_URL}api/config`) 对应。
await mkdir(path.join(docs, 'api'), { recursive: true })
await writeFile(
  path.join(docs, 'api', 'config'),
  JSON.stringify({ supabaseUrl, publishableKey, bucket, workshopUrl }, null, 2)
)

// 4. 更新清单也放一份到站点，作为 Supabase 不可达时的备用源。
//    桌面版的「检查更新」原来只连 supabase.co 一个源，国内网络访问不到就直接报
//    「更新服务暂不可用」——明明只是查个版本号，不该被一个域名卡死。
//    增量包本身仍只托管在 Supabase 上，所以这里把 url 改写成绝对地址；
//    新版的自动更新走 installerUrl（指向 GitHub Release），不受影响。
await mkdir(path.join(docs, 'updates', 'windows'), { recursive: true })
const updateManifest = JSON.parse(await readFile(path.join(root, 'public', 'updates', 'windows', 'latest.json'), 'utf8'))
const supabaseStorage = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/fengsha-updates`
await writeFile(
  path.join(docs, 'updates', 'windows', 'latest.json'),
  JSON.stringify({ ...updateManifest, url: `${supabaseStorage}/updates/windows/${updateManifest.version}/${path.posix.basename(updateManifest.url)}` }, null, 2)
)

// 5. 关掉 Jekyll，否则下划线开头的文件会被吞掉
await writeFile(path.join(docs, '.nojekyll'), '')

const files = await readdir(docs)
console.log(`\nPages 站点已生成：${docs}`)
console.log(`  base: ${base}`)
console.log(`  workshopUrl: ${workshopUrl}`)
console.log(`  顶层内容: ${files.join(', ')}`)
