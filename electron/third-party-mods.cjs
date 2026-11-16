const fs = require('node:fs/promises')
const path = require('node:path')

const THREE_DM_SEARCH = 'https://so.3dmgame.com/'
const THREE_DM_PAGE = /^https:\/\/dl\.3dmgame\.com\/patch\/\d+\.html$/i
const THREE_DM_DOWNLOAD_HOSTS = new Set(['down.shwswl.cn', 'down1.wsyhn.com', 'download.shwswl.cn'])
const NEXUS_GRAPHQL = 'https://api.nexusmods.com/v2/graphql'
const ALI_SEARCH = 'https://patch.ali213.net/list_search.php'

function decodeHtml(value = '') {
  return String(value)
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
}

function textOf(value = '') {
  return decodeHtml(String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/[\t\r\n ]+/g, ' ').trim()
}

async function getHtml(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'FengshaModManager/0.3 (+in-app public mod catalog)' }, signal: AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error(`来源返回 HTTP ${response.status}`)
  return response.text()
}

async function nexusRequest(query, variables = {}) {
  const response = await fetch(NEXUS_GRAPHQL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'FengshaModManager/0.3 (public Nexus catalog)' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15000)
  })
  if (!response.ok) throw new Error(`Nexus API 返回 HTTP ${response.status}`)
  const payload = await response.json()
  if (payload.errors?.length) throw new Error(payload.errors[0].message || 'Nexus API 查询失败')
  return payload.data
}

function safeNexusImage(value = '') {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'staticdelivery.nexusmods.com' ? parsed.href : ''
  } catch { return '' }
}

async function searchNexusMods(query = '') {
  const data = await nexusRequest(`query FengshaMods($filter: ModsFilter, $count: Int) {
    mods(filter: $filter, count: $count) {
      nodes { modId gameId name author summary description pictureUrl thumbnailUrl directDownloadEnabled fileSize version updatedAt downloads }
      totalCount
    }
  }`, {
    filter: { op: 'AND', gameDomainName: [{ value: 'mandateorder' }] },
    count: 100
  })
  const typedQuery = String(query).trim()
  const needle = typedQuery.includes('烽沙') ? '' : typedQuery.toLocaleLowerCase()
  const mods = (data.mods?.nodes || []).filter(mod => !needle || `${mod.name} ${mod.author} ${mod.summary} ${mod.description}`.toLocaleLowerCase().includes(needle))
  return Promise.all(mods.slice(0, 20).map(async mod => {
    let files = []
    try {
      const fileData = await nexusRequest(`query FengshaModFiles($modId: ID!, $gameId: ID!) {
        modFiles(modId: $modId, gameId: $gameId) { fileId name version category detectedFileExtension size primary date }
      }`, { modId: String(mod.modId), gameId: String(mod.gameId) })
      files = (fileData.modFiles || []).map(file => ({ ...file, sizeLabel: file.size ? `${file.size} KB` : '' }))
    } catch { /* Keep the public mod card even if the optional file listing is unavailable. */ }
    return {
      id: `nexus-${mod.modId}`, source: 'Nexus Mods', title: mod.name, summary: textOf(mod.summary || '').slice(0, 260),
      description: textOf(mod.description || ''), date: mod.updatedAt ? new Date(mod.updatedAt).toISOString().slice(0, 10) : '',
      size: mod.fileSize ? `${mod.fileSize} KB` : '', author: mod.author || '',
      image: safeNexusImage(mod.pictureUrl || mod.thumbnailUrl), pageUrl: `https://www.nexusmods.com/mandateorder/mods/${Number(mod.modId)}`,
      version: mod.version || '', downloads: Number(mod.downloads) || 0, directDownloadEnabled: Boolean(mod.directDownloadEnabled), files,
      downloadUrl: '', fileName: '', downloadReason: mod.directDownloadEnabled
        ? 'Nexus 标记此条目可免页面直下，但文件链接仍需官方 API 授权；当前没有安全可用的直连地址。'
        : '作者未开启 Nexus 的免访问页面直下功能。管理器不会绕过此设置或打开 Nexus 页面。'
    }
  }))
}

