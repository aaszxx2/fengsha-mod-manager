const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { spawn } = require('node:child_process')
const zip = require('./zip.cjs')
const { createHash } = require('node:crypto')

const parts = ['MOProject', 'Binaries', 'Win64', 'ue4ss', 'Mods']
const pakKinds = { LogicMods: 'LogicMods', IoStore: '~mods' }
// 模组名（文件夹名 / mods.txt 中的名称）唯一字符集来源：ASCII 字母、数字、下划线、点、短横线，外加汉字。
// 用 Unicode 属性转义 \p{Script=Han} 覆盖扩展区汉字（含生僻字），比 \u4e00-\u9fa5 区间更完整。
// 空格有意排除：mods.txt 采用 `名称 : 1` 的格式，名称中出现空格会破坏 UE4SS 的解析。
// sanitize（清洗）与校验（modNamePattern / modsLinePattern）共用这套定义，从根上避免两处字符集再次不一致。
const modNameAllowedChars = 'A-Za-z0-9_\\p{Script=Han}.-'
// 首字符：字母 / 数字 / 下划线 / 汉字。数字开头无安全风险，故允许；
// 点开头是隐藏文件语义、短横开头形似命令行参数，二者继续拒绝。
const modNameFirstChars = 'A-Za-z0-9_\\p{Script=Han}'
const modNameSource = `[${modNameFirstChars}][${modNameAllowedChars}]*`
const modNamePattern = new RegExp(`^${modNameSource}$`, 'u')
const modNameSanitizePattern = new RegExp(`[^${modNameAllowedChars}]`, 'gu')
// 长度上限（UTF-16 单元）：NTFS 单段文件名上限为 255，但模组目录位于
// `<游戏根>/MOProject/Binaries/Win64/ue4ss/Mods/` 之下，路径前缀已占约 90 字符，
// 保守取 100 可确保完整路径仍落在传统 MAX_PATH(260) 之内，避免 mkdir/rename 报 EINVAL/ENAMETOOLONG。
// 汉字 1 字符 = 1 单元，扩展区汉字（代理对）与 emoji 各占 2 单元，故按 UTF-16 单元（String#length）而非码点计数。
const modNameMaxLength = 100
// mods.txt 单行格式：`名称 : 0/1`（允许行尾 # 注释）。读取与写入共用，保持字符集一致。
const modsLinePattern = new RegExp(`^\\s*(${modNameSource})\\s*:\\s*([01])(?:\\s*(?:#.*)?)?\\s*$`, 'u')
// Windows 保留设备名（大小写不敏感，`CON.txt` 这类带扩展名的写法同样保留）。
const reservedModNames = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i
// 这些名字与游戏 / 管理器自身目录冲突，禁止用作模组名。
const blockedModNames = ['backup', 'saved', 'logs']
// 校验模组名是否合法：先过长度与字符集，再排除路径穿越、首尾点、Windows 保留设备名与黑名单。
function isValidModName(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > modNameMaxLength) return false
  if (!modNamePattern.test(name)) return false
  if (name.includes('..') || name.endsWith('.')) return false
  if (reservedModNames.test(name.split('.')[0])) return false
  return !blockedModNames.includes(name.toLowerCase())
}
// 把任意标题清洗成**一定合法**的模组名：保证 isValidModName(sanitizeModName(x)) 恒为 true。
// 处理链：非法字符 → `_`；连续点压缩（路径穿越语义）；去掉首尾点（隐藏文件 / Windows 限制）；
// 短横开头换成 `_`；保留设备名 / 黑名单加 `mod-` 前缀；超长按 UTF-16 单元截断（避免截断在代理对中间）；空则回退。
function sanitizeModName(value) {
  let name = String(value ?? '')
    .replace(modNameSanitizePattern, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .replace(/^-+/, '_')
    .trim()
  if (!name) return `mod-${Date.now()}`
  if (reservedModNames.test(name.split('.')[0]) || blockedModNames.includes(name.toLowerCase())) name = `mod-${name}`
  if (name.length > modNameMaxLength) {
    let cut = name.slice(0, modNameMaxLength)
    if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1)
    name = cut.replace(/\.+$/, '') || `mod-${Date.now()}`
  }
  return name
}
const execFileAsync = promisify(execFile)
const gameAppId = '1733690'
// 桌面版的云端配置与自动更新都走 Supabase Storage 的公共 bucket：
// 该地址永久不变、不需要鉴权，不依赖任何网页托管的域名。
const supabaseOrigin = 'https://ysnajhzywykjwlfhmhuu.supabase.co'
const updateBase = `${supabaseOrigin}/storage/v1/object/public/fengsha-updates`
const updateManifestUrl = `${updateBase}/updates/windows/latest.json`
// 站点上也托管一份同样的清单，作为 Supabase 不可达时的备用源。
// 「检查更新」原来只连 supabase.co 一个域名，国内网络访问不到就直接报
// 「更新服务暂不可用」——查个版本号不该被单个域名卡死。
const updateManifestUrls = [updateManifestUrl, 'https://aaszxx2.github.io/fengsha-mod-manager/updates/windows/latest.json']
const runtimeConfigUrl = `${updateBase}/api/config.json`
// 站点上也托管了一份同样的配置，作为备用源
const runtimeConfigMirrorUrl = 'https://aaszxx2.github.io/fengsha-mod-manager/api/config'
// 内置兜底配置。这几个值本身是公开信息（前端必须拿到才能连云端），内置一份可以保证
// 「网络到不了 Supabase / GitHub」时工坊仍然可用 —— 之前每次启动都硬要联网读
// config.json，国内网络下经常直接失败，玩家看到的就是「还未连接 Supabase 项目」。
// 远程配置依然优先，用于将来换 key / 换域名。
const bundledCloudConfig = {
  supabaseUrl: supabaseOrigin,
  publishableKey: 'sb_publishable_uWB720U2o1_vfOmuAMX76A_zU-_DawS',
  bucket: 'fengsha-mods',
  workshopUrl: 'https://aaszxx2.github.io/fengsha-mod-manager/'
}
let mainWindow
let downloadedUpdate
function compareVersions(left, right) {
  const parse = value => {
    if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) throw new Error('更新版本号格式无效')
    return value.split('.').map(Number)
  }
  const a = parse(left), b = parse(right)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}
