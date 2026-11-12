'use strict'
// 极简 ZIP 读取/解压实现，不引入任何第三方依赖。
//
// 只支持 ZIP 实际会用到的两种压缩方式：stored(0) 与 deflate(8)。
// 解压用运行时自带的 DecompressionStream('deflate-raw')（Node 18+ / Chromium 均可用），
// 这样桌面主进程和浏览器渲染层可以共用同一套逻辑，也不必往安装包里塞 zip 库。
const fsp = require('fs/promises')
const path = require('path')

const EOCD_SIG = 0x06054b50
const CD_SIG = 0x02014b50
const LFH_SIG = 0x04034b50

// 从尾部往前找中央目录结束记录（注释最长 65535 字节）
function findEocd(buf) {
  const floor = Math.max(0, buf.length - 65557)
  for (let i = buf.length - 22; i >= floor; i--) if (buf.readUInt32LE(i) === EOCD_SIG) return i
  return -1
}

// 路径穿越防护：压缩包里的 ../ 不能写到目标目录之外。
// 注意必须先把 root 规范化 —— 调用方传进来的可能是正斜杠路径，
// 而 path.resolve 在 Windows 上返回反斜杠，直接 startsWith 比较会永远失败。
function safeJoin(root, name) {
  const base = path.resolve(root)
  const resolved = path.resolve(base, name)
  return resolved === base || resolved.startsWith(base + path.sep) ? resolved : null
}

// ZIP 规范要求用正斜杠，但 Windows 的 Compress-Archive 会写成反斜杠，
// 真实世界的压缩包两种都出现过，这里统一归一化。
function normalizeName(name) { return name.replace(/\\/g, '/') }
function isDirectoryEntry(name) { return /[\\/]$/.test(name) }

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return Buffer.from(await new Response(stream).arrayBuffer())
}

async function readCentralDirectory(zipPath) {
  const buf = await fsp.readFile(zipPath)
  const eocd = findEocd(buf)
  if (eocd < 0) throw new Error('不是有效的 ZIP 文件（未找到中央目录）')
  const total = buf.readUInt16LE(eocd + 10)
  let offset = buf.readUInt32LE(eocd + 16)
  const entries = []
  for (let i = 0; i < total; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CD_SIG) break
    const nameLength = buf.readUInt16LE(offset + 28)
    const extraLength = buf.readUInt16LE(offset + 30)
    const commentLength = buf.readUInt16LE(offset + 32)
    entries.push({
      name: buf.toString('utf8', offset + 46, offset + 46 + nameLength),
      method: buf.readUInt16LE(offset + 10),
      compressedSize: buf.readUInt32LE(offset + 20),
      uncompressedSize: buf.readUInt32LE(offset + 24),
      localOffset: buf.readUInt32LE(offset + 42)
    })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return { buf, entries }
}

// 只列条目名，用于在解压前判断这是 PAK 还是 UE4SS 模组
async function list(zipPath) {
  const { entries } = await readCentralDirectory(zipPath)
  return entries.filter(entry => !isDirectoryEntry(entry.name)).map(entry => normalizeName(entry.name))
}

// 解压到目标目录。返回写出的相对路径列表。
// 目标目录必须由调用方保证是安全的（本函数只负责条目内的路径穿越防护）。
async function extractTo(zipPath, destDir, onProgress) {
  const { buf, entries } = await readCentralDirectory(zipPath)
  const files = entries.filter(entry => !isDirectoryEntry(entry.name))
  const written = []
  for (let i = 0; i < files.length; i++) {
    const entry = files[i]
    const target = safeJoin(destDir, normalizeName(entry.name))
    if (!target) continue
    if (buf.readUInt32LE(entry.localOffset) !== LFH_SIG) continue
    const nameLength = buf.readUInt16LE(entry.localOffset + 26)
    const extraLength = buf.readUInt16LE(entry.localOffset + 28)
    const start = entry.localOffset + 30 + nameLength + extraLength
    const raw = buf.subarray(start, start + entry.compressedSize)
    let data
    if (entry.method === 0) data = Buffer.from(raw)
    else if (entry.method === 8) data = await inflateRaw(raw)
    else continue // 不认识的压缩方式直接跳过，避免写出坏文件
    await fsp.mkdir(path.dirname(target), { recursive: true })
    await fsp.writeFile(target, data)
    written.push(normalizeName(entry.name))
    if (onProgress && (i % 20 === 0 || i === files.length - 1)) onProgress(Math.round(((i + 1) / files.length) * 100), entry.name)
  }
  return written
}

// 从内存中的 ZIP 数据解压（用于先下载到内存再落盘的场景）
async function extractBufferTo(buffer, destDir) {
  const tmp = path.join(require('os').tmpdir(), `fengsha-zip-${process.pid}-${Date.now()}.zip`)
  await fsp.writeFile(tmp, buffer)
  try { return await extractTo(tmp, destDir) } finally { await fsp.rm(tmp, { force: true }) }
}

module.exports = { list, extractTo, extractBufferTo, safeJoin }
