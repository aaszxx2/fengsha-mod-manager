#!/usr/bin/env node
// 把已经组装好的便携目录打成一个 Windows 安装程序（Setup.exe）。
//
// 用法：
//   node scripts/build-desktop.mjs     先产出 release-portable-<tag>/Fengsha-Mod-Manager
//   node scripts/build-installer.mjs   再把它打成 release-installer/Fengsha-Mod-Manager-Setup-<version>.exe
//
// 为什么用 --prepackaged 而不是让 electron-builder 从头打包：
// 便携目录已经由 build-desktop.mjs 组装好了（图标、版本信息、resources/app 结构），
// 再走一遍 electron-builder 的完整打包只会重复劳动，还可能改动 resources/app 的结构，
// 而那正是自动更新要覆盖的目录。
//
// 所有缓存都指到 D 盘：C 盘空间紧张，而 electron-builder 默认会把
// NSIS / winCodeSign / app-builder 下载到 %LOCALAPPDATA%\electron-builder\Cache。

import { spawnSync } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const tag = `v${pkg.version}`

const portableRoot = process.env.FENGSHA_OUTPUT_DIR || path.join(root, `release-portable-${tag}`)
const appDir = path.join(portableRoot, 'Fengsha-Mod-Manager')

try {
  await access(path.join(appDir, 'resources', 'app', 'main.cjs'))
} catch {
  throw new Error(`找不到便携目录 ${appDir}，请先运行 node scripts/build-desktop.mjs`)
}

const env = {
  ...process.env,
  ELECTRON_BUILDER_CACHE: process.env.ELECTRON_BUILDER_CACHE || 'D:/Tools/electron-builder-cache',
  ELECTRON_CACHE: process.env.ELECTRON_CACHE || 'D:/Tools/electron-cache',
  npm_config_cache: process.env.npm_config_cache || 'D:/Tools/npm-cache'
}

const cli = path.join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js')
const result = spawnSync(process.execPath, [
  cli,
  '--prepackaged', appDir,
  '--win', 'nsis', '--x64',
  '--config', path.join(root, 'electron-builder.yml'),
  '--publish', 'never'
], { stdio: 'inherit', cwd: root, env })

if (result.status !== 0) throw new Error(`electron-builder 失败（退出码 ${result.status}）`)

console.log(`\n安装程序已生成：release-installer/`)
console.log(`  ${path.join(root, 'release-installer', `Fengsha-Mod-Manager-Setup-${pkg.version}.exe`)}`)