async function getUpdateManifest() {
  // 两个源依次尝试：Supabase 优先，站点镜像兜底
  let release = null
  let base = updateManifestUrl
  for (const source of updateManifestUrls) {
    try {
      const response = await fetch(source, { cache: 'no-store', signal: AbortSignal.timeout(12000) })
      if (!response.ok) continue
      const data = await response.json()
      if (data && typeof data.version === 'string' && data.version) { release = data; base = source; break }
    } catch { /* 换下一个源 */ }
  }
  if (!release) throw new Error('暂时无法连接更新服务')
  // 增量包地址：清单可能来自站点镜像，所以相对路径按清单所在位置解析；
  // 允许指向 Supabase 或站点域名，不再要求与清单同源（镜像清单里的 url 是绝对地址）。
  const url = new URL(release.url, base)
  const trustedHosts = new Set([new URL(supabaseOrigin).hostname, 'aaszxx2.github.io'])
  // installerSha256 是可选的（旧版清单没有这个字段），但只要带了就必须是合法哈希
  if (release.installerSha256 && !/^[a-f\d]{64}$/i.test(release.installerSha256)) throw new Error('更新清单无效')
  if (compareVersions(release.version, app.getVersion()) < 0 || url.protocol !== 'https:' || !trustedHosts.has(url.hostname) || !/^[a-f\d]{64}$/i.test(release.sha256) || !Number.isInteger(release.size) || release.size < 1 || release.size > 100 * 1024 * 1024) throw new Error('更新清单无效')
  // 安装包放在 GitHub Releases 上：只接受 https，且必须落在我们自己的仓库下。
  const installerUrl = new URL(String(release.installerUrl || ''), base)
  if (installerUrl.protocol !== 'https:' || installerUrl.hostname !== 'github.com' || !installerUrl.pathname.startsWith('/aaszxx2/fengsha-mod-manager/releases/')) throw new Error('更新清单无效')
  return { ...release, url: url.href, installerUrl: installerUrl.href, releaseNotes: Array.isArray(release.releaseNotes) ? release.releaseNotes.filter(note => typeof note === 'string').slice(0, 12) : [] }
}
ipcMain.handle('app-version', () => app.getVersion())
ipcMain.handle('check-for-updates', async () => {
  try {
    const release = await getUpdateManifest()
    return { available: compareVersions(release.version, app.getVersion()) > 0, currentVersion: app.getVersion(), ...release }
  } catch (error) {
    if (error.message.includes('更新清单无效')) throw error
    // 两个源都拿不到，基本就是网络问题，直接说清楚，别让玩家以为是服务挂了
    if (error.name === 'TimeoutError' || error.name === 'TypeError' || /fetch failed/i.test(error.message)) throw new Error('无法连接更新服务，请检查网络后重试。')
    throw error
  }
})
ipcMain.handle('download-update', async (_event, expectedVersion) => {
  const release = await getUpdateManifest()
  if (release.version !== expectedVersion) throw new Error('更新版本已变化，请重新检查。')
  // 下载的是完整安装包（和 electron-updater 一样），交给 NSIS 安装程序去替换文件
  const response = await fetch(release.installerUrl, { cache: 'no-store', signal: AbortSignal.timeout(600000) })
  if (!response.ok || !response.body) throw new Error('安装包下载失败，请稍后重试。')
  const total = Number(response.headers.get('content-length') || 0)
  if (!Number.isInteger(total) || total < 1 || total > 300 * 1024 * 1024) throw new Error('安装包大小异常，已中止下载。')
  const chunks = []
  let received = 0
  for await (const chunk of response.body) {
    received += chunk.length
    if (received > total) throw new Error('安装包大小与预期不符。')
    chunks.push(chunk)
    mainWindow?.webContents.send('update-download-progress', { received, total })
  }
  if (received !== total) throw new Error('安装包下载不完整，请重试。')
  const payload = Buffer.concat(chunks)
  // 比对清单里的安装包哈希。content-length 只能证明「字节数对」，
  // 证明不了「内容没被换掉」——本地代理或中间人劫持时，长度可以伪造。
  if (release.installerSha256) {
    const actual = createHash('sha256').update(payload).digest('hex')
    if (actual !== String(release.installerSha256).toLowerCase()) throw new Error('安装包校验失败，可能已被篡改，请稍后重试。')
  }
  downloadedUpdate = path.join(app.getPath('temp'), `fengsha-setup-${release.version}.exe`)
  await fs.writeFile(downloadedUpdate, payload)
  return { version: release.version }
})
ipcMain.handle('apply-update', async () => {
  if (!app.isPackaged || process.platform !== 'win32' || !downloadedUpdate) throw new Error('请先下载更新；更新安装仅支持 Windows 桌面版。')
  // 与 electron-updater 的 NSIS 方案同路：不自己替换文件，而是静默运行安装包，
  // 由它负责等待旧进程退出、覆盖文件、重启应用。自己用脚本替换 resources/app
  // 会在文件占用与时序上翻车（实测表现为「点了更新、重启后版本没变」）。
  // 参数：/S 静默安装，--force-run 装完直接启动，/D= 必须放最后且不加引号。
  const installDir = path.dirname(app.getPath('exe'))
  const helper = spawn(downloadedUpdate, ['/S', '--force-run', `/D=${installDir}`], { detached: true, stdio: 'ignore', windowsHide: true })
  helper.unref()
  app.quit()
})

// 旧机制（脚本替换 resources/app）会在临时目录留下残骸，启动时顺手清掉。
// 新机制下载的安装包不清理，避免用户重复下载 96 MB。
async function cleanupUpdateLeftovers() {
  try {
    const temp = app.getPath('temp')
    for (const entry of await fs.readdir(temp)) {
      if (/^fengsha-(apply-update-\d+\.ps1|update-\d+\.\d+\.\d+\.zip)$/.test(entry)) {
        await fs.rm(path.join(temp, entry), { recursive: true, force: true }).catch(() => {})
      }
    }
  } catch { /* 清理失败不影响使用 */ }
}