async function searchAliMods(query = '') {
  const keyword = String(query).trim() || '烽沙'
  const url = new URL(ALI_SEARCH)
  url.searchParams.set('sword', keyword)
  url.searchParams.set('classid', '16')
  const html = await getHtml(url.href)
  const output = []
  const pattern = /<a\b([^>]*href=["'](?:https?:\/\/patch\.ali213\.net)?\/showpatch\/(\d+)\.html[^>]*)>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(pattern)) {
    const id = match[2]
    if (output.some(item => item.id === `ali-${id}`)) continue
    const title = textOf(match[1].match(/\btitle=["']([^"']+)["']/i)?.[1] || match[3])
    if (!title) continue
    output.push({ id: `ali-${id}`, source: '游侠网', title, summary: '', description: '', date: '', size: '', author: '',
      image: '', pageUrl: `https://patch.ali213.net/showpatch/${id}.html`, downloadUrl: '', fileName: '',
      downloadReason: '游侠补丁页使用“点击查找”打开网友推荐的资源地址页，没有公开稳定的文件直链。为避免跳站或下载到错误文件，这里只展示条目信息。' })
  }
  return Promise.all(output.slice(0, 20).map(async item => {
    try {
      const detail = await getHtml(item.pageUrl)
      const title = textOf(detail.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']*)/i)?.[1] || detail.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || item.title).replace(/下载_游侠网$/, '')
      const summary = textOf(detail.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)/i)?.[1] || '')
      const imageValue = detail.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i)?.[1]
        || detail.match(/<img[^>]+src=["'](https:\/\/imgs\.ali213\.net\/[^"']+)["']/i)?.[1] || ''
      const image = (() => { try { const parsed = new URL(decodeHtml(imageValue)); return parsed.protocol === 'https:' && /(^|\.)ali213\.net$/i.test(parsed.hostname) ? parsed.href : '' } catch { return '' } })()
      const size = textOf(detail.match(/(?:游戏大小|补丁大小|文件大小)\s*[:：]?\s*([^<\s]{1,30})/i)?.[0] || '')
      const gameText = `${title} ${summary}`
      if (!/烽沙|mandate\s*order/i.test(gameText)) return null
      return { ...item, title, summary: summary.slice(0, 260), description: summary, image, size }
    } catch { return item }
  })).then(items => items.filter(Boolean))
}

