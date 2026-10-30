import { spawnSync } from 'node:child_process'
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pngToIco from 'png-to-ico'
import { rcedit } from 'rcedit'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.resolve(process.env.FENGSHA_OUTPUT_DIR || path.join(root, 'release-portable'))
const appDir = path.join(output, 'Fengsha-Mod-Manager')
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
assert.match(version, /^\d+\.\d+\.\d+$/, 'desktop release version must be numeric semver')
const vite = spawnSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--base=./'], { stdio: 'inherit' })
if (vite.status !== 0) process.exit(vite.status ?? 1)
if (!output.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe output path: ${output}`)
await rm(path.join(root, 'dist', 'updates'), { recursive: true, force: true })
await rm(output, { recursive: true, force: true })
await mkdir(appDir, { recursive: true })
await cp(path.join(root, 'node_modules', 'electron', 'dist'), appDir, { recursive: true })
const appFiles = path.join(appDir, 'resources', 'app')
await mkdir(appFiles, { recursive: true })
await cp(path.join(root, 'dist'), path.join(appFiles, 'dist'), { recursive: true })
await cp(path.join(root, 'electron', 'main.cjs'), path.join(appFiles, 'main.cjs'))
await cp(path.join(root, 'electron', 'preload.cjs'), path.join(appFiles, 'preload.cjs'))
// main.cjs 依赖这个无第三方依赖的 ZIP 模块，漏掉它「下载即安装」会在运行时报 require 失败
await cp(path.join(root, 'electron', 'zip.cjs'), path.join(appFiles, 'zip.cjs'))
// 更新改走「下载安装包 + 静默安装」后，这里不再需要打包替换脚本。
// （旧方案 apply-update.ps1 已删除：它靠脚本替换 resources/app，
//  在文件占用与时序上不可靠，实测会出现「点了更新但版本没变」。）
// electron-builder 会读这个文件做安装包元数据，缺 description / author 会告警
await writeFile(path.join(appFiles, 'package.json'), JSON.stringify({ name: 'fengsha-mod-manager', productName: '烽沙 MOD 管理器', version, description: '烽沙 MOD 管理器：识别游戏目录、安装与排序 UE4SS 模组，并连接云端 MOD 工坊。', author: '烽沙 MOD 工坊', main: 'main.cjs' }, null, 2))
const executable = path.join(appDir, '烽沙 MOD 管理器.exe')
await cp(path.join(appDir, 'electron.exe'), executable)
await rm(path.join(appDir, 'electron.exe'))
const icon = await pngToIco(path.join(root, 'public', 'assets', 'fengsha-mod-icon.png'))
assert.equal(icon.readUInt16LE(2), 1, 'generated file must be a Windows ICO')
assert.ok(icon.readUInt16LE(4) >= 4, 'ICO must contain 16, 32, 48, and 256 pixel images')
const iconPath = path.join(root, 'build-assets', 'fengsha-mod-manager.ico')
await writeFile(iconPath, icon)
await rcedit(executable, { icon: iconPath, 'version-string': { ProductName: '烽沙 MOD 管理器', FileDescription: '烽沙 MOD 管理器' } })

const updateDirectory = path.join(root, 'public', 'updates', 'windows')
const releaseDirectory = path.join(updateDirectory, version)
const updateZip = path.join(releaseDirectory, 'app.tmp.zip')
await rm(releaseDirectory, { recursive: true, force: true })
await mkdir(releaseDirectory, { recursive: true })
const archive = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Compress-Archive -Path (Join-Path $env:FENGSHA_APP_FILES "*") -DestinationPath $env:FENGSHA_UPDATE_ZIP -CompressionLevel Optimal'], { stdio: 'inherit', windowsHide: true, env: { ...process.env, FENGSHA_APP_FILES: appFiles, FENGSHA_UPDATE_ZIP: updateZip } })
if (archive.status !== 0) throw new Error('Could not create the app-only update archive')
const bytes = await readFile(updateZip)
const sha256 = createHash('sha256').update(bytes).digest('hex')
const packageName = `app-${sha256.slice(0, 16)}.zip`
const updatePackage = path.join(releaseDirectory, packageName)
await rename(updateZip, updatePackage)
// 自动更新改成「下载安装包 + 静默安装」，与 electron-updater 的 NSIS 方案同路：
// 由安装程序自己去等待旧进程退出、替换文件、重启，而不是我们拿脚本去替换 resources/app
// （那条路会在文件占用与时序上翻车）。清单里因此要带上安装包的下载地址。
const installerUrl = `https://github.com/aaszxx2/fengsha-mod-manager/releases/download/v${version}/Fengsha-Mod-Manager-Setup.exe`
await writeFile(path.join(updateDirectory, 'latest.json'), JSON.stringify({ version, url: `/${path.posix.join('updates/windows', version, packageName)}`, installerUrl, size: bytes.length, sha256, releaseNotes: ['新增：把模组 ZIP 直接拖到本地管理的模组列表上就能安装，不用再解压找文件夹', '安装前先校验包是否合格：缺 main.lua、IoStore 不完整、空包等不合格的会说明原因并拒绝安装', '合格的模组装完自动启用并排入加载顺序，提示排在第几位；工坊下载的包也走同样的校验'] }, null, 2))
const manifest = JSON.parse(await readFile(path.join(updateDirectory, 'latest.json'), 'utf8'))
assert.equal(manifest.version, version)
assert.equal(manifest.size, bytes.length)
assert.equal(manifest.sha256, createHash('sha256').update(await readFile(updatePackage)).digest('hex'))
console.log(`Portable desktop app: ${executable}`)
console.log(`App-only update package: ${updatePackage}`)