async function inspectGame(root) {
  const executableDir = path.join(root, 'MOProject', 'Binaries', 'Win64')
  const [gameExe, proxyDll, loaderDll, modsFile, ue4ssLog] = await Promise.all([
    fs.access(path.join(executableDir, 'MOProject-Win64-Shipping.exe')).then(() => true, () => false),
    fs.access(path.join(executableDir, 'dwmapi.dll')).then(() => true, () => false),
    fs.access(path.join(executableDir, 'ue4ss', 'UE4SS.dll')).then(() => true, () => false),
    fs.access(path.join(executableDir, 'ue4ss', 'Mods', 'mods.txt')).then(() => true, () => false),
    fs.readFile(path.join(executableDir, 'ue4ss', 'UE4SS.log'), 'utf8').catch(() => '')
  ])
  // UE4SS 的版本只写在日志第一行：`UE4SS - v3.0.1 Beta #0 - Git SHA #xxxx`。
  // 界面上显示出来，玩家就不用靠"列表里有没有前置"来判断前置在不在 ——
  // 前置是加载器，本来就不该出现在模组列表里。
  const versionMatch = ue4ssLog.match(/UE4SS\s*-\s*(v[\d.]+[^\r\n]*?)\s*-\s*Git SHA/i)
  return { root, gameExe, ue4ssReady: proxyDll && loaderDll, ue4ssVersion: versionMatch ? versionMatch[1].trim() : '', modsReady: modsFile, pakLoaderLogSeen: /Pak-initialization mount complete/i.test(ue4ssLog) }
}
function modsPath(root) {
  if (!root || !path.isAbsolute(root)) throw new Error('游戏目录无效，请重新选择')
  return path.join(path.resolve(root), ...parts)
}
function paksPath(root) {
  if (!root || !path.isAbsolute(root)) throw new Error('游戏目录无效，请重新选择')
  return path.join(path.resolve(root), 'MOProject', 'Content', 'Paks')
}
function packageTypePath(root, type) {
  if (!Object.hasOwn(pakKinds, type)) throw new Error('PAK 模组类型无效')
  return path.join(paksPath(root), pakKinds[type])
}
const packageExtensions = new Set(['.pak', '.ucas', '.utoc', '.sig'])
function packageStem(filename) { return filename.slice(0, -path.extname(filename).length) }
function groupPackageFiles(entries) {
  const groups = new Map()
  for (const entry of entries) {
    if (!entry.isFile() || !packageExtensions.has(path.extname(entry.name).toLowerCase())) continue
    const stem = packageStem(entry.name)
    const key = stem.toLowerCase()
    if (!groups.has(key)) groups.set(key, { name: stem, files: [] })
    groups.get(key).files.push(entry.name)
  }
  return [...groups.values()].filter(group => group.files.some(file => path.extname(file).toLowerCase() === '.pak'))
}
async function readDirectoryEntries(dir) {
  try { return await fs.readdir(dir, { withFileTypes: true }) }
  catch (error) { if (error.code === 'ENOENT') return []; throw error }
}
async function readDisabledPackageGroups(root, type) {
  const disabledRoot = path.join(root, '.fengsha-mod-manager', 'disabled', type)
  const result = []
  for (const entry of await readDirectoryEntries(disabledRoot)) {
    if (!entry.isDirectory()) continue
    const name = Buffer.from(entry.name, 'base64url').toString('utf8')
    if (!name || Buffer.from(name, 'utf8').toString('base64url') !== entry.name) continue
    const dir = path.join(disabledRoot, entry.name)
    const group = groupPackageFiles(await readDirectoryEntries(dir)).find(item => item.name.toLowerCase() === name.toLowerCase())
    if (group) result.push({ ...group, dir })
  }
  return result
}
async function scanPackageMods(root) {
  const paks = paksPath(root)
  const result = []
  for (const [type, folder] of Object.entries(pakKinds)) {
    const active = path.join(paks, folder)
    const activeGroups = groupPackageFiles(await readDirectoryEntries(active))
    for (const group of activeGroups) result.push({ ...group, id: `pak:${type}:${group.name.toLowerCase()}`, kind: 'pak', pakType: type, enabled: true, registered: true, missing: false, relativePath: path.join('MOProject', 'Content', 'Paks', folder), incomplete: type === 'IoStore' && !['.ucas', '.utoc'].every(ext => group.files.some(file => path.extname(file).toLowerCase() === ext)) })
    for (const group of await readDisabledPackageGroups(root, type)) result.push({ ...group, id: `pak:${type}:${group.name.toLowerCase()}`, kind: 'pak', pakType: type, enabled: false, registered: true, missing: false, relativePath: path.join('MOProject', 'Content', 'Paks', folder), incomplete: type === 'IoStore' && !['.ucas', '.utoc'].every(ext => group.files.some(file => path.extname(file).toLowerCase() === ext)) })
  }
  return result
}
async function setPakEnabled(root, type, name, enabled) {
  if (typeof enabled !== 'boolean') throw new Error('PAK 模组状态无效')
  if (!(await inspectGame(root)).gameExe) throw new Error('所选目录未检测到烽沙游戏，请重新选择游戏目录。')
  if (!Object.hasOwn(pakKinds, type) || typeof name !== 'string' || !name || /[\\/]/.test(name)) throw new Error('PAK 模组标识无效')
  const active = packageTypePath(root, type)
  const disabled = path.join(root, '.fengsha-mod-manager', 'disabled', type, Buffer.from(name, 'utf8').toString('base64url'))
  const source = enabled ? disabled : active
  const target = enabled ? active : disabled
  const group = groupPackageFiles(await readDirectoryEntries(source)).find(item => item.name.toLowerCase() === name.toLowerCase())
  if (!group) throw new Error('找不到这组 PAK 文件，请重新扫描')
  if (enabled && type === 'IoStore' && !['.ucas', '.utoc'].every(ext => group.files.some(file => path.extname(file).toLowerCase() === ext))) throw new Error('IoStore 模组缺少同名 .ucas 或 .utoc 文件，不能启用。')
  const files = group.files
  await fs.mkdir(target, { recursive: true })
  for (const file of files) if (await fs.lstat(path.join(target, file)).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))) throw new Error(`目标目录已存在文件：${file}`)
  const moved = []
  try {
    for (const file of files) {
      await fs.rename(path.join(source, file), path.join(target, file))
      moved.push(file)
    }
  } catch (error) {
    for (const file of moved.reverse()) await fs.rename(path.join(target, file), path.join(source, file)).catch(() => {})
    if (!enabled && !moved.length) await fs.rm(disabled, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}
async function detectPakSource(source) {
  const info = await fs.stat(source)
  if (!info.isDirectory()) return null
  let dir = source, type = null
  for (const [candidate, folder] of Object.entries(pakKinds)) {
    const nested = path.join(source, folder)
    if ((await fs.stat(nested).catch(() => null))?.isDirectory()) { dir = nested; type = candidate; break }
  }
  const groups = groupPackageFiles(await readDirectoryEntries(dir))
  if (!groups.length) return null
  if (!type) type = groups.some(group => group.files.some(file => ['.ucas', '.utoc'].includes(path.extname(file).toLowerCase()))) ? 'IoStore' : 'LogicMods'
  if (type === 'IoStore' && groups.some(group => !['.ucas', '.utoc'].every(ext => group.files.some(file => path.extname(file).toLowerCase() === ext)))) throw new Error('IoStore 模组必须包含同名 .pak、.ucas 和 .utoc 文件，请检查压缩包是否解压完整。')
  return { dir, type, groups }
}
async function installPakSource(root, source, detected, overwrite) {
  if (!(await inspectGame(root)).gameExe) throw new Error('所选目录未检测到烽沙游戏，请重新选择游戏目录。')
  const target = packageTypePath(root, detected.type)
  const conflicts = []
  const activeGroups = groupPackageFiles(await readDirectoryEntries(target))
  const disabledGroups = await readDisabledPackageGroups(root, detected.type)
  for (const group of detected.groups) {
    const existing = activeGroups.find(item => item.name.toLowerCase() === group.name.toLowerCase())
    if (existing) conflicts.push(...existing.files.map(file => path.join(target, file)))
    const inactive = disabledGroups.find(item => item.name.toLowerCase() === group.name.toLowerCase())
    if (inactive) conflicts.push(...inactive.files.map(file => path.join(inactive.dir, file)))
  }
  if (conflicts.length && !overwrite) throw new Error('目标位置存在同名 PAK 模组；确认覆盖后再安装。')
  await fs.mkdir(target, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const managerData = path.join(root, '.fengsha-mod-manager')
  const backup = path.join(managerData, 'backups', stamp, detected.type)
  const stage = path.join(managerData, 'staging', `${process.pid}-${stamp}`)
  await fs.mkdir(stage, { recursive: true })
  const movedOld = [], movedNew = []
  try {
    for (const group of detected.groups) for (const file of group.files) await fs.copyFile(path.join(detected.dir, file), path.join(stage, file))
    if (conflicts.length) {
      await fs.mkdir(backup, { recursive: true })
      for (const file of conflicts) {
        const targetPath = path.join(backup, path.relative(root, file))
        await fs.mkdir(path.dirname(targetPath), { recursive: true })
        await fs.rename(file, targetPath)
        movedOld.push([targetPath, file])
      }
    }
    for (const entry of await readDirectoryEntries(stage)) {
      if (!entry.isFile() || !packageExtensions.has(path.extname(entry.name).toLowerCase())) continue
      const dest = path.join(target, entry.name)
      await fs.rename(path.join(stage, entry.name), dest)
      movedNew.push(dest)
    }
  } catch (error) {
    for (const dest of movedNew.reverse()) await fs.rm(dest, { force: true }).catch(() => {})
    for (const [backupPath, original] of movedOld.reverse()) await fs.rename(backupPath, original).catch(() => {})
    throw error
  } finally { await fs.rm(stage, { recursive: true, force: true }) }
}
async function inspectModSource(root, source) {
  const detected = await detectPakSource(path.resolve(source))
  if (!detected) return null
  const target = packageTypePath(root, detected.type)
  const current = groupPackageFiles(await readDirectoryEntries(target))
  const inactive = await readDisabledPackageGroups(root, detected.type)
  const conflicts = detected.groups.flatMap(group => {
    const activeGroup = current.find(item => item.name.toLowerCase() === group.name.toLowerCase())
    const disabledGroup = inactive.find(item => item.name.toLowerCase() === group.name.toLowerCase())
    return [
      ...(activeGroup?.files.map(file => path.join(target, file)) || []),
      ...(disabledGroup?.files.map(file => path.join(disabledGroup.dir, file)) || [])
    ]
  })
  return { type: detected.type, groups: detected.groups.map(group => group.name), conflicts }
}
function safeModPath(root, name) {
  if (!isValidModName(name)) throw new Error('MOD 文件夹名称无效')
  return path.join(modsPath(root), name)
}
async function chooseDirectory() {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return canceled ? null : filePaths[0]
}
async function detectGame() {
  const steamPaths = new Set()
  for (const key of ['HKCU\\Software\\Valve\\Steam', 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam']) {
    try {
      const { stdout } = await execFileAsync('reg.exe', ['query', key, '/v', key.includes('HKCU') ? 'SteamPath' : 'InstallPath'], { windowsHide: true })
      const match = stdout.match(/REG_SZ\s+(.+)/i)
      if (match) steamPaths.add(match[1].trim().replaceAll('/', path.sep))
    } catch {}
  }
  if (process.env['ProgramFiles(x86)']) steamPaths.add(path.join(process.env['ProgramFiles(x86)'], 'Steam'))

  const libraries = new Set(steamPaths)
  for (const steam of steamPaths) {
    try {
      const vdf = await fs.readFile(path.join(steam, 'steamapps', 'libraryfolders.vdf'), 'utf8')
      for (const match of vdf.matchAll(/"path"\s+"((?:\\\\.|[^"])*)"/g)) libraries.add(match[1].replaceAll('\\\\', '\\'))
    } catch {}
  }

  for (const library of libraries) {
    const manifest = path.join(library, 'steamapps', `appmanifest_${gameAppId}.acf`)
    try {
      const text = await fs.readFile(manifest, 'utf8')
      const installDir = text.match(/"installdir"\s+"([^"]+)"/i)?.[1]
      if (!installDir) continue
      const root = path.join(library, 'steamapps', 'common', installDir)
      const result = await inspectGame(root)
      if (result.gameExe) return result
    } catch {}
  }
  return null
}
async function scanMods(root) {
  const base = modsPath(root)
  const rawText = await fs.readFile(path.join(base, 'mods.txt'), 'utf8').catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error))
  const states = new Map()
  for (const line of rawText.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(modsLinePattern)
    if (match) states.set(match[1].toLowerCase(), match[2] === '1')
  }
  const mods = []
  for (const entry of await readDirectoryEntries(base)) {
    if (!entry.isDirectory() || blockedModNames.includes(entry.name.toLowerCase())) continue
    const children = await fs.readdir(path.join(base, entry.name), { withFileTypes: true })
    if (!children.length) continue
    // 检查 UE4SS 的加载入口是否存在。缺 Scripts/main.lua 的模组会被 UE4SS 直接跳过，
    // 界面上标出来，玩家就不用靠"进游戏看有没有效果"来猜了。
    const scriptsDir = children.find(child => child.isDirectory() && child.name.toLowerCase() === 'scripts')
    let hasMainLua = false
    if (scriptsDir) {
      const scriptFiles = await fs.readdir(path.join(base, entry.name, scriptsDir.name), { withFileTypes: true })
      hasMainLua = scriptFiles.some(file => file.isFile() && file.name.toLowerCase() === 'main.lua')
    }
    const key = entry.name.toLowerCase()
    mods.push({ name: entry.name, id: `ue4ss:${key}`, kind: 'ue4ss', relativePath: path.join('MOProject', 'Binaries', 'Win64', 'ue4ss', 'Mods'), enabled: states.get(key) ?? false, registered: states.has(key), hasMainLua })
  }
  for (const [name, enabled] of states) if (!mods.some(mod => mod.name.toLowerCase() === name)) mods.push({ name, id: `ue4ss:${name}`, kind: 'ue4ss', enabled, registered: true, missing: true })
  const order = [...states.keys()]
  mods.sort((a, b) => {
    const ai = order.indexOf(a.name.toLowerCase()), bi = order.indexOf(b.name.toLowerCase())
    return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi)
  })
  const result = [...mods, ...await scanPackageMods(root)]
  // 把云端作品清单挂到对应模组上：用于「已安装」标记与前置依赖检测。
  // 同时清理已经没有对应模组的孤儿清单，避免数据越积越脏。
  const manifests = await readManifests(root)
  const alive = new Set()
  for (const mod of result) {
    const manifest = manifests.get(mod.name.toLowerCase())
    if (manifest) { mod.cloud = { id: manifest.modId, title: manifest.title, version: manifest.version, dependencies: manifest.dependencies }; alive.add(mod.name.toLowerCase()) }
  }
  for (const key of manifests.keys()) if (!alive.has(key)) await removeManifest(root, key)
  return { rawText, mods: result }
}
async function writeModsFile(root, nextStates) {
  if (!Array.isArray(nextStates) || nextStates.some(({ name }) => !isValidModName(name))) throw new Error('MOD 配置名称无效')
  const base = modsPath(root)
  const target = path.join(base, 'mods.txt')
  // mods.txt 可能根本不存在：首次使用、或玩家的 UE4SS 装得不完整（只剩一个空的 Mods 目录）。
  // 以前这里直接 readFile，会抛 ENOENT 让整个安装失败；缺失时按空文件处理，随后会被创建出来。
  const current = await fs.readFile(target, 'utf8').catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error))
  const lines = current.replace(/^\uFEFF/, '').split(/\r?\n/)
  const names = new Map(nextStates.map(({ name, enabled }) => [name.toLowerCase(), { name, enabled }]))
  const isModLine = line => modsLinePattern.test(line)
  const slots = lines.flatMap((line, index) => isModLine(line) ? [index] : [])
  const output = [...lines]
  const ordered = [...names.values()].map(({ name, enabled }) => `${name} : ${enabled ? 1 : 0}`)
  slots.forEach((index, i) => { output[index] = ordered[i] ?? '' })
  if (ordered.length > slots.length) output.splice(slots.at(-1) + 1 || output.length, 0, ...ordered.slice(slots.length))
  const backup = path.join(base, 'backup')
  await fs.mkdir(backup, { recursive: true })
  await fs.copyFile(target, path.join(backup, `mods_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`))
  const temporary = `${target}.${process.pid}.tmp`
  await fs.writeFile(temporary, output.join('\r\n'), 'utf8')
  await fs.rename(temporary, target)
}
// ---------- 云端作品「下载即安装」 ----------
//
// 思路参考成熟的 Mod 管理器：不维护"已安装清单"这种会跟磁盘不一致的数据，
// 而是把 ZIP 直接落到游戏模组目录，然后重扫 —— 磁盘始终是唯一事实源。
// 这里额外写一份 .fengsha-mod.json 清单，只用于记住作品的云端 id 与依赖声明，
// 供「已安装」标记和前置依赖检测使用；删掉模组后清单会在扫描时自动清理。