async function searchThreeDmMods(query = '') {
  const keyword = String(query).trim() || '烽沙'
  const url = new URL(THREE_DM_SEARCH)
  url.searchParams.set('keyword', keyword)
  url.searchParams.set('subsearch', '1')
  url.searchParams.set('type', '6')
  const html = await getHtml(url.href)
  const output = []
  const pattern = /<div\s+class=["']search_lis[^"']*["'][^>]*>[\s\S]*?<a\s+href=["'](https:\/\/dl\.3dmgame\.com\/patch\/\d+\.html)["']\s+class=["']bt["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(pattern)) {
    const title = textOf(match[2])
    if (!title || !THREE_DM_PAGE.test(match[1])) continue
    const blockStart = html.lastIndexOf('<div class="search_lis', match.index)
    const nextBlock = html.indexOf('<div class="search_lis', match.index + match[0].length)
    const block = html.slice(Math.max(0, blockStart), nextBlock < 0 ? html.length : nextBlock)
    const date = block.match(/更新：\s*(20\d{2}-\d{2}-\d{2})/i)?.[1] || ''
    const size = block.match(/大小：\s*([\d.]+\s*(?:MB|KB|GB))/i)?.[1] || ''
    const image = decodeHtml(block.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || '')
    const summary = textOf(block.match(/<ul\s+class=["']info["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1] || '')
    output.push({ id: match[1].match(/\d+/g)?.at(-1) || match[1], source: '3DM', title, summary: summary || '3DM 单机补丁站收录的烽沙资源。', date, size, pageUrl: match[1], image, description: '', author: '', downloadUrl: '', fileName: '', downloadReason: '正在读取资源详情' })
  }
  return output
}

function extractMeta(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return html.match(new RegExp(`<meta\\s+(?:name|property)=["']${escaped}["']\\s+content=["']([^"']*)`, 'i'))?.[1]
    || html.match(new RegExp(`<meta\\s+content=["']([^"']*)["']\\s+(?:name|property)=["']${escaped}["']`, 'i'))?.[1] || ''
}

async function detailFor(item) {
  if (!THREE_DM_PAGE.test(item.pageUrl)) throw new Error('资源详情地址无效')
  const html = await getHtml(item.pageUrl)
  const title = textOf(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || item.title)
  const image = decodeHtml(extractMeta(html, 'og:image'))
  const detailText = textOf(html.match(/<div\s+class=["']GmL_1["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '')
  if (!/烽沙|mandate\s*order/i.test(`${title} ${detailText}`)) throw new Error('资源页面未能确认属于烽沙（Mandate Order），已过滤')
  const localLink = html.match(/<a\s+href=["'](https:\/\/[^"']+)["'][^>]*class=["'][^"']*\bdx\b[^"']*["']/i)?.[1]
  const allowedUrl = localLink && (() => {
    try { const parsed = new URL(localLink); return parsed.protocol === 'https:' && THREE_DM_DOWNLOAD_HOSTS.has(parsed.hostname.toLowerCase()) ? parsed.href : '' } catch { return '' }
  })()
  const description = detailText || textOf(html.match(/<meta\s+name=["']Description["']\s+content=["']([^"']*)/i)?.[1] || '')
  const info = textOf(html.match(/<ul\s+class=["']lis["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1] || '')
  const size = info.match(/大小[:：]\s*([\w.]+)/)?.[1] || item.size
  const author = info.match(/补丁制作[:：]\s*([^补丁语言版本]+)/)?.[1]?.trim() || ''
  const safeImage = (() => { try { const parsed = new URL(image); return parsed.protocol === 'https:' && /(^|\.)3dmgame\.com$/i.test(parsed.hostname) ? parsed.href : '' } catch { return '' } })()
  const fileName = allowedUrl ? path.basename(new URL(allowedUrl).pathname) : ''
  return { ...item, title, image: safeImage, summary: description.slice(0, 220) || item.summary, description, author, size, fileName,
    downloadUrl: allowedUrl || '',
    downloadReason: allowedUrl ? '' : '来源页面没有提供可直连的本地下载文件，暂不能在管理器内下载。' }
}

async function searchThirdPartyMods(query = '') {
  const pages = await Promise.allSettled([searchThreeDmMods(query), searchNexusMods(query), searchAliMods(query)])
  const threeDmItems = pages[0]?.status === 'fulfilled' ? pages[0].value : []
  const nexusItems = pages[1]?.status === 'fulfilled' ? pages[1].value : []
  const aliItems = pages[2]?.status === 'fulfilled' ? pages[2].value : []
  const filtered = [...new Map(threeDmItems.map(item => [item.id, item])).values()]
  const detailed = await Promise.allSettled(filtered.slice(0, 30).map(detailFor))
  const threeDmDetails = detailed.filter(result => result.status === 'fulfilled').map(result => result.value)
  const externalItems = [...nexusItems, ...aliItems]
  return { items: [...threeDmDetails, ...externalItems],
    sourceStatus: pages[0]?.status === 'rejected' ? `3DM 搜索暂时无法访问：${pages[0].reason?.message || '请稍后重试。'}` : '',
    sourceErrors: [
      pages[1]?.status === 'rejected' ? { name: 'Nexus Mods', message: pages[1].reason?.message || 'Nexus API 暂时无法访问。' } : null,
      pages[2]?.status === 'rejected' ? { name: '游侠网', message: pages[2].reason?.message || '游侠补丁搜索暂时无法访问。' } : null
    ].filter(Boolean), unavailableSources: [] }
}

function safeFilename(value) {
  const cleaned = String(value || 'third-party-mod').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 120)
  return cleaned || 'third-party-mod'
}

async function downloadThirdPartyMod(item, onProgress) {
  if (!item || item.source !== '3DM' || !THREE_DM_PAGE.test(item.pageUrl)) throw new Error('该来源没有可验证的应用内下载文件')
  const verified = await detailFor(item)
  if (!verified.downloadUrl) throw new Error(verified.downloadReason)
  let targetUrl = verified.downloadUrl
  let response
  for (let hop = 0; hop < 4; hop++) {
    const parsed = new URL(targetUrl)
    if (parsed.protocol !== 'https:' || !THREE_DM_DOWNLOAD_HOSTS.has(parsed.hostname.toLowerCase())) throw new Error('文件服务器跳转到了未验证的来源，已停止下载。')
    response = await fetch(targetUrl, { headers: { 'user-agent': 'FengshaModManager/0.3' }, redirect: 'manual', signal: AbortSignal.timeout(60000) })
    if (![301, 302, 303, 307, 308].includes(response.status)) break
    const location = response.headers.get('location')
    if (!location || hop === 3) throw new Error('文件服务器重定向次数过多。')
    targetUrl = new URL(location, targetUrl).href
  }
  if (!response.ok || !response.body) throw new Error(`文件服务器返回 HTTP ${response.status}`)
  const declaredSize = Number(response.headers.get('content-length')) || 0
  if (declaredSize > 100 * 1024 * 1024) throw new Error('资源超过 100 MB，当前版本不在应用内下载。')
  const dir = path.join(require('electron').app.getPath('userData'), 'third-party-downloads')
  await fs.mkdir(dir, { recursive: true })
  const fileName = safeFilename(`${verified.title} - ${verified.fileName || 'download'}`)
  const destination = path.join(dir, fileName)
  const chunks = []
  let received = 0
  const total = declaredSize
  for await (const chunk of response.body) {
    chunks.push(Buffer.from(chunk)); received += chunk.length
    if (received > 100 * 1024 * 1024) throw new Error('资源超过 100 MB，已停止下载。')
    onProgress?.({ received, total, percent: total ? Math.min(99, Math.round(received / total * 100)) : 0 })
  }
  await fs.writeFile(destination, Buffer.concat(chunks), { flag: 'w' })
  return { ok: true, path: destination, fileName, size: received, executable: /\.(?:exe|msi|bat|cmd)$/i.test(fileName) }
}

module.exports = { searchThirdPartyMods, downloadThirdPartyMod }