function managerDataDir(root) { return path.join(root, '.fengsha-mod-manager') }
function manifestsDir(root) { return path.join(managerDataDir(root), 'manifests') }
// manifest 文件名由模组名 base64url 编码而来（与 disabled 目录同方案）。
// 旧写法 `[^\w.-] → _` 对中文有损：「模组A」与「文字A」会塌缩成同一文件名而互相覆盖。
// key 的真正来源是 JSON 内部的 parsed.key，文件名只需 write / remove 两侧编码一致且可逆即可。
function manifestFilename(key) { return `${Buffer.from(key, 'utf8').toString('base64url')}.json` }
// 迁移兼容：旧版本按 `[^\w.-] → _` 生成文件名（中文有损、会碰撞）。
// 仅用于清理升级遗留的旧命名文件，勿再用于新写入；待老用户升级完毕后可移除。
function legacyManifestFilename(key) { return `${key.replace(/[^\w.-]/g, '_')}.json` }

async function readManifests(root) {
  const dir = manifestsDir(root)
  const result = new Map()
  const canonical = new Set() // 记录已由"新命名"文件写入的 key，保证新命名优先于旧命名
  for (const entry of await readDirectoryEntries(dir)) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') continue
    const raw = await fs.readFile(path.join(dir, entry.name), 'utf8').catch(() => null)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed.key !== 'string') continue
      const key = parsed.key.toLowerCase()
      const isCanonical = entry.name === manifestFilename(parsed.key)
      // 同一 key 出现新旧两份时新命名优先，避免 readdir 顺序导致读到陈旧的 version / dependencies。
      if (canonical.has(key) && !isCanonical) continue
      result.set(key, parsed)
      if (isCanonical) canonical.add(key)
    } catch { /* 清单损坏就当作没有 */ }
  }
  return result
}

async function writeManifest(root, key, data) {
  const dir = manifestsDir(root)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, manifestFilename(key)), JSON.stringify({ key, ...data }, null, 2), 'utf8')
  // 顺手清掉同名的旧命名残留，避免新旧两份并存时 readManifests 读到陈旧的 version / dependencies。
  await fs.rm(path.join(dir, legacyManifestFilename(key)), { force: true }).catch(() => {})
}

async function removeManifest(root, key) {
  const dir = manifestsDir(root)
  await fs.rm(path.join(dir, manifestFilename(key)), { force: true })
  // 同时清理旧命名文件，让 scanMods 的孤儿清单自动清理在迁移后仍然生效。
  await fs.rm(path.join(dir, legacyManifestFilename(key)), { force: true }).catch(() => {})
}

// 从条目列表判断这个 ZIP 是 PAK 模组还是 UE4SS 模组，并推断顶层文件夹名
function classifyZipEntries(entries) {
  const lower = entries.map(name => name.toLowerCase())
  const isPak = lower.some(name => name.endsWith('.pak') || name.endsWith('.ucas') || name.endsWith('.utoc'))
  const first = entries.map(name => name.split('/')[0]).filter(Boolean)
  const uniqueFirst = [...new Set(first)]
  // 所有条目都在同一个顶层文件夹下 → 用那个文件夹名作为模组名
  const sharedFolder = uniqueFirst.length === 1 && entries.every(name => name.includes('/')) ? uniqueFirst[0] : null
  if (isPak) {
    const pakType = lower.some(name => name.endsWith('.ucas') || name.endsWith('.utoc')) ? 'IoStore' : 'LogicMods'
    return { type: 'pak', pakType, folder: sharedFolder }
  }
  // UE4SS 本体（前置包）：带 UE4SS.dll / UE4SS-settings.ini，但**没有** Scripts/main.lua。
  // 这类包不是模组，装进 Mods 永远不会被加载（UE4SS 只认带 main.lua 的文件夹）——
  // 它要覆盖的是 ue4ss 目录本身。之前把它当普通模组处理，玩家看到的就是「装上了但失效」。
  const hasEntry = suffix => lower.some(name => name === suffix || name.endsWith(`/${suffix}`))
  const hasMainLua = lower.some(name => name.endsWith('scripts/main.lua'))
  if (!hasMainLua && (hasEntry('ue4ss.dll') || hasEntry('ue4ss-settings.ini'))) {
    return { type: 'runtime', folder: sharedFolder }
  }
  return { type: 'ue4ss', folder: sharedFolder }
}

// 拖入 / 下载的 ZIP 在解压之前先判定「装了能不能用」。判定标准与游戏加载行为一致：
// UE4SS 只认带 Scripts/main.lua 的文件夹，PAK 必须有 .pak（IoStore 还要 .ucas/.utoc 配套）。
// 不合格就地拦下，不给玩家「装上了但不生效」的假成功。
async function precheckZipArchive(archive) {
  let entries
  try {
    entries = await zip.list(archive)
  } catch {
    return { ok: false, issues: ['压缩包无法读取，文件可能已损坏或不是标准 ZIP'] }
  }
  if (!entries.length) return { ok: false, issues: ['压缩包是空的'] }
  const kind = classifyZipEntries(entries)
  const lower = entries.map(name => name.toLowerCase())
  if (kind.type === 'runtime') return { ok: true, type: 'runtime', label: 'UE4SS 前置包' }
  if (kind.type === 'pak') {
    if (!lower.some(name => name.endsWith('.pak'))) return { ok: false, issues: ['只有 .ucas / .utoc 而没有 .pak 文件，游戏加载不到任何资源'] }
    if (kind.pakType === 'IoStore') {
      const hasUcas = lower.some(name => name.endsWith('.ucas'))
      const hasUtoc = lower.some(name => name.endsWith('.utoc'))
      if (!hasUcas || !hasUtoc) return { ok: false, issues: ['IoStore 模组必须同时包含同名 .pak、.ucas、.utoc 三个文件，这个包不完整'] }
    }
    return { ok: true, type: 'pak', pakType: kind.pakType, label: `${kind.pakType === 'IoStore' ? 'IoStore' : 'LogicMods'} PAK 模组` }
  }
  const hasMainLua = lower.some(name => name.endsWith('scripts/main.lua'))
  if (!hasMainLua) {
    const hasScripts = lower.some(name => /(^|\/)scripts\//.test(name))
    return { ok: false, issues: [hasScripts
      ? '缺少 Scripts/main.lua 入口文件——UE4SS 只加载带 main.lua 的模组，装了也不会生效，请联系模组作者补上'
      : '没有找到可识别的模组结构（UE4SS 需要 Scripts/main.lua，PAK 需要 .pak 文件），这个包不是可安装的模组'] }
  }
  if (kind.folder) {
    const cleaned = sanitizeModName(kind.folder)
    if (!isValidModName(cleaned)) return { ok: false, issues: [`ZIP 顶层文件夹名「${kind.folder}」不合法（只能包含中文、字母、数字、下划线、点和短横线）`] }
  }
  return { ok: true, type: 'ue4ss', label: 'UE4SS Lua 模组' }
}

// UE4SS 本体（前置包）不是模组：它要覆盖的是 <Win64>/ue4ss 目录本身，
// 而代理 DLL（dwmapi.dll 等）必须落在 <Win64> 下游戏才会加载 UE4SS。
// 这里只做「合并覆盖」—— 同名文件先备份再替换，绝不删除 Mods 或其它既有内容。
async function installUe4ssRuntime(root, source) {
  const win64 = path.join(root, 'MOProject', 'Binaries', 'Win64')
  const ue4ssDir = path.join(win64, 'ue4ss')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.join(managerDataDir(root), 'backup', `ue4ss-runtime_${stamp}`)
  // 这些是 UE4SS 的代理加载器，必须和游戏 exe 放在同一层
  const proxyNames = new Set(['dwmapi.dll', 'xinput1_3.dll', 'version.dll', 'winmm.dll', 'dsound.dll'])
  let files = 0
  let replaced = 0
  await fs.mkdir(ue4ssDir, { recursive: true })

  // 覆盖前留一份原件，玩家想退回旧版本时还能捞回来
  async function backupIfExists(target) {
    const info = await fs.lstat(target).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))
    if (!info || info.isDirectory()) return
    const backupPath = path.join(backupDir, path.relative(win64, target))
    await fs.mkdir(path.dirname(backupPath), { recursive: true })
    await fs.copyFile(target, backupPath)
    replaced++
  }

  async function copyInto(from, to) {
    for (const entry of await readDirectoryEntries(from)) {
      const src = path.join(from, entry.name)
      const dst = path.join(to, entry.name)
      if (entry.isDirectory()) {
        await fs.mkdir(dst, { recursive: true })
        await copyInto(src, dst)
        continue
      }
      await backupIfExists(dst)
      await fs.copyFile(src, dst)
      files++
    }
  }

  for (const entry of await readDirectoryEntries(source)) {
    const src = path.join(source, entry.name)
    // 代理 DLL 直接放 Win64 根目录，其余内容进 ue4ss
    const toWin64Root = entry.isFile() && proxyNames.has(entry.name.toLowerCase())
    const dst = path.join(toWin64Root ? win64 : ue4ssDir, entry.name)
    if (entry.isDirectory()) {
      await fs.mkdir(dst, { recursive: true })
      await copyInto(src, dst)
      continue
    }
    await backupIfExists(dst)
    await fs.copyFile(src, dst)
    files++
  }
  return { files, replaced, backupDir: replaced ? backupDir : null }
}

// 下载到临时文件，带进度回调
async function downloadToFile(url, destination, onProgress) {
  await fs.mkdir(path.dirname(destination), { recursive: true })
  const response = await fetch(url)
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`)
  const total = Number(response.headers.get('content-length') || 0)
  const chunks = []
  let received = 0
  for await (const chunk of response.body) {
    chunks.push(chunk)
    received += chunk.length
    if (onProgress) onProgress(received, total)
  }
  await fs.writeFile(destination, Buffer.concat(chunks))
  return received
}

// 安装后自检：把「装上了但游戏里没反应」的原因在装完那一刻就说清楚，
// 让玩家知道该找工具还是找模组作者。纯只读检查，不改任何文件。
async function inspectInstalledMod(root, name) {
  const target = safeModPath(root, name)
  const issues = []
  const isFile = p => fs.lstat(p).then(info => info.isFile(), () => false)

  // Scripts/main.lua 是 UE4SS 加载 Lua 模组的唯一入口
  const hasDirect = await isFile(path.join(target, 'Scripts', 'main.lua'))
  let nestedDir = null
  if (!hasDirect) {
    // 常见错误：包内多套了一层同名目录（Mods/X/X/Scripts/...），UE4SS 会找不到入口
    for (const entry of await readDirectoryEntries(target)) {
      if (!entry.isDirectory()) continue
      if (await isFile(path.join(target, entry.name, 'Scripts', 'main.lua'))) { nestedDir = entry.name; break }
    }
    if (nestedDir) issues.push(`包内多套了一层目录「${nestedDir}」，UE4SS 找不到 Scripts/main.lua`)
    else issues.push('这个包没有 Scripts/main.lua，UE4SS 不会把它当作 Lua 模组加载')
  }

  // mods.txt 是否登记并启用
  const states = await readModStates(root)
  const state = states.find(item => item.name.toLowerCase() === name.toLowerCase())
  if (!state) issues.push('mods.txt 里没有登记这个模组')
  else if (!state.enabled) issues.push('mods.txt 里这个模组是关闭状态')

  // UE4SS 本体是否完整（缺任何一半，所有模组都不会加载）
  const win64 = path.join(root, 'MOProject', 'Binaries', 'Win64')
  const loaderReady = await isFile(path.join(win64, 'ue4ss', 'UE4SS.dll'))
  const proxyReady = await isFile(path.join(win64, 'dwmapi.dll'))
  if (!loaderReady || !proxyReady) issues.push('UE4SS 本体不完整（缺 UE4SS.dll 或 dwmapi.dll），所有模组都不会加载')

  return {
    hasMainLua: hasDirect || Boolean(nestedDir),
    registered: Boolean(state),
    enabled: Boolean(state && state.enabled),
    nestedDir,
    issues
  }
}

async function installWork(root, options, onProgress) {
  const { url, localPath = '', title = '', modId = '', version = '', dependencies = '', overwrite = false } = options || {}
  if (!url && !localPath) throw new Error('缺少下载地址')
  if (!(await inspectGame(root)).gameExe) throw new Error('所选目录未检测到烽沙游戏，请重新选择游戏目录。')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const workspace = path.join(managerDataDir(root), 'staging', `work-${process.pid}-${stamp}`)
  // localPath：玩家拖入 / 手动选择的本地 ZIP。直接用原文件，装完绝不删除。
  const archive = localPath || path.join(managerDataDir(root), 'downloads', `${(modId || stamp).replace(/[^\w.-]/g, '_')}.zip`)
  const staging = path.join(workspace, 'payload')
  try {
    if (onProgress) onProgress({ phase: localPath ? 'inspecting' : 'downloading', percent: 0 })
    if (localPath) {
      // 拖入的 ZIP 先预检：不合格就地拦下，不解压、不写入游戏目录
      const precheck = await precheckZipArchive(archive)
      if (!precheck.ok) return { ok: false, rejected: true, error: precheck.issues[0], issues: precheck.issues }
    } else {
      await downloadToFile(url, archive, (received, total) => {
        if (onProgress) onProgress({ phase: 'downloading', percent: total ? Math.min(99, Math.round((received / total) * 100)) : 0, received, total })
      })
      // 工坊下载的包同样预检，挡住漏审的坏包
      const precheck = await precheckZipArchive(archive)
      if (!precheck.ok) return { ok: false, rejected: true, error: precheck.issues[0], issues: precheck.issues }
    }
    if (onProgress) onProgress({ phase: 'inspecting', percent: 0 })
    const entries = await zip.list(archive)
    if (!entries.length) throw new Error('压缩包是空的')
    const kind = classifyZipEntries(entries)
    if (onProgress) onProgress({ phase: 'extracting', percent: 0 })
    await zip.extractTo(archive, staging, (percent) => { if (onProgress) onProgress({ phase: 'extracting', percent }) })

    const manifest = { modId, title, version, dependencies, installedAt: new Date().toISOString(), kind: kind.type }
    if (kind.type === 'pak') {
      const detected = await detectPakSource(staging)
      if (!detected) throw new Error('压缩包里没有找到 PAK 模组文件（.pak / .ucas / .utoc）')
      if (detected.type !== kind.pakType && kind.pakType === 'IoStore') throw new Error('IoStore 模组必须同时包含同名 .pak、.ucas、.utoc 文件')
      await installPakSource(root, staging, detected, overwrite)
      const key = detected.groups.map(group => group.name).join('+')
      await writeManifest(root, key, { ...manifest, kind: 'pak', pakType: detected.type, name: key })
      return { ok: true, kind: 'pak', pakType: detected.type, name: key, groups: detected.groups.map(group => group.name) }
    }

    // 前置包（UE4SS 本体）单独走一条路：合并覆盖到 Win64/ue4ss，不进 Mods、也不写 manifest
    // （它不在 Mods 下，写了会被扫描当成孤儿清单清掉）。
    if (kind.type === 'runtime') {
      const runtimeFolder = kind.folder && kind.folder !== '.' && kind.folder !== '..' ? kind.folder : null
      const result = await installUe4ssRuntime(root, runtimeFolder ? path.join(staging, runtimeFolder) : staging)
      return { ok: true, kind: 'runtime', name: 'UE4SS 前置包', files: result.files, replaced: result.replaced }
    }

    // kind.folder 是解压目录的真实名字，源路径必须原样使用（清洗过就找不到文件了）。
    // 仅接受安全的单段目录名：排除 . 与 ..（zip.list() 已把 \ 归一化为 /，故不可能含分隔符），避免源路径逃出 staging。
    const realFolder = kind.folder && kind.folder !== '.' && kind.folder !== '..' ? kind.folder : null
    const source = realFolder ? path.join(staging, realFolder) : staging
    // 目标文件夹名统一清洗成合法名，否则含空格 / 全角括号的 ZIP 顶层文件夹会整包降级。
    const folder = sanitizeModName(realFolder || title)
    if (!isValidModName(folder)) throw new Error(`模组文件夹名「${folder}」不合法（只能包含中文、字母、数字、下划线、点和短横线，且不超过 ${modNameMaxLength} 个字符）`)
    const states = [...await readModStates(root), { name: folder, enabled: true }]
    await installMod(root, source, folder, overwrite, states)
    await writeManifest(root, folder, { ...manifest, kind: 'ue4ss', name: folder })
    // 装完立刻自检，把「装上了但不会生效」的原因当场说清楚
    const check = await inspectInstalledMod(root, folder)
    return { ok: true, kind: 'ue4ss', name: folder, check }
  } finally {
    await fs.rm(workspace, { recursive: true, force: true }).catch(() => {})
    // localPath 是玩家自己的 ZIP 原件，只读使用，绝不删除
    if (!localPath) await fs.rm(archive, { force: true }).catch(() => {})
  }
}

// 读取 mods.txt 的当前状态，用于安装后保持原有顺序
async function readModStates(root) {
  const rawText = await fs.readFile(path.join(modsPath(root), 'mods.txt'), 'utf8').catch(() => '')
  const states = []
  for (const line of rawText.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(modsLinePattern)
    if (match) states.push({ name: match[1], enabled: match[2] === '1' })
  }
  return states
}

async function installMod(root, source, name, overwrite, states) {
  const sourcePath = path.resolve(source)
  const detected = await detectPakSource(sourcePath)
  if (detected) return installPakSource(root, sourcePath, detected, overwrite)
  const base = modsPath(root)
  const target = safeModPath(root, name)
  if (sourcePath === path.resolve(base) || path.resolve(base).startsWith(`${sourcePath}${path.sep}`)) throw new Error('不要选择游戏安装目录或其上级')
  const sourceInfo = await fs.stat(sourcePath)
  if (!sourceInfo.isDirectory() || path.resolve(source) === path.resolve(target)) throw new Error('请选择有效的单个 MOD 文件夹')
  const info = await fs.lstat(target).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))
  if (info && !overwrite) throw new Error('目标 MOD 已存在，请确认覆盖')
  if (info && !info.isDirectory()) throw new Error('同名目标不是文件夹')
  const backupRoot = path.join(base, 'backup')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  let oldMoved = false
  if (info) {
    await fs.mkdir(backupRoot, { recursive: true })
    await fs.cp(target, path.join(backupRoot, `mod_${name}_${stamp}`), { recursive: true, errorOnExist: true })
  }
  const temporary = path.join(base, `.install-${name}-${process.pid}`)
  await fs.rm(temporary, { recursive: true, force: true })
  let targetCreated = false
  try {
    await fs.cp(sourcePath, temporary, { recursive: true, errorOnExist: true })
    if (info) { await fs.rm(target, { recursive: true, force: true }); oldMoved = true }
    await fs.rename(temporary, target)
    targetCreated = true
    await writeModsFile(root, states)
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true })
    if (targetCreated) await fs.rm(target, { recursive: true, force: true })
    if (oldMoved) await fs.cp(path.join(backupRoot, `mod_${name}_${stamp}`), target, { recursive: true, force: true })
    throw error
  }
}

ipcMain.handle('choose-directory', chooseDirectory)
ipcMain.handle('detect-game', detectGame)
ipcMain.handle('inspect-game', (_event, root) => inspectGame(root))
ipcMain.handle('scan-mods', (_event, root) => scanMods(root))
function agentOrigin(value) {
  const url = new URL(String(value || 'http://127.0.0.1:3000'))
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('Agent API 仅允许连接本机地址（localhost、127.0.0.1 或 ::1）')
  return url.origin
}
const validAgentModel = model => typeof model === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)
const agentTools = [{ type: 'function', function: { name: 'inspect_local_mod_setup', description: '只读检查用户选定的烽沙游戏目录、UE4SS 加载器和当前 UE4SS/PAK 模组状态。不要把它当作游戏内生效验证。', parameters: { type: 'object', properties: {}, additionalProperties: false } } }]
async function agentRequest(origin, pathname, init = {}) {
  const response = await fetch(`${origin}${pathname}`, { ...init, signal: AbortSignal.timeout(60000) })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail = String(body?.error?.message || '')
    if (/\b418\b/.test(detail)) throw new Error('Duck.ai 上游拒绝了请求（HTTP 418）。本机服务已连接，但目前无法获得模型回复。')
    if (response.status === 429 || /rate limit|\b429\b/i.test(detail)) throw new Error('AI 服务请求过于频繁，请稍后重试。')
    throw new Error(`本机 Agent API 返回 HTTP ${response.status}`)
  }
  return response.json()
}
ipcMain.handle('agent-check', async (_event, value) => {
  const origin = agentOrigin(value)
  const models = await agentRequest(origin, '/v1/models')
  const available = Array.isArray(models.data) ? [...new Set(models.data.map(item => item?.id).filter(validAgentModel))].slice(0, 100) : []
  if (!available.length) throw new Error('本机 AI 服务没有返回可用的模型列表。')
  return { online: true, models: available }
})
ipcMain.handle('agent-chat', async (_event, value, model, messages, gameRoot) => {
  const origin = agentOrigin(value)
  if (!validAgentModel(model)) throw new Error('模型名称无效，请重新选择')
  if (!Array.isArray(messages) || !messages.length || messages.length > 12) throw new Error('对话内容无效或过长')
  const safeMessages = messages.map(message => {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.content.length > 2000) throw new Error('对话内容无效')
    return { role: message.role, content: message.content }
  })
  const root = typeof gameRoot === 'string' && path.isAbsolute(gameRoot) ? gameRoot : ''
  const messagesWithPolicy = [{ role: 'system', content: '你是烽沙 MOD 管理器内的只读诊断助手。可调用的工具只会读取用户当前选择的本机游戏目录。不得声称已经执行安装、启用、排序、修改或启动操作；不得把本机诊断当作游戏内生效证明。PAK 与 UE4SS 是不同模组形式，分析时应区分。回答中文、简洁并依据工具数据；缺少数据就明确说明。' }, ...safeMessages]
  for (let round = 0; round < 3; round++) {
    const result = await agentRequest(origin, '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer dummy-key' }, body: JSON.stringify({ model, messages: messagesWithPolicy, tools: root ? agentTools : undefined, tool_choice: root ? 'auto' : undefined }) })
    const message = result.choices?.[0]?.message
    if (!message) throw new Error('Agent API 返回了无法识别的响应')
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : []
    if (!calls.length) {
      if (typeof message.content !== 'string' || !message.content.trim()) throw new Error('模型没有返回文字内容，请稍后重试。')
      return message.content.slice(0, 6000)
    }
    if (calls.length > 3 || calls.some(call => !call.id || call.function?.name !== 'inspect_local_mod_setup')) throw new Error('模型请求了无效或过多的工具调用，已拒绝执行')
    messagesWithPolicy.push({ role: 'assistant', content: message.content || '', tool_calls: calls })
    for (const call of calls) {
      const info = await inspectGame(root)
      if (!info.gameExe) {
        messagesWithPolicy.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ gameFound: false, message: '没有在当前选择目录找到烽沙游戏主程序。' }) })
        continue
      }
      const base = modsPath(root)
      const rawText = await fs.readFile(path.join(base, 'mods.txt'), 'utf8').catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error))
      const states = new Map([...rawText.matchAll(/^\s*([^\r\n:#]+?)\s*:\s*([01])/gm)].map(match => [match[1].trim().toLowerCase(), match[2] === '1']))
      const ue4ss = (await readDirectoryEntries(base)).filter(entry => entry.isDirectory() && !blockedModNames.includes(entry.name.toLowerCase())).slice(0, 100).map(entry => ({ name: entry.name, enabled: states.get(entry.name.toLowerCase()) ?? false }))
      const pakRoot = paksPath(root)
      const pak = {}
      for (const [type, folder] of Object.entries(pakKinds)) pak[type] = (await readDirectoryEntries(path.join(pakRoot, folder))).filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.pak')).slice(0, 100).map(entry => entry.name)
      messagesWithPolicy.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ gameFound: info.gameExe, ue4ssReady: info.ue4ssReady, ue4ssVersion: info.ue4ssVersion, modsManifestFound: info.modsReady, pakLoaderLogSeen: info.pakLoaderLogSeen, ue4ssMods: ue4ss, pakMods: pak }) })
    }
  }
  throw new Error('Agent 工具调用次数超限，请缩小问题后重试。')
})
ipcMain.handle('inspect-mod-source', (_event, root, source) => inspectModSource(root, source))
ipcMain.handle('write-mods', (_event, root, states) => writeModsFile(root, states))
ipcMain.handle('set-pak-enabled', (_event, root, type, name, enabled) => setPakEnabled(root, type, name, enabled))
ipcMain.handle('mod-exists', async (_event, root, name) => !!await fs.lstat(safeModPath(root, name)).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error)))
ipcMain.handle('install-mod', (_event, ...args) => installMod(...args))
ipcMain.handle('install-work', (event, root, options) => installWork(root, options, progress => event.sender.send('install-work-progress', progress)))
ipcMain.handle('launch-game', () => shell.openExternal('steam://run/1733690'))
// 在资源管理器里打开指定目录（用户菜单的「打开游戏路径」）。
// shell.openPath 成功时返回空字符串，失败返回错误描述，原样交给渲染层展示。
ipcMain.handle('open-path', (_event, target) => {
  if (typeof target !== 'string' || !target.trim()) throw new Error('没有可打开的游戏目录')
  return shell.openPath(target)
})
ipcMain.handle('copy-text', (_event, text) => require('electron').clipboard.writeText(String(text)))
ipcMain.handle('cloud-config', async () => {
  // 依次尝试：Supabase → 站点镜像 → 内置兜底。任何一层拿到可用配置就返回；
  // 全都失败也仍然可用，而不是把玩家挡在门外。
  for (const url of [runtimeConfigUrl, runtimeConfigMirrorUrl]) {
    try {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
      if (!response.ok) continue
      const config = await response.json()
      if (config && typeof config.supabaseUrl === 'string' && config.supabaseUrl && typeof config.publishableKey === 'string' && config.publishableKey) {
        return { ...bundledCloudConfig, ...config }
      }
    } catch { /* 换下一个源 */ }
  }
  return bundledCloudConfig
})
ipcMain.handle('open-external', (_event, url) => {
  if (/^https:\/\//i.test(url)) return shell.openExternal(url)
})

function createWindow() {
  const win = new BrowserWindow({ width: 1540, height: 980, minWidth: 1080, minHeight: 720, backgroundColor: '#0a0c0f', show: false, autoHideMenuBar: true, icon: path.join(__dirname, 'dist', 'assets', 'fengsha-mod-icon.png'), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  mainWindow = win
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' } })
  if (process.env.FENGSHA_DEV_URL) win.loadURL(process.env.FENGSHA_DEV_URL)
  else win.loadFile(path.join(__dirname, app.isPackaged ? 'dist' : path.join('..', 'dist'), 'index.html'))
}
app.whenReady().then(async () => { if (process.platform === 'win32') app.setAppUserModelId('com.fengsha.mod-manager'); createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() }); await cleanupUpdateLeftovers() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
