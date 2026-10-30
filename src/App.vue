<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ArrowDownWideNarrow, ArrowDown, ArrowLeft, ArrowUp, BookOpen, Bot, Check, ChevronDown, ChevronRight, CircleAlert, CircleUserRound, Clipboard, CloudDownload, CloudOff, Download, FileArchive, Folder, FolderOpen, Gamepad2, Grid2X2, GripVertical, HardDrive, Heart, List, ListOrdered, LoaderCircle, Lock, LogOut, Mail, MessageCircle, Package, Pin, PinOff, Plus, RefreshCw, Search, Send, Settings, Share2, ShieldCheck, Star, Trash2, Unlock, Upload, Wallet, Wrench, X } from 'lucide-vue-next'
import { createClient } from '@supabase/supabase-js'

const GAME_PARTS = ['MOProject', 'Binaries', 'Win64', 'ue4ss', 'Mods']
const mods = ref([])
const logs = ref([])
const query = ref('')
const filter = ref('全部模组')
const categoryFilter = ref('全部分类')
const sort = ref('加载顺序')
const view = ref('list')
const activeTab = ref('本地管理')
const agentOrigin = ref(localStorage.getItem('fengsha-agent-origin') || 'http://127.0.0.1:3000')
const agentModel = ref(localStorage.getItem('fengsha-agent-model') || 'gpt-4o-mini')
const agentOnline = ref(false)
const agentAnswered = ref(false)
const agentModelsFound = ref([])
const agentBusy = ref(false)
const agentError = ref('')
const agentDraft = ref('')
const agentMessages = ref([{ role: 'assistant', content: '你好，我是烽沙 MOD 诊断助手。连接本机 DuckAI 后，我可以结合已选择的游戏目录检查 UE4SS、PAK 与模组状态。' }])
const rootName = ref(localStorage.getItem('fengsha-game-name') || '尚未选择游戏目录')
const pathHint = ref(localStorage.getItem('fengsha-game-path') || '')
const gameReady = ref(false)
const ue4ssReady = ref(false)
const ue4ssVersion = ref('')
const pakLoaderLogSeen = ref(false)
const scanning = ref(false)
const settingsOpen = ref(false)
const showUpdateDialog = ref(false)
const updateInfo = ref(null)
const updatePhase = ref('idle')
const updateProgress = ref({ received: 0, total: 0 })
const updateError = ref('')
let stopUpdateProgress = () => {}
const selected = ref(null)
const rootHandle = ref(null)
const modsHandle = ref(null)
// 浏览器版：目录句柄已从 IndexedDB 恢复，但还差一次用户手势授权（permission = prompt）
const needsHandlePermission = ref(false)
const sourceHandle = ref(null)
const rawLines = ref([])
const errorMessage = ref('')
const workshopQuery = ref('')
const workshopCategory = ref('全部分类')
const workshopSort = ref('最新发布')
// 工坊导航当前项。之前这个高亮是写死在「发现作品」上的，点其他两项没有任何反馈。
const workshopView = ref('discover')
const selectedWork = ref(null)
const showDraftDialog = ref(false)
const editingDraftId = ref(null)
const editingPublishedModId = ref(null)
const draftForm = ref(emptyDraft())
const drafts = ref(loadDrafts())
const workshopWorks = ref([])
const workshopLoading = ref(false)
const workshopError = ref('')
// 管理员置顶操作进行中，用于按钮加载态与防重复提交
const pinSubmitting = ref(false)
const cloudUser = ref(null)
const authorWorks = ref([])
const showAuthDialog = ref(false)
const authMode = ref('login')
const awaitingSignupCode = ref(false)
const authCode = ref('')
const authError = ref('')
const authForm = ref({ username: '', email: '', password: '' })
const packageFile = ref(null)
const coverFile = ref(null)
const screenshotFiles = ref([])
const coverPreview = ref('')
const screenshotPreviews = ref([])
const submitting = ref(false)
const uploadPhase = ref('')
const supabaseClient = ref(null)
const supabaseBucket = ref('fengsha-mods')
const supabaseProjectUrl = ref('')
const WORKSHOP_FALLBACK_URL = 'https://fengsha-mod-workshop.xj15378902242.chatgpt.site/'
const workshopUrl = ref(WORKSHOP_FALLBACK_URL)
const isDesktop = Boolean(window.fengshaDesktop)
const assetBase = `${import.meta.env.BASE_URL}assets/`
// 站点可能部署在子路径下（GitHub Pages 项目站点），所有站内链接都要带上 BASE_URL。
const siteBase = import.meta.env.BASE_URL
const hasGameRoot = computed(() => Boolean(pathHint.value))
const communityState = ref({ likes: 0, favorites: 0, comments: 0, liked: false, favorited: false })
const communityComments = ref([])
const communityComment = ref('')
const communityLoading = ref(false)
const communitySubmitting = ref(false)
const communityError = ref('')
// 把扁平评论组织成「顶层评论 + 它的作者回复」；回复按时间正序，读起来才像对话
const commentThreads = computed(() => {
  const roots = communityComments.value.filter(item => !item.parent_id)
  const replies = communityComments.value.filter(item => item.parent_id)
  return roots.map(root => ({ root, replies: replies.filter(reply => reply.parent_id === root.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) }))
})
// 我的 MOD 表格：按状态筛选
const shownAuthorWorks = computed(() => authorFilter.value === '全部' ? authorWorks.value : authorWorks.value.filter(work => work.status === 'published'))
// 作者名下所有作品的收藏总数，显示在下拉菜单顶部
const authorFavoriteTotal = computed(() => authorWorks.value.reduce((sum, work) => sum + Number(work.favorites || 0), 0))
const platformDonationPath = ref(null)
const platformDonationUrl = ref('')
const platformDonationOpen = ref(false)
const donationTarget = ref('platform')
const platformDonationName = ref('')
const platformDonationPreview = ref('')
const platformDonationUpload = ref(null)
const platformDonationInput = ref(null)
const platformSaving = ref(false)
const platformError = ref('')
const platformNotice = ref('')
// 作品页展示的是「作者在用户中心设置的收款码」
const authorDonationUrl = ref('')
const authorDonationLoading = ref(false)
// 用户中心
const userCenterOpen = ref(false)
const profileDonationPath = ref(null)
const profileDonationUrl = ref('')
const profileDonationFile = ref(null)
const profileDonationPreview = ref('')
const profileDonationName = ref('')
const profileDonationInput = ref(null)
const profileSaving = ref(false)
const profileError = ref('')
const profileNotice = ref('')
// 头像
const avatarPath = ref('')
const avatarUrl = ref('')
const avatarFile = ref(null)
const avatarPreview = ref('')
const avatarInput = ref(null)
const avatarSaving = ref(false)
// 顶栏账号下拉菜单
const accountMenuOpen = ref(false)
// 作者回复评论
const replyTarget = ref(null)
const replyDraft = ref('')
const replySubmitting = ref(false)
// 我的 MOD 表格
const authorFilter = ref('全部')
const deletingWorkId = ref('')
// 异步操作的加载态，避免玩家以为界面卡死而重复点击
const authBusy = ref(false)
const authBusyText = ref('')
const resendingCode = ref(false)
const coverInput = ref(null)
const screenshotInput = ref(null)

function emptyDraft() {
  return { title: '', summary: '', description: '', version: '1.0.0', category: '游戏机制', modType: 'ue4ss', tags: '', compatibility: '', dependencies: '', changelog: '', author: localStorage.getItem('fengsha-author-name') || '', packageName: '', packageSize: 0, coverName: '', screenshotNames: [] }
}

// ---- 上传前校验 ----
// 只读 ZIP 的中央目录拿文件名列表，不解压（几十 MB 的包也是瞬间完成）。
function readZipEntryNames(buffer) {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let eocd = -1
  const floor = Math.max(0, bytes.length - 65557)
  for (let i = bytes.length - 22; i >= floor; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('这不是有效的 ZIP 文件')
  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const decoder = new TextDecoder('utf-8')
  const names = []
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break
    const nameLen = view.getUint16(offset + 28, true)
    const extraLen = view.getUint16(offset + 30, true)
    const commentLen = view.getUint16(offset + 32, true)
    names.push(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen)))
    offset += 46 + nameLen + extraLen + commentLen
  }
  return names
}

// 按作者声明的类型检查包结构，返回问题列表（空数组 = 通过）。
// 这些正是「玩家装上却不生效」最常见的几个原因，能在上传时就挡住。
function inspectPackage(entries, declaredType) {
  const lower = entries.map(name => name.toLowerCase())
  const has = suffix => lower.some(name => name === suffix || name.endsWith('/' + suffix))
  const hasMainLua = lower.some(name => name.endsWith('scripts/main.lua'))
  const hasPak = lower.some(name => /\.(pak|ucas|utoc)$/.test(name))
  const hasUe4ssRuntime = has('ue4ss.dll') || has('ue4ss-settings.ini')
  const nested = lower.some(name => /^[^/]+\/[^/]+\/scripts\/main\.lua$/.test(name))
  const firsts = [...new Set(entries.map(name => name.split('/')[0]).filter(Boolean))]
  const folder = firsts.length === 1 && entries.every(name => name.includes('/')) ? firsts[0] : null

  const issues = []
  if (declaredType === 'pak') {
    if (!hasPak) issues.push('你选择的是 PAK 模组，但压缩包里没有 .pak / .ucas / .utoc 文件')
  } else if (declaredType === 'runtime') {
    if (!hasUe4ssRuntime) issues.push('你选择的是 UE4SS 前置包，但压缩包里没有 UE4SS.dll 或 UE4SS-settings.ini')
    if (hasMainLua) issues.push('这个包里有 Scripts/main.lua，看起来是普通模组，不是前置包')
  } else {
    if (hasUe4ssRuntime) issues.push('这个包里装的是 UE4SS 本体（UE4SS.dll），属于前置包，请把类型改成「UE4SS 前置包」')
    else if (!hasMainLua) issues.push('缺少 Scripts/main.lua —— UE4SS 只加载带 main.lua 的模组，玩家装上也不会生效')
    else if (nested) issues.push('包内多套了一层目录（形如 X/X/Scripts/main.lua），UE4SS 会找不到入口，请把 Scripts 直接放在顶层文件夹下')
  }
  return { issues, folder, hasMainLua, hasPak, hasUe4ssRuntime }
}

function loadDrafts() {
  try { return JSON.parse(localStorage.getItem('fengsha-local-drafts') || '[]') } catch { return [] }
}

const enabledCount = computed(() => mods.value.filter(m => m.enabled).length)
// 选中项在中间栏展示详情。之前详情挤在右侧 273px 的窄栏里，
// 内容一长（作品说明 + 效果图 + 评论区）就没法看。
const centerDetail = computed(() => {
  if (activeTab.value === '工坊' || activeTab.value === '创作中心') return selectedWork.value
  if (activeTab.value === '本地管理') return selected.value
  return null
})
const categories = computed(() => [...new Set(mods.value.map(m => m.category))])
const workshopCategories = computed(() => [...new Set(workshopWorks.value.map(m => m.category))])
// 工坊卡片的「已安装 / 已下载」角标。
// 「已安装」以磁盘为准：后端把 manifest 里的 modId 挂在 mod.cloud.id 上，
// 玩家在本地删掉模组后角标会自动消失，不需要额外维护一份状态。
const installedWorkIds = computed(() => new Set(mods.value.map(mod => mod.cloud?.id).filter(Boolean)))
// 「已下载」只记在本机：下载过但还没装（或已删除）的作品。重装系统就清空，不必上云。
const downloadedWorkIds = ref(new Set())
try {
  const saved = JSON.parse(localStorage.getItem('fengsha-downloaded-works') || '[]')
  if (Array.isArray(saved)) downloadedWorkIds.value = new Set(saved)
} catch { /* 本地记录损坏就当没有 */ }
function markDownloaded(id) {
  if (!id || downloadedWorkIds.value.has(id)) return
  downloadedWorkIds.value.add(id)
  try {
    // 只留最近 500 条，避免 localStorage 无限增长
    localStorage.setItem('fengsha-downloaded-works', JSON.stringify([...downloadedWorkIds.value].slice(-500)))
  } catch { /* 存储写不进去不影响下载 */ }
}
const shownWorks = computed(() => {
  const q = workshopQuery.value.trim().toLowerCase()
  const list = workshopWorks.value.filter(m => (workshopCategory.value === '全部分类' || m.category === workshopCategory.value) && `${m.title} ${m.author} ${m.summary} ${m.category}`.toLowerCase().includes(q))
  // 置顶作品（pinned_at 非空）优先，其余按原排序规则。
  return list.sort((a, b) => {
    const pinDelta = Number(Boolean(b.pinned_at)) - Number(Boolean(a.pinned_at))
    if (pinDelta) return pinDelta
    return workshopSort.value === '名称排序' ? a.title.localeCompare(b.title, 'zh-CN') : new Date(b.created_at) - new Date(a.created_at)
  })
})
const shownMods = computed(() => {
  const q = query.value.trim().toLocaleLowerCase()
  return mods.value.filter(m => {
    const matches = !q || `${m.name} ${m.description} ${m.author}`.toLocaleLowerCase().includes(q)
    const state = filter.value === '全部模组' || (filter.value === '已启用' && m.enabled) || (filter.value === '已禁用' && !m.enabled) || (filter.value === '收藏模组' && m.favorite)
    return matches && state && (categoryFilter.value === '全部分类' || m.category === categoryFilter.value)
  }).sort((a, b) => sort.value === '名称排序' ? a.name.localeCompare(b.name, 'zh-CN') : sort.value === '启用优先' ? Number(b.enabled) - Number(a.enabled) : 0)
})

// 本地管理空状态：区分「从未选择目录」「有记录但需重新授权」「已授权但扫描为空」，
// 避免浏览器版刷新后提示「先选择游戏目录」却又显示着路径的自相矛盾。
const emptyState = computed(() => {
  if (gameReady.value) {
    if (mods.value.length) return { kind: 'filtered', title: '没有匹配的模组', hint: `当前筛选「${filter.value}」，没有匹配的模组；可调整筛选条件或安装一个本地 MOD 文件夹。` }
    return { kind: 'scanned-empty', title: '目录已授权，但没有扫描到模组', hint: '已成功读取游戏目录，但 UE4SS/Mods 下暂时没有可管理的模组；安装一个本地 MOD 文件夹后即可在此看到。' }
  }
  if (needsHandlePermission.value) return { kind: 'needs-permission', title: '需要重新授权游戏目录', hint: `上次选择的目录「${rootName.value}」需要重新授权浏览器访问，点击下方按钮即可恢复模组列表。` }
  return { kind: 'no-directory', title: '先选择烽沙游戏目录', hint: `当前筛选「${filter.value}」；先选择游戏目录，扫描 UE4SS/Mods、LogicMods 和 ~mods 后才会列出模组。` }
})

function log(message, type = 'info') {
  logs.value.unshift({ time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), message, type })
  logs.value = logs.value.slice(0, 80)
}

async function checkAgent() {
  agentError.value = ''
  agentOnline.value = false
  agentAnswered.value = false
  agentModelsFound.value = []
  if (!window.fengshaDesktop?.checkAgent) { agentError.value = 'AI 军师仅在桌面版可连接本机 API。'; return }
  try {
    localStorage.setItem('fengsha-agent-origin', agentOrigin.value.trim())
    const result = await window.fengshaDesktop.checkAgent(agentOrigin.value.trim())
    agentModelsFound.value = result.models || []
    agentOnline.value = true
    if (agentModelsFound.value.length && !agentModelsFound.value.includes(agentModel.value)) agentModel.value = agentModelsFound.value.find(model => ['gpt-4o-mini', 'gpt-5-mini'].includes(model)) || agentModelsFound.value[0]
  } catch (error) { agentError.value = error.message || '连接本机 AI 服务失败。' }
}

async function sendAgentMessage() {
  const content = agentDraft.value.trim()
  if (!content || agentBusy.value) return
  if (!window.fengshaDesktop?.chatWithAgent) { agentError.value = '请使用桌面版，并在本机启动 DuckAI 服务。'; return }
  agentMessages.value.push({ role: 'user', content })
  agentDraft.value = ''
  agentBusy.value = true
  agentError.value = ''
  agentAnswered.value = false
  try {
    localStorage.setItem('fengsha-agent-origin', agentOrigin.value.trim())
    localStorage.setItem('fengsha-agent-model', agentModel.value)
    const history = agentMessages.value.slice(-10).map(({ role, content: text }) => ({ role, content: text.slice(0, 2000) }))
    const answer = await window.fengshaDesktop.chatWithAgent(agentOrigin.value.trim(), agentModel.value, history, localStorage.getItem('fengsha-game-root') || '')
    agentMessages.value.push({ role: 'assistant', content: answer })
    agentOnline.value = true
    agentAnswered.value = true
  } catch (error) { agentError.value = error.message || 'Agent 请求失败。' }
  finally { agentBusy.value = false }
}

// 轻提示：复制这类操作原来只在底部日志写一行，界面毫无反馈，用户以为按钮坏了。
const toast = ref(null)
let toastTimer = null
function showToast(message, tone = 'info') {
  toast.value = { message, tone }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3000)
}

// 统一的复制实现。
// navigator.clipboard.writeText 需要安全上下文 + 文档处于聚焦状态 + 剪贴板权限，
// 任一不满足就抛错；旧浏览器甚至没有这个 API。失败时退回 execCommand 兜底，
// 这样「分享链接 / 复制日志 / 复制模组路径」不会静默失效。
async function copyTextToClipboard(text) {
  if (window.fengshaDesktop?.copyText) {
    try { await window.fengshaDesktop.copyText(text); return true } catch { /* 继续走浏览器兜底 */ }
  }
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true }
  } catch { /* 落到下面的兜底 */ }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch { return false }
}

// 日志筛选：之前「操作记录 / 错误信息」只是装饰性文字，没有任何点击处理。
const logFilter = ref('all')
const logCounts = computed(() => ({
  all: logs.value.length,
  info: logs.value.filter(entry => entry.type !== 'error').length,
  error: logs.value.filter(entry => entry.type === 'error').length
}))
const shownLogs = computed(() => logFilter.value === 'all'
  ? logs.value
  : logs.value.filter(entry => (logFilter.value === 'error') === (entry.type === 'error')))

// 工坊导航：三项分别是「回到默认视图」「按发布时间排序」「显示全部分类」。
// 每次点击都会移动高亮并写一条日志，避免在作品很少时看起来毫无反应。
function selectWorkshopView(view) {
  workshopView.value = view
  if (view === 'discover') { workshopCategory.value = '全部分类'; workshopSort.value = '最新发布' }
  else if (view === 'newest') { workshopSort.value = '最新发布' }
  else { workshopCategory.value = '全部分类' }
  const label = { discover: '发现作品（全部分类 · 最新发布）', newest: '按发布时间排序', all: '浏览全部分类' }[view]
  log(`工坊视图切换为：${label}`)
}

async function refreshWorkshop() {
  workshopLoading.value = true
  workshopError.value = ''
  try {
    if (!supabaseClient.value) throw new Error('还未连接 Supabase 项目，请完成部署配置。')
    const { data, error } = await supabaseClient.value.from('mods').select('id,owner_id,title,summary,description,version,author,category,compatibility,dependencies,tags,changelog,package_path,package_name,package_size,cover_path,screenshot_paths,donation_path,pinned_at,downloads,created_at').eq('status', 'published').order('created_at', { ascending: false }).limit(200)
    if (error) throw error
    workshopWorks.value = await addWorkImageUrls(data || [])
    const sharedMod = new URLSearchParams(window.location.search).get('mod')
    if (sharedMod) {
      const sharedWork = workshopWorks.value.find(work => work.id === sharedMod)
      if (sharedWork) selectWork(sharedWork)
    }
  }
  catch (error) { workshopError.value = error.message; workshopWorks.value = [] }
  finally { workshopLoading.value = false }
}

async function addWorkImageUrls(works) {
  const paths = works.flatMap(work => [work.cover_path, work.donation_path, ...(work.screenshot_paths || [])].filter(Boolean))
  if (!paths.length) return works.map(work => ({ ...work, cover_url: '', donation_url: '', screenshot_urls: [] }))
  const { data, error } = await supabaseClient.value.storage.from(supabaseBucket.value).createSignedUrls(paths, 3600)
  if (error) throw error
  const urls = new Map((data || []).filter(file => file.signedUrl).map(file => [file.path, file.signedUrl]))
  return works.map(work => ({ ...work, cover_url: urls.get(work.cover_path) || '', donation_url: urls.get(work.donation_path) || '', screenshot_urls: (work.screenshot_paths || []).map(path => urls.get(path)).filter(Boolean) }))
}

async function refreshAuthor() {
  if (!cloudUser.value) return
  const client = supabaseClient.value
  try {
    // 作品列表要连收藏/点赞/评论数一起取。mod_reactions 是 revoke all，
    // mod_comments 的 RLS 也只放行「已发布作品的评论」统计，
    // 前端直接查不到这些计数，所以走 security definer 的 RPC。
    const { data, error } = await client.rpc('get_fengsha_author_works')
    if (error) throw error
    authorWorks.value = await addWorkImageUrls(data || [])
  } catch (error) {
    log(`读取云端作品失败：${error.message}`, 'error')
  }
}

async function refreshIdentity() {
  if (!supabaseClient.value) return
  try {
    const { data: { user }, error } = await supabaseClient.value.auth.getUser()
    if (error) throw error
    if (!user) { cloudUser.value = null; authorWorks.value = []; return }
    const profile = await supabaseClient.value.from('profiles').select('username,is_admin,donation_path,created_at').eq('id', user.id).single()
    if (profile.error) throw profile.error
    cloudUser.value = { id: user.id, email: user.email, username: profile.data.username, is_admin: profile.data.is_admin, donation_path: profile.data.donation_path, created_at: profile.data.created_at }
    await refreshAuthor()
  } catch { cloudUser.value = null; authorWorks.value = [] }
}

async function loadSupabase() {
  try {
    let config
    if (window.fengshaDesktop) config = await window.fengshaDesktop.getCloudConfig()
    else {
      const response = await fetch(`${import.meta.env.BASE_URL}api/config`, { cache: 'no-store' })
      config = await response.json()
      if (!response.ok) throw new Error(config.error || '无法读取云端配置。')
    }
    if (!config.supabaseUrl || !config.publishableKey) throw new Error('网站已部署，但尚未配置 Supabase 项目地址和 Publishable Key。')
    // 分享链接的落地域名由云端配置下发，换托管域名时不必重建桌面版。
    if (config.workshopUrl) workshopUrl.value = String(config.workshopUrl).replace(/\/*$/, '/')
    supabaseBucket.value = config.bucket || 'fengsha-mods'
    supabaseProjectUrl.value = config.supabaseUrl
    supabaseClient.value = createClient(config.supabaseUrl, config.publishableKey)
    await refreshIdentity()
    await refreshPlatformDonation()
    await refreshWorkshop()
  } catch (error) {
    workshopError.value = error.message
    workshopWorks.value = []
  }
}

function openAuth(mode = 'login') {
  authMode.value = mode
  authError.value = ''
  showAuthDialog.value = true
}

async function submitAuth() {
  if (authBusy.value) return
  authError.value = ''
  authBusy.value = true
  try {
    if (!supabaseClient.value) throw new Error('Supabase 尚未配置。')
    if (awaitingSignupCode.value) {
      authBusyText.value = '正在验证验证码…'
      const { error } = await supabaseClient.value.auth.verifyOtp({ email: authForm.value.email, token: authCode.value.trim(), type: 'email' })
      if (error) throw error
      awaitingSignupCode.value = false
      authCode.value = ''
    } else if (authMode.value === 'register') {
      if (!/^[\p{L}\p{N}_-]{2,24}$/u.test(authForm.value.username)) throw new Error('用户名需为 2–24 个中英文、数字或 _- 字符。')
      authBusyText.value = '正在创建账号并发送验证邮件…'
      const { data, error } = await supabaseClient.value.auth.signUp({ email: authForm.value.email, password: authForm.value.password, options: { data: { username: authForm.value.username } } })
      if (error) throw error
      if (!data.session) { awaitingSignupCode.value = true; authCode.value = ''; authError.value = `验证码已发送到 ${authForm.value.email}，输入邮件中的验证码即可完成注册并登录。`; return }
    } else {
      authBusyText.value = '正在登录…'
      const { error } = await supabaseClient.value.auth.signInWithPassword({ email: authForm.value.email, password: authForm.value.password })
      if (error) throw error
    }
    authBusyText.value = '正在读取创作者资料…'
    await refreshIdentity()
    if (!cloudUser.value) throw new Error('账号已验证，但暂时无法读取创作者资料。')
    showAuthDialog.value = false
    await refreshAuthor()
    log(`已登录工坊账号：${cloudUser.value.username}`)
  } catch (error) { authError.value = error.message }
  finally { authBusy.value = false; authBusyText.value = '' }
}

async function resendSignupCode() {
  if (resendingCode.value || authBusy.value) return
  authError.value = ''
  resendingCode.value = true
  try {
    const { error } = await supabaseClient.value.auth.resend({ type: 'signup', email: authForm.value.email })
    if (error) throw error
    authError.value = `验证码已重新发送到 ${authForm.value.email}。`
  } catch (error) { authError.value = error.message }
  finally { resendingCode.value = false }
}

async function signOut() {
  userCenterOpen.value = false
  accountMenuOpen.value = false
  await supabaseClient.value?.auth.signOut({ scope: 'local' }).catch(() => {})
  cloudUser.value = null
  authorWorks.value = []
  avatarPath.value = ''
  avatarUrl.value = ''
  removeAvatarSelection()
  communityState.value = { likes: 0, favorites: 0, comments: 0, liked: false, favorited: false }
  log('已退出工坊账号')
}

function openUserCenter() {
  if (!cloudUser.value) return openAuth('login')
  profileError.value = ''
  profileNotice.value = ''
  profileDonationFile.value = null
  profileDonationName.value = ''
  if (profileDonationPreview.value) URL.revokeObjectURL(profileDonationPreview.value)
  profileDonationPreview.value = ''
  if (profileDonationInput.value) profileDonationInput.value.value = ''
  platformError.value = ''
  platformNotice.value = ''
  removePlatformDonationSelection()
  userCenterOpen.value = true
  avatarFile.value = null
  if (avatarPreview.value) URL.revokeObjectURL(avatarPreview.value)
  avatarPreview.value = ''
  if (avatarInput.value) avatarInput.value.value = ''
  void loadProfileDonation()
  void loadAvatar()
  if (cloudUser.value.is_admin) void refreshPlatformDonation()
}

// ---------------------------------------------------------------- 头像
// 头像放在公开 bucket 里，路径固定为 <uid>/avatar.<ext>。
// 直接拼公开 URL 而不是签名 URL：签名会过期，缓存到评论区之后就会变成破图。
function avatarSrc(path) {
  if (!path || !supabaseProjectUrl.value) return ''
  return `${supabaseProjectUrl.value}/storage/v1/object/public/fengsha-avatars/${path}`
}

async function loadAvatar() {
  avatarPath.value = cloudUser.value?.avatar_path || ''
  avatarUrl.value = avatarSrc(avatarPath.value)
}

function recordAvatar(event) {
  if (avatarPreview.value) URL.revokeObjectURL(avatarPreview.value)
  const file = event.target.files?.[0] || null
  if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
    avatarFile.value = null
    avatarPreview.value = ''
    profileError.value = '头像仅支持 JPG、PNG、WebP，最大 5 MB'
    event.target.value = ''
    return
  }
  profileError.value = ''
  avatarFile.value = file
  avatarPreview.value = file ? URL.createObjectURL(file) : ''
}

function removeAvatarSelection() {
  if (avatarPreview.value) URL.revokeObjectURL(avatarPreview.value)
  avatarFile.value = null
  avatarPreview.value = ''
  if (avatarInput.value) avatarInput.value.value = ''
}

async function saveAvatar() {
  if (!avatarFile.value || !cloudUser.value || avatarSaving.value) return
  avatarSaving.value = true
  profileError.value = ''
  profileNotice.value = ''
  try {
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[avatarFile.value.type]
    const path = `${cloudUser.value.id}/avatar.${extension}`
    const upload = await supabaseClient.value.storage.from('fengsha-avatars').upload(path, avatarFile.value, { contentType: avatarFile.value.type, cacheControl: '3600', upsert: true })
    if (upload.error) throw upload.error
    const { error } = await supabaseClient.value.from('profiles').update({ avatar_path: path }).eq('id', cloudUser.value.id)
    if (error) throw error
    cloudUser.value = { ...cloudUser.value, avatar_path: path }
    removeAvatarSelection()
    await loadAvatar()
    profileNotice.value = '头像已更新，之后发表的评论会带上新头像。'
    log('已更新账号头像')
  } catch (error) {
    profileError.value = `保存头像失败：${error.message}`
  } finally {
    avatarSaving.value = false
  }
}

async function clearAvatar() {
  if (!cloudUser.value || avatarSaving.value) return
  if (!window.confirm('移除头像后，评论区只显示昵称首字。确定移除吗？')) return
  avatarSaving.value = true
  profileError.value = ''
  profileNotice.value = ''
  try {
    const previous = avatarPath.value
    const { error } = await supabaseClient.value.from('profiles').update({ avatar_path: null }).eq('id', cloudUser.value.id)
    if (error) throw error
    if (previous) await supabaseClient.value.storage.from('fengsha-avatars').remove([previous]).catch(() => {})
    cloudUser.value = { ...cloudUser.value, avatar_path: null }
    await loadAvatar()
    profileNotice.value = '头像已移除。'
  } catch (error) {
    profileError.value = `移除头像失败：${error.message}`
  } finally {
    avatarSaving.value = false
  }
}

// ---------------------------------------------------------------- 顶栏账号菜单
function toggleAccountMenu() {
  if (!cloudUser.value) return openAuth('login')
  accountMenuOpen.value = !accountMenuOpen.value
}

function closeAccountMenu() { accountMenuOpen.value = false }

function menuGo(tab) {
  accountMenuOpen.value = false
  activeTab.value = tab
  selectedWork.value = null
  selected.value = null
}

function menuUpload() {
  accountMenuOpen.value = false
  startDraft()
}

function menuOpenSettings() {
  accountMenuOpen.value = false
  settingsOpen.value = true
}

function openGamePath() {
  accountMenuOpen.value = false
  const target = pathHint.value
  if (!target) {
    showToast('还没有选择游戏目录，先设置一次', 'error')
    settingsOpen.value = true
    return
  }
  if (!window.fengshaDesktop?.openPath) {
    showToast('打开本地目录需要桌面版', 'error')
    return
  }
  void window.fengshaDesktop.openPath(target).then(result => { if (result) showToast(`打开目录失败：${result}`, 'error') })
}

const FEEDBACK_URL = 'https://github.com/aaszxx2/fengsha-mod-manager/issues'
function openFeedback() {
  accountMenuOpen.value = false
  if (window.fengshaDesktop?.openExternal) { void window.fengshaDesktop.openExternal(FEEDBACK_URL); return }
  window.open(FEEDBACK_URL, '_blank', 'noopener')
}

// ---------------------------------------------------------------- 作者回复评论
function startReply(comment) {
  communityError.value = ''
  if (replyTarget.value === comment.id) { replyTarget.value = null; replyDraft.value = ''; return }
  replyTarget.value = comment.id
  replyDraft.value = ''
}

async function submitCommentReply(comment) {
  if (!cloudUser.value) return openAuth('login')
  const body = replyDraft.value.trim()
  if (!selectedWork.value || !body || replySubmitting.value) return
  const work = selectedWork.value
  replySubmitting.value = true
  communityError.value = ''
  try {
    // parent_id 非空时，数据库策略会校验「父评论属于同一作品」——
    // 玩家之间可以互相回复，不再限制只有作品作者能回。
    const { error } = await supabaseClient.value.from('mod_comments').insert({ mod_id: work.id, user_id: cloudUser.value.id, body, parent_id: comment.id })
    if (error) throw error
    replyDraft.value = ''
    replyTarget.value = null
    await loadCommunity(work)
    showToast('回复已发布')
  } catch (error) {
    communityError.value = `回复失败：${error.message}`
  } finally {
    replySubmitting.value = false
  }
}

// ---------------------------------------------------------------- 删除自己的作品
async function deleteAuthorWork(work) {
  if (!cloudUser.value || work.owner_id !== cloudUser.value.id || deletingWorkId.value) return
  if (!window.confirm(`确定要永久删除「${work.title}」吗？\n\nZIP 包、封面和效果图会一起删除，且无法恢复。`)) return
  deletingWorkId.value = work.id
  try {
    // 顺序不能反：storage 的删除策略是按「文件是否仍被自己的作品引用」判定的，
    // 先删 mods 行的话就再也匹配不上，文件会永远删不掉。
    const paths = [work.package_path, work.cover_path, work.donation_path, ...(work.screenshot_paths || [])].filter(Boolean)
    if (paths.length) {
      const { error: storageError } = await supabaseClient.value.storage.from(supabaseBucket.value).remove(paths)
      if (storageError) log(`清理作品文件未完成：${storageError.message}`, 'error')
    }
    const { error } = await supabaseClient.value.from('mods').delete().eq('id', work.id).eq('owner_id', cloudUser.value.id)
    if (error) throw error
    if (selectedWork.value?.id === work.id) selectedWork.value = null
    await refreshAuthor()
    showToast(`已删除「${work.title}」`)
    log(`已删除云端作品：${work.title}`)
  } catch (error) {
    showToast(`删除失败：${error.message}`, 'error')
    log(`删除作品失败：${error.message}`, 'error')
  } finally {
    deletingWorkId.value = ''
  }
}

async function loadProfileDonation() {
  profileDonationPath.value = cloudUser.value?.donation_path || null
  profileDonationUrl.value = ''
  if (!profileDonationPath.value || !supabaseClient.value) return
  const { data, error } = await supabaseClient.value.storage.from(supabaseBucket.value).createSignedUrl(profileDonationPath.value, 3600)
  if (!error) profileDonationUrl.value = data.signedUrl
}

function recordProfileDonation(event) {
  if (profileDonationPreview.value) URL.revokeObjectURL(profileDonationPreview.value)
  const file = event.target.files?.[0] || null
  if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
    profileDonationFile.value = null
    profileDonationPreview.value = ''
    profileDonationName.value = ''
    profileError.value = '打赏码仅支持 JPG、PNG、WebP，最大 5 MB'
    event.target.value = ''
    return
  }
  profileError.value = ''
  profileNotice.value = ''
  profileDonationFile.value = file
  profileDonationName.value = file?.name || ''
  profileDonationPreview.value = file ? URL.createObjectURL(file) : ''
}

function removeProfileDonationSelection() {
  if (profileDonationPreview.value) URL.revokeObjectURL(profileDonationPreview.value)
  profileDonationFile.value = null
  profileDonationName.value = ''
  profileDonationPreview.value = ''
  if (profileDonationInput.value) profileDonationInput.value.value = ''
}

async function saveProfileDonation() {
  if (!cloudUser.value || profileSaving.value || !profileDonationFile.value) return
  const file = profileDonationFile.value
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]
  const path = `${cloudUser.value.id}/${crypto.randomUUID()}-tip.${extension}`
  const storage = supabaseClient.value.storage.from(supabaseBucket.value)
  profileSaving.value = true
  profileError.value = ''
  profileNotice.value = ''
  try {
    const upload = await storage.upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false })
    if (upload.error) throw upload.error
    const { error } = await supabaseClient.value.from('profiles').update({ donation_path: path }).eq('id', cloudUser.value.id)
    if (error) { await storage.remove([path]); throw error }
    const previous = cloudUser.value.donation_path
    cloudUser.value = { ...cloudUser.value, donation_path: path }
    await loadProfileDonation()
    if (previous && previous !== path) await storage.remove([previous]).catch(() => {})
    removeProfileDonationSelection()
    profileNotice.value = '打赏码已保存。你名下所有作品的「打赏作者」都会显示这张图。'
    log('已更新作者打赏码')
  } catch (error) {
    profileError.value = error.message
  } finally { profileSaving.value = false }
}

async function clearProfileDonation() {
  if (!cloudUser.value || profileSaving.value || !cloudUser.value.donation_path) return
  const previous = cloudUser.value.donation_path
  profileSaving.value = true
  profileError.value = ''
  profileNotice.value = ''
  try {
    const { error } = await supabaseClient.value.from('profiles').update({ donation_path: null }).eq('id', cloudUser.value.id)
    if (error) throw error
    cloudUser.value = { ...cloudUser.value, donation_path: null }
    profileDonationPath.value = null
    profileDonationUrl.value = ''
    // 已经不再被资料引用，此时才允许删除对象
    await supabaseClient.value.storage.from(supabaseBucket.value).remove([previous]).catch(() => {})
    profileNotice.value = '已移除打赏码，作品页不再显示打赏入口。'
  } catch (error) {
    profileError.value = error.message
  } finally { profileSaving.value = false }
}

// 作品页展示作者在用户中心设置的收款码
async function loadAuthorDonation(work = selectedWork.value) {
  authorDonationUrl.value = ''
  if (!work || !supabaseClient.value) return
  authorDonationLoading.value = true
  try {
    const { data, error } = await supabaseClient.value.rpc('get_fengsha_author_donation', { p_mod_id: work.id })
    if (error) throw error
    const path = Array.isArray(data) ? data[0] : data
    if (!path) return
    const { data: signed, error: urlError } = await supabaseClient.value.storage.from(supabaseBucket.value).createSignedUrl(path, 3600)
    if (urlError) throw urlError
    if (selectedWork.value?.id !== work.id) return
    authorDonationUrl.value = signed.signedUrl
  } catch {
    // 作者还没设置收款码，或读取失败：不阻塞作品页，只在点打赏时提示
  } finally {
    if (selectedWork.value?.id === work.id) authorDonationLoading.value = false
  }
}

async function refreshPlatformDonation() {
  if (!supabaseClient.value) return
  try {
    const { data, error } = await supabaseClient.value.from('community_settings').select('platform_donation_path').eq('id', 1).single()
    if (error) throw error
    platformDonationPath.value = data.platform_donation_path
    if (!data.platform_donation_path) { platformDonationUrl.value = ''; return }
    const { data: signed, error: urlError } = await supabaseClient.value.storage.from(supabaseBucket.value).createSignedUrl(data.platform_donation_path, 3600)
    if (urlError) throw urlError
    platformDonationUrl.value = signed.signedUrl
  } catch (error) {
    platformDonationPath.value = null
    platformDonationUrl.value = ''
    if (!String(error.message).includes('community_settings')) log(`读取工具打赏码失败：${error.message}`, 'error')
  }
}

async function submitUpload() {
  if (!cloudUser.value) return openAuth('login')
  authError.value = ''
  const form = draftForm.value
  for (const [label, value, max, required] of [
    ['作品名称', form.title, 80, true], ['一句话简介', form.summary, 180, true], ['版本', form.version, 32, true],
    ['详细说明', form.description, 10000], ['兼容游戏版本', form.compatibility, 120], ['依赖项', form.dependencies, 500], ['标签', form.tags, 300], ['更新说明', form.changelog, 500]
  ]) {
    const text = String(value || '')
    if (required && !text.trim()) { authError.value = `请填写${label}`; return }
    if (text.length > max) { authError.value = `${label}不能超过 ${max} 个字符`; return }
  }
  const editing = Boolean(editingPublishedModId.value)
  if (!editing && !packageFile.value) { authError.value = '请选择 MOD ZIP 压缩包'; return }
  if (screenshotFiles.value.length > 5) { authError.value = '最多上传 5 张 MOD 效果图'; return }
  const images = [coverFile.value, ...screenshotFiles.value].filter(Boolean)
  if (images.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) { authError.value = '图片仅支持 JPG、PNG、WebP，单张最大 5 MB'; return }
  if (packageFile.value && packageFile.value.size > 50 * 1024 * 1024) { authError.value = 'ZIP 最大 50 MB（Supabase Free 项目上限）'; return }
  // 上传前校验包结构。不合格的包发出去，玩家装完不生效、又很难排查，
  // 所以宁可在这里拦住，并直接说清楚缺什么。
  if (packageFile.value) {
    try {
      const entries = readZipEntryNames(await packageFile.value.arrayBuffer())
      const check = inspectPackage(entries, draftForm.value.modType || 'ue4ss')
      if (check.issues.length) { authError.value = `压缩包检查未通过：${check.issues.join('；')}`; return }
    } catch (error) {
      authError.value = `压缩包无法读取：${error.message}`
      return
    }
  }
  submitting.value = true
  uploadPhase.value = '正在准备上传…'
  const client = supabaseClient.value
  const previous = editing ? authorWorks.value.find(work => work.id === editingPublishedModId.value) : null
  if (editing && !previous) { submitting.value = false; authError.value = '找不到这件云端作品，请刷新后重试。'; return }
  const uploadedPaths = []
  try {
    let packagePath = previous?.package_path || null
    if (packageFile.value) {
      uploadPhase.value = '正在上传 MOD 压缩包…'
      packagePath = `${cloudUser.value.id}/${crypto.randomUUID()}.zip`
      const upload = await client.storage.from(supabaseBucket.value).upload(packagePath, packageFile.value, { contentType: 'application/zip', cacheControl: '3600', upsert: false })
      if (upload.error) throw upload.error
      uploadedPaths.push(packagePath)
    }
    const uploadImage = async (file, label) => {
      if (!file) return null
      uploadPhase.value = '正在上传图片…'
      const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]
      const path = `${cloudUser.value.id}/${crypto.randomUUID()}-${label}.${extension}`
      const result = await client.storage.from(supabaseBucket.value).upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false })
      if (result.error) throw result.error
      uploadedPaths.push(path)
      return path
    }
    const coverPath = await uploadImage(coverFile.value, 'cover')
    const screenshotPaths = []
    for (const [index, file] of screenshotFiles.value.entries()) screenshotPaths.push(await uploadImage(file, `screen-${index + 1}`))
    uploadPhase.value = '正在保存作品信息…'
    const payload = { title: form.title.trim(), summary: form.summary.trim(), description: form.description || '', version: form.version.trim(), author: cloudUser.value.username, category: form.category, compatibility: form.compatibility || '', dependencies: form.dependencies || '', tags: form.tags || '', changelog: form.changelog || '' }
    if (packageFile.value) Object.assign(payload, { package_path: packagePath, package_name: packageFile.value.name, package_size: packageFile.value.size })
    if (coverFile.value) payload.cover_path = coverPath
    if (screenshotFiles.value.length) payload.screenshot_paths = screenshotPaths
    const result = editing
      ? await client.from('mods').update(payload).eq('id', editingPublishedModId.value).eq('owner_id', cloudUser.value.id).select('id').single()
      : await client.from('mods').insert({ ...payload, owner_id: cloudUser.value.id, package_path: packagePath, package_name: packageFile.value.name, package_size: packageFile.value.size, cover_path: coverPath, screenshot_paths: screenshotPaths, status: 'published' }).select('id').single()
    if (result.error) throw result.error
    if (editing) {
      const keep = new Set([packagePath, coverFile.value ? coverPath : previous.cover_path, ...(screenshotFiles.value.length ? screenshotPaths : previous.screenshot_paths || [])].filter(Boolean))
      const stale = [previous.package_path, previous.cover_path, ...(previous.screenshot_paths || [])].filter(path => path && !keep.has(path))
      if (stale.length) {
        const { error: cleanupError } = await client.storage.from(supabaseBucket.value).remove(stale)
        if (cleanupError) log(`旧版本文件清理未完成：${cleanupError.message}`, 'error')
      }
    }
    showDraftDialog.value = false
    editingPublishedModId.value = null
    editingDraftId.value = null
    packageFile.value = null
    clearImageSelection()
    await refreshAuthor()
    await refreshWorkshop()
    activeTab.value = '创作中心'
    log(editing ? `作品「${draftForm.value.title}」已更新` : `作品「${draftForm.value.title}」已上传并公开`)
    selectedWork.value = authorWorks.value.find(work => work.id === result.data.id) || { ...draftForm.value, id: result.data.id, status: 'published' }
  } catch (error) {
    if (uploadedPaths.length) await client.storage.from(supabaseBucket.value).remove(uploadedPaths).catch(() => {})
    authError.value = error.message.includes('mods_title_check') ? '作品名称不能为空，且最多 80 个字符。' : error.message
  }
  finally { submitting.value = false; uploadPhase.value = '' }
}

// 下载后自动安装到游戏目录（桌面版）。默认开启，可在设置里关掉。
const autoInstall = ref(localStorage.getItem('fengsha-auto-install') !== '0')
const installProgress = ref(null)
// 加载顺序
const sortLock = ref(localStorage.getItem('fengsha-sort-lock') === '1')
const dragModId = ref(null)
const dropTargetId = ref(null)

function setAutoInstall(value) {
  autoInstall.value = value
  localStorage.setItem('fengsha-auto-install', value ? '1' : '0')
}

function setSortLock(value) {
  sortLock.value = value
  localStorage.setItem('fengsha-sort-lock', value ? '1' : '0')
  log(value ? '已锁定加载顺序，拖动与上下移已禁用' : '已解锁加载顺序')
}

async function downloadWork(work) {
  // 桌面版 + 游戏目录已设置 + 开启自动安装 → 直接装进游戏，装完重扫。
  // 这条链路参考成熟 Mod 管理器的做法：不维护"已安装清单"，
  // 而是把文件直接落到游戏模组目录，磁盘始终是唯一事实源。
  const root = localStorage.getItem('fengsha-game-root')
  if (window.fengshaDesktop && autoInstall.value && root) {
    let stop = () => {}
    installProgress.value = { title: work.title, phase: 'downloading', percent: 0 }
    try {
      stop = window.fengshaDesktop.onInstallWorkProgress(progress => {
        installProgress.value = { ...installProgress.value, ...progress }
      })
      const { data, error } = await supabaseClient.value.storage.from(supabaseBucket.value).createSignedUrl(work.package_path, 900)
      if (error) throw error
      installProgress.value = { title: work.title, phase: 'installing', percent: 100 }
      const result = await window.fengshaDesktop.installWork(root, {
        url: data.signedUrl,
        title: work.title,
        modId: work.id,
        version: work.version,
        dependencies: work.dependencies || '',
        overwrite: true
      })
      // 预检不合格的包直接拦下：讲清楚为什么不能用，也不再转普通下载——
      // 装不上的包下载了也只是占硬盘
      if (result?.rejected) {
        installProgress.value = null
        log(`「${work.title}」无法安装：${result.error}`, 'error')
        showToast(`「${work.title}」不是可用的模组包：${result.error}`, 'error')
        return
      }
      if (!result?.ok) throw new Error(result?.error || '安装未完成')
      // 前置包装到的是 ue4ss 目录、不是 Mods，所以不能提示"本地列表已刷新"——它不会出现在列表里
      if (result.kind === 'runtime') {
        installProgress.value = { title: work.title, phase: 'done', percent: 100 }
        log(`已安装「${work.title}」：识别为 UE4SS 前置包，已覆盖到游戏目录的 ue4ss 下${result.replaced ? `（替换 ${result.replaced} 个文件，原件已备份）` : ''}`)
        showToast(`「${work.title}」是 UE4SS 前置包，已安装到游戏目录`)
        void countDownload(work)
        setTimeout(() => { installProgress.value = null }, 2400)
        return
      }
      const label = result.kind === 'pak' ? `${result.pakType} PAK` : 'UE4SS'
      installProgress.value = { title: work.title, phase: 'done', percent: 100 }
      // 装完自检：有问题就当场说清楚，让玩家知道该找作者还是找工具
      const issues = result.check?.issues || []
      if (issues.length) {
        log(`已安装「${work.title}」，但可能不会生效：${issues.join('；')}`, 'error')
        showToast(`「${work.title}」已安装，但可能不生效：${issues[0]}`, 'error')
      } else {
        log(`已安装「${work.title}」到游戏目录（${label}），本地列表已刷新`)
        showToast(`「${work.title}」已安装到游戏，本地管理已刷新`)
      }
      await scanMods()
      void countDownload(work)
      setTimeout(() => { installProgress.value = null }, 2400)
    } catch (error) {
      installProgress.value = null
      log(`自动安装失败：${error.message}，已改为普通下载`, 'error')
      showToast(`自动安装失败：${error.message}`, 'error')
      await fallbackDownload(work)
    } finally { stop() }
    return
  }
  await fallbackDownload(work)
}

// 普通下载：交给浏览器/Electron 走文件下载
async function fallbackDownload(work) {
  try {
    const { data, error } = await supabaseClient.value.storage.from(supabaseBucket.value).createSignedUrl(work.package_path, 300, { download: `${work.title}.zip` })
    if (error) throw error
    window.location.href = data.signedUrl
    log(`开始下载「${work.title}」`)
    // 下载量统计失败不能影响下载本身，因此单独静默处理。
    void countDownload(work)
  } catch (error) { log(`下载失败：${error.message}`, 'error') }
}

// 调用 RPC 累加下载量（下载无需登录）。失败只记一条日志，不阻塞下载。
async function countDownload(work) {
  markDownloaded(work.id)
  if (!work?.id || !supabaseClient.value) return
  try {
    const { error } = await supabaseClient.value.rpc('increment_fengsha_download', { p_mod_id: work.id })
    if (error) throw error
    const bump = item => item.id === work.id ? { ...item, downloads: (Number(item.downloads) || 0) + 1 } : item
    workshopWorks.value = workshopWorks.value.map(bump)
    authorWorks.value = authorWorks.value.map(bump)
    if (selectedWork.value?.id === work.id) selectedWork.value = { ...selectedWork.value, downloads: (Number(selectedWork.value.downloads) || 0) + 1 }
  } catch (error) {
    log(`下载量统计失败（不影响下载）：${error.message}`, 'error')
  }
}

// 管理员置顶 / 取消置顶。走 security definer RPC（普通 update 策略不允许管理员改别人的作品）。
async function toggleWorkPin(work) {
  if (!cloudUser.value?.is_admin || pinSubmitting.value || !work?.id) return
  const nextPinned = !work.pinned_at
  pinSubmitting.value = true
  try {
    const { error } = await supabaseClient.value.rpc('toggle_fengsha_pin', { p_mod_id: work.id, p_pinned: nextPinned })
    if (error) throw error
    log(nextPinned ? `已置顶「${work.title}」` : `已取消置顶「${work.title}」`)
    await refreshWorkshop()
    if (selectedWork.value?.id === work.id) selectedWork.value = workshopWorks.value.find(item => item.id === work.id) || selectedWork.value
  } catch (error) {
    errorMessage.value = `置顶操作失败：${error.message}`
    log(errorMessage.value, 'error')
  } finally { pinSubmitting.value = false }
}

function persistDrafts() {
  localStorage.setItem('fengsha-local-drafts', JSON.stringify(drafts.value))
}

function startDraft() {
  editingDraftId.value = null
  editingPublishedModId.value = null
  draftForm.value = emptyDraft()
  packageFile.value = null
  clearImageSelection()
  authError.value = ''
  showDraftDialog.value = true
}

function editDraft(draft) {
  editingDraftId.value = draft.id
  editingPublishedModId.value = null
  draftForm.value = { ...emptyDraft(), ...draft, coverName: '', screenshotNames: [] }
  packageFile.value = null
  clearImageSelection()
  authError.value = ''
  showDraftDialog.value = true
}

function saveDraft() {
  const form = draftForm.value
  if (!form.title.trim() || !form.author.trim() || !form.version.trim()) return
  const old = drafts.value.find(d => d.id === editingDraftId.value)
  const draft = { ...form, id: old?.id || (crypto.randomUUID?.() ?? String(Date.now())), createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), status: '本地草稿' }
  drafts.value = [draft, ...drafts.value.filter(d => d.id !== draft.id)]
  localStorage.setItem('fengsha-author-name', form.author.trim())
  persistDrafts()
  showDraftDialog.value = false
  selectedWork.value = draft
  activeTab.value = '创作中心'
  log(`已保存作品草稿「${draft.title}」到本机浏览器`)
}

function deleteDraft(draft) {
  if (!window.confirm(`从本机移除草稿「${draft.title}」？`)) return
  drafts.value = drafts.value.filter(d => d.id !== draft.id)
  persistDrafts()
  if (selectedWork.value?.id === draft.id) selectedWork.value = null
  log(`已移除本地草稿「${draft.title}」`)
}

function recordPackage(event) {
  const file = event.target.files?.[0]
  if (!file) return
  packageFile.value = file
  draftForm.value.packageName = file.name
  draftForm.value.packageSize = file.size
}

function recordCover(event) {
  if (coverPreview.value) URL.revokeObjectURL(coverPreview.value)
  const file = event.target.files?.[0] || null
  if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
    coverFile.value = null
    coverPreview.value = ''
    authError.value = '封面仅支持 JPG、PNG、WebP，最大 5 MB'
    event.target.value = ''
    return
  }
  authError.value = ''
  coverFile.value = file
  draftForm.value.coverName = file?.name || ''
  coverPreview.value = file ? URL.createObjectURL(file) : ''
}

function removeCoverSelection() {
  if (coverPreview.value) URL.revokeObjectURL(coverPreview.value)
  coverFile.value = null
  coverPreview.value = ''
  draftForm.value.coverName = ''
  if (coverInput.value) coverInput.value.value = ''
}

function recordScreenshots(event) {
  const files = Array.from(event.target.files || [])
  if (files.length > 5 || files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
    screenshotPreviews.value.forEach(url => URL.revokeObjectURL(url))
    screenshotFiles.value = []
    screenshotPreviews.value = []
    draftForm.value.screenshotNames = []
    authError.value = '效果图最多 5 张；仅支持 JPG、PNG、WebP，单张最大 5 MB'
    event.target.value = ''
    return
  }
  screenshotPreviews.value.forEach(url => URL.revokeObjectURL(url))
  authError.value = ''
  screenshotFiles.value = files
  draftForm.value.screenshotNames = files.map(file => file.name)
  screenshotPreviews.value = files.map(file => URL.createObjectURL(file))
}

function removeScreenshotSelection(index) {
  URL.revokeObjectURL(screenshotPreviews.value[index])
  screenshotFiles.value.splice(index, 1)
  screenshotPreviews.value.splice(index, 1)
  draftForm.value.screenshotNames.splice(index, 1)
  if (screenshotInput.value) screenshotInput.value.value = ''
}

function clearImageSelection() {
  if (coverPreview.value) URL.revokeObjectURL(coverPreview.value)
  screenshotPreviews.value.forEach(url => URL.revokeObjectURL(url))
  coverFile.value = null
  screenshotFiles.value = []
  coverPreview.value = ''
  screenshotPreviews.value = []
}

function selectWork(work) {
  selectedWork.value = work
  communityComments.value = []
  communityError.value = ''
  communityComment.value = ''
  authorDonationUrl.value = ''
  shareFallbackUrl.value = ''
  void loadAuthorDonation(work)
  if (activeTab.value === '工坊') loadCommunity(work)
}

async function loadCommunity(work = selectedWork.value) {
  if (!work || !supabaseClient.value) return
  communityLoading.value = true
  communityError.value = ''
  try {
    const [stats, comments] = await Promise.all([
      supabaseClient.value.rpc('get_fengsha_community', { p_mod_id: work.id }),
      supabaseClient.value.from('mod_comments').select('id,user_id,display_name,avatar_path,body,parent_id,created_at').eq('mod_id', work.id).order('created_at', { ascending: false }).limit(80)
    ])
    if (stats.error) throw stats.error
    if (comments.error) throw comments.error
    if (selectedWork.value?.id !== work.id) return
    const row = Array.isArray(stats.data) ? stats.data[0] : stats.data
    communityState.value = row || { likes: 0, favorites: 0, comments: 0, liked: false, favorited: false }
    communityComments.value = comments.data || []
  } catch (error) { if (selectedWork.value?.id === work.id) communityError.value = error.message }
  finally { if (selectedWork.value?.id === work.id) communityLoading.value = false }
}

async function toggleCommunity(kind) {
  if (!cloudUser.value) return openAuth('login')
  if (!selectedWork.value || communitySubmitting.value) return
  const work = selectedWork.value
  communitySubmitting.value = true
  try {
    const { error } = await supabaseClient.value.rpc('toggle_fengsha_reaction', { p_mod_id: work.id, p_kind: kind })
    if (error) throw error
    await loadCommunity(work)
  } catch (error) { if (selectedWork.value?.id === work.id) communityError.value = error.message }
  finally { communitySubmitting.value = false }
}

async function submitCommunityComment() {
  if (!cloudUser.value) return openAuth('login')
  const body = communityComment.value.trim()
  if (!selectedWork.value || !body || communitySubmitting.value) return
  const work = selectedWork.value
  communitySubmitting.value = true
  try {
    const { error } = await supabaseClient.value.from('mod_comments').insert({ mod_id: work.id, user_id: cloudUser.value.id, body })
    if (error) throw error
    communityComment.value = ''
    await loadCommunity(work)
  } catch (error) { if (selectedWork.value?.id === work.id) communityError.value = error.message }
  finally { communitySubmitting.value = false }
}

const shareFallbackUrl = ref('')
async function shareWork(work) {
  const url = `${workshopUrl.value}?mod=${encodeURIComponent(work.id)}`
  const copied = await copyTextToClipboard(url)
  if (copied) {
    shareFallbackUrl.value = ''
    showToast('分享链接已复制，发给朋友就能直接打开这件作品')
    log(`已复制「${work.title}」分享链接`)
  } else {
    shareFallbackUrl.value = url
    showToast('浏览器拦截了自动复制，请在右侧手动复制链接', 'error')
    log('复制分享链接失败：浏览器拒绝了剪贴板访问', 'error')
  }
}

function editPublishedWork(work) {
  if (!cloudUser.value || work.owner_id !== cloudUser.value.id) return
  editingDraftId.value = null
  editingPublishedModId.value = work.id
  draftForm.value = { ...emptyDraft(), ...work, packageName: work.package_name, packageSize: work.package_size, coverName: work.cover_path ? '保留现有封面' : '', screenshotNames: [] }
  packageFile.value = null
  clearImageSelection()
  authError.value = ''
  showDraftDialog.value = true
}

async function openPlatformDonation() {
  donationTarget.value = 'platform'
  await refreshPlatformDonation()
  platformDonationOpen.value = true
}

function openAuthorDonation() {
  if (!authorDonationUrl.value) {
    communityError.value = authorDonationLoading.value ? '正在读取作者收款码，请稍候。' : '作者还没有设置收款码。'
    return
  }
  donationTarget.value = 'author'
  platformDonationOpen.value = true
}

function recordPlatformDonation(event) {
  if (platformDonationPreview.value) URL.revokeObjectURL(platformDonationPreview.value)
  const file = event.target.files?.[0] || null
  if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
    platformDonationUpload.value = null
    platformDonationPreview.value = ''
    platformDonationName.value = ''
    platformError.value = '收款码仅支持 JPG、PNG、WebP，最大 5 MB'
    event.target.value = ''
    return
  }
  platformError.value = ''
  platformNotice.value = ''
  platformDonationUpload.value = file
  platformDonationName.value = file?.name || ''
  platformDonationPreview.value = file ? URL.createObjectURL(file) : ''
}

function removePlatformDonationSelection() {
  if (platformDonationPreview.value) URL.revokeObjectURL(platformDonationPreview.value)
  platformDonationUpload.value = null
  platformDonationName.value = ''
  platformDonationPreview.value = ''
  if (platformDonationInput.value) platformDonationInput.value.value = ''
}

async function savePlatformDonation() {
  if (!cloudUser.value?.is_admin || !platformDonationUpload.value || platformSaving.value) return
  const file = platformDonationUpload.value
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]
  const path = `${cloudUser.value.id}/${crypto.randomUUID()}-platform-tip.${extension}`
  const storage = supabaseClient.value.storage.from(supabaseBucket.value)
  platformSaving.value = true
  platformError.value = ''
  platformNotice.value = ''
  try {
    const upload = await storage.upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false })
    if (upload.error) throw upload.error
    const { error } = await supabaseClient.value.from('community_settings').update({ platform_donation_path: path }).eq('id', 1)
    if (error) {
      await storage.remove([path])
      throw error
    }
    const previous = platformDonationPath.value
    await refreshPlatformDonation()
    if (previous && previous !== path) await storage.remove([previous]).catch(() => {})
    platformDonationUpload.value = null
    if (platformDonationPreview.value) URL.revokeObjectURL(platformDonationPreview.value)
    platformDonationPreview.value = ''
    platformDonationName.value = ''
    if (platformDonationInput.value) platformDonationInput.value.value = ''
    platformNotice.value = '平台收款码已更新，玩家点「打赏烽沙工具」时会看到这张。'
    log('已更新烽沙 MOD 工具打赏码')
  } catch (error) {
    platformError.value = error.message
  } finally { platformSaving.value = false }
}

function categoryFor(name) {
  const n = name.toLowerCase()
  if (/probe|diagnostic|debug/.test(n)) return '调试工具'
  if (/ui|hud|interface/.test(n)) return '界面美化'
  if (/menke|counselor|character/.test(n)) return '人物事件'
  if (/resource|supply|build/.test(n)) return '游戏机制'
  return '其他'
}

async function getNestedDir(parent, name, create = false) {
  return parent.getDirectoryHandle(name, { create })
}

async function locateModsDir(root) {
  let current = root
  for (const part of GAME_PARTS) current = await getNestedDir(current, part)
  return current
}

// ---- 浏览器版目录句柄持久化（IndexedDB）----
// File System Access API 返回的目录句柄只存在于内存，刷新即丢；把句柄存进 IndexedDB，
// 刷新后重新取回，就能在权限仍有效时自动恢复模组列表。桌面版走 window.fengshaDesktop，不涉及这里。
const HANDLE_DB_NAME = 'fengsha-mod-manager'
const HANDLE_STORE = 'handles'
const HANDLE_KEY = 'game-root'

function openHandleDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('当前浏览器不支持 IndexedDB'))
    const request = indexedDB.open(HANDLE_DB_NAME, 1)
    request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('打开 IndexedDB 失败'))
  })
}

async function saveGameHandle(handle) {
  const db = await openHandleDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite')
    tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('保存目录句柄失败'))
    tx.onabort = () => reject(tx.error || new Error('保存目录句柄失败'))
  })
  db.close()
}

async function loadGameHandle() {
  const db = await openHandleDb()
  const handle = await new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readonly')
    const request = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error || new Error('读取目录句柄失败'))
  })
  db.close()
  return handle
}

async function clearGameHandle() {
  try {
    const db = await openHandleDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite')
      tx.objectStore(HANDLE_STORE).delete(HANDLE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error || new Error('清除目录句柄失败'))
      tx.onabort = () => reject(tx.error || new Error('清除目录句柄失败'))
    })
    db.close()
  } catch { /* 清理失败不影响主流程 */ }
}

// 句柄失效（目录被删除/移动，或用户拒绝授权）时清理持久化记录与路径提示，
// 让界面干净地回落到「从未选择过目录」，避免卡在「需要重新授权」的死循环。
async function forgetGameHandle(message) {
  await clearGameHandle()
  rootHandle.value = null
  modsHandle.value = null
  needsHandlePermission.value = false
  gameReady.value = false
  mods.value = []
  pathHint.value = ''
  rootName.value = '尚未选择游戏目录'
  localStorage.removeItem('fengsha-game-name')
  localStorage.removeItem('fengsha-game-path')
  if (message) log(message, 'error')
}

// 启动时恢复上次选择的游戏目录句柄。权限仍有效（granted）则自动重扫；
// 需要用户手势（prompt）时不静默失败，交给「恢复游戏目录访问」按钮处理。
async function restoreGameHandle() {
  if (window.fengshaDesktop || !('showDirectoryPicker' in window)) return
  let handle = null
  try { handle = await loadGameHandle() } catch { handle = null }
  if (!handle) return
  rootHandle.value = handle
  rootName.value = handle.name
  try {
    const permission = await handle.queryPermission({ mode: 'readwrite' })
    if (permission === 'denied') {
      // 用户已明确拒绝，或句柄已失效：清理记录，干净回落到「从未选择过目录」
      await forgetGameHandle()
      return
    }
    if (permission !== 'granted') {
      // 需要用户手势授权（prompt）：不静默失败，交给「恢复游戏目录访问」按钮
      needsHandlePermission.value = true
      log('检测到上次选择的游戏目录，点击「恢复游戏目录访问」继续读取模组。')
      return
    }
    needsHandlePermission.value = false
    try {
      // 轻量探测：目录被移动/删除时这里会抛 NotFoundError
      await locateModsDir(handle)
      await scanMods()
    } catch (error) {
      if (error?.name === 'NotFoundError') { await forgetGameHandle('原游戏目录已不可访问，请重新选择。'); return }
      throw error
    }
  } catch (error) {
    needsHandlePermission.value = true
    log(`读取游戏目录授权状态失败：${error.message}`, 'error')
  }
}

// 用户点击「恢复游戏目录访问」：必须在用户手势中调用 requestPermission 才能弹权限框。
async function resumeGameHandle() {
  if (!rootHandle.value) return chooseGame()
  errorMessage.value = ''
  try {
    const permission = await rootHandle.value.requestPermission({ mode: 'readwrite' })
    if (permission !== 'granted') {
      // 用户拒绝授权，或句柄已失效：走同一套清理，回落到「从未选择过目录」
      await forgetGameHandle('未获得游戏目录的读写权限，已清除失效的目录记录，请重新选择游戏目录。')
      return
    }
    needsHandlePermission.value = false
    try {
      await locateModsDir(rootHandle.value)
      await scanMods()
    } catch (error) {
      if (error?.name === 'NotFoundError') { await forgetGameHandle('原游戏目录已不可访问，请重新选择。'); return }
      throw error
    }
  } catch (error) {
    errorMessage.value = `恢复游戏目录访问失败：${error.message}`
    log(errorMessage.value, 'error')
  }
}

async function chooseGame() {
  errorMessage.value = ''
  try {
    if (window.fengshaDesktop) {
      const path = await window.fengshaDesktop.chooseDirectory()
      if (!path) return
      const info = await window.fengshaDesktop.inspectGame(path)
      if (!info.gameExe) throw new Error('所选目录不是《烽沙》游戏安装目录，请选择包含 MOProject 文件夹的游戏根目录')
      localStorage.setItem('fengsha-game-root', path)
      rootName.value = path.split(/[\\/]/).filter(Boolean).pop()
      pathHint.value = `${path}\\${GAME_PARTS.join('\\')}`
      ue4ssReady.value = info.ue4ssReady
      ue4ssVersion.value = info.ue4ssVersion || ''
      pakLoaderLogSeen.value = info.pakLoaderLogSeen
      localStorage.setItem('fengsha-game-name', rootName.value)
      localStorage.setItem('fengsha-game-path', pathHint.value)
      await scanMods()
      return
    }
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    rootHandle.value = handle
    needsHandlePermission.value = false
    rootName.value = handle.name
    pathHint.value = handle.name + '\\MOProject\\Binaries\\Win64\\ue4ss\\Mods'
    localStorage.setItem('fengsha-game-name', rootName.value)
    localStorage.setItem('fengsha-game-path', pathHint.value)
    // 句柄持久化，刷新后可在权限仍有效时自动恢复
    await saveGameHandle(handle).catch(() => {})
    await scanMods()
  } catch (error) {
    if (error.name !== 'AbortError') errorMessage.value = `无法打开目录：${error.message}`
  }
}

async function scanMods() {
  if (window.fengshaDesktop && !localStorage.getItem('fengsha-game-root')) return chooseGame()
  if (!window.fengshaDesktop && !rootHandle.value) return chooseGame()
  scanning.value = true
  errorMessage.value = ''
  try {
    if (window.fengshaDesktop) {
      const info = await window.fengshaDesktop.inspectGame(localStorage.getItem('fengsha-game-root'))
      ue4ssReady.value = info.ue4ssReady
      ue4ssVersion.value = info.ue4ssVersion || ''
      pakLoaderLogSeen.value = info.pakLoaderLogSeen
      const result = await window.fengshaDesktop.scanMods(localStorage.getItem('fengsha-game-root'))
      rawLines.value = result.rawText.replace(/^\uFEFF/, '').split(/\r?\n/)
      mods.value = result.mods.map(mod => ({ ...mod, author: mod.kind === 'pak' ? '本地 PAK' : mod.missing ? 'UE4SS 配置' : '本地模组', description: mod.kind === 'pak' ? `${mod.pakType === 'IoStore' ? 'IoStore · ~mods' : 'PAK · LogicMods'} · ${mod.files.length} 个配套文件${mod.incomplete ? ' · 缺少配套文件' : ''}` : mod.missing ? '配置中存在，但没有对应模组文件夹' : mod.hasMainLua === false ? '⚠️ 缺少 Scripts/main.lua，游戏里不会加载（请联系作者）' : mod.enabled ? '已登记并启用' : mod.registered ? '已登记，当前停用' : '未在 mods.txt 中登记', category: mod.kind === 'pak' ? '资源替换' : categoryFor(mod.name), registered: mod.registered ?? true, favorite: false, modified: Date.now(), missing: mod.missing ?? false }))
      gameReady.value = true
      log(`扫描完成：${mods.value.length} 个条目，${mods.value.filter(m => m.enabled).length} 个启用`)
      return
    }
    const permission = await rootHandle.value.requestPermission({ mode: 'readwrite' })
    if (permission !== 'granted') throw new Error('需要此目录的读写权限')
    needsHandlePermission.value = false
    modsHandle.value = await locateModsDir(rootHandle.value)
    rawLines.value = []
    try {
      const entry = await modsHandle.value.getFileHandle('mods.txt')
      const file = await entry.getFile()
      rawLines.value = (await file.text()).replace(/^\uFEFF/, '').split(/\r?\n/)
    } catch (error) {
      if (error.name !== 'NotFoundError') throw error
      throw new Error('找到了 UE4SS Mods 文件夹，但没有 mods.txt')
    }
    const states = new Map()
    for (const line of rawLines.value) {
      const match = line.match(/^\s*([A-Za-z_][\w.-]*)\s*:\s*([01])(?:\s*(?:#.*)?)?\s*$/)
      if (match) states.set(match[1].toLowerCase(), match[2] === '1')
    }
    const found = []
    for await (const [name, entry] of modsHandle.value.entries()) {
      if (entry.kind !== 'directory' || ['backup', 'saved', 'logs'].includes(name.toLowerCase())) continue
      let hasPayload = false
      for await (const [, child] of entry.entries()) if (['directory', 'file'].includes(child.kind)) { hasPayload = true; break }
      if (!hasPayload) continue
      const enabled = states.get(name.toLowerCase()) ?? false
      const registered = states.has(name.toLowerCase())
      found.push({ id: `ue4ss:${name.toLowerCase()}`, kind: 'ue4ss', name, relativePath: 'MOProject/Binaries/Win64/ue4ss/Mods', author: '本地模组', description: enabled ? '已登记并启用' : registered ? '已登记，当前停用' : '未在 mods.txt 中登记', category: categoryFor(name), enabled, registered, favorite: false, modified: Date.now(), handle: entry })
    }
    for (const [name, enabled] of states) {
      if (!found.some(m => m.name.toLowerCase() === name)) found.push({ id: `ue4ss:${name.toLowerCase()}`, kind: 'ue4ss', name, author: 'UE4SS 配置', description: '配置中存在，但没有对应模组文件夹', category: '待检查', enabled, favorite: false, modified: Date.now(), missing: true })
    }
    const order = [...states.keys()]
    found.sort((a, b) => {
      const ai = order.indexOf(a.name.toLowerCase()), bi = order.indexOf(b.name.toLowerCase())
      return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi)
    })
    try {
      let executable = rootHandle.value
      for (const part of ['MOProject', 'Binaries', 'Win64']) executable = await executable.getDirectoryHandle(part)
      const loaderRoot = await executable.getDirectoryHandle('ue4ss')
      await executable.getFileHandle('dwmapi.dll')
      await loaderRoot.getFileHandle('UE4SS.dll')
      ue4ssReady.value = true
    } catch { ue4ssReady.value = false }
    mods.value = found
    gameReady.value = true
    log(`扫描完成：${found.length} 个条目，${found.filter(m => m.enabled).length} 个启用`)
  } catch (error) {
    gameReady.value = false
    mods.value = []
    errorMessage.value = `扫描失败：${error.message}`
    log(errorMessage.value, 'error')
  } finally {
    scanning.value = false
  }
}

async function writeModsFile(nextStates) {
  if (window.fengshaDesktop) {
    await window.fengshaDesktop.writeModsFile(localStorage.getItem('fengsha-game-root'), [...nextStates].map(([name, enabled]) => ({ name, enabled })))
    rawLines.value = []
    return
  }
  if (!modsHandle.value) throw new Error('请先选择烽沙游戏目录')
  const fileHandle = await modsHandle.value.getFileHandle('mods.txt')
  const current = await (await fileHandle.getFile()).text()
  const lines = current.replace(/^\uFEFF/, '').split(/\r?\n/)
  const names = [...nextStates].map(([name, enabled]) => ({ name, enabled }))
  const isModLine = line => /^\s*[A-Za-z_][\w.-]*\s*:\s*[01](?:\s*(?:#.*)?)?\s*$/.test(line)
  const slots = lines.flatMap((line, index) => isModLine(line) ? [index] : [])
  const output = [...lines]
  const ordered = names.map(({ name, enabled }) => `${name} : ${enabled ? 1 : 0}`)
  slots.forEach((index, i) => { output[index] = ordered[i] ?? '' })
  if (ordered.length > slots.length) output.splice(slots.at(-1) + 1 || output.length, 0, ...ordered.slice(slots.length))

  const backup = await modsHandle.value.getDirectoryHandle('backup', { create: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupHandle = await backup.getFileHandle(`mods_${stamp}.txt`, { create: true })
  const backupWriter = await backupHandle.createWritable()
  await backupWriter.write(current)
  await backupWriter.close()
  const writer = await fileHandle.createWritable()
  await writer.write(output.join('\r\n'))
  await writer.close()
  rawLines.value = output
}

async function toggleMod(mod) {
  if (mod.missing) return
  const next = !mod.enabled
  if (!window.confirm(mod.kind === 'pak' ? `${next ? '启用' : '停用'}「${mod.name}」？将${next ? '移入游戏 Paks 目录' : '移出游戏 Paks 目录'}，不会修改 mods.txt。` : `${next ? '启用' : '停用'}「${mod.name}」？修改前会自动备份 mods.txt。`)) return
  if (mod.kind === 'pak') {
    try {
      await window.fengshaDesktop.setPakEnabled(localStorage.getItem('fengsha-game-root'), mod.pakType, mod.name, next)
      log(`${next ? '已启用' : '已停用'} ${mod.name}（${mod.pakType}）`)
      await scanMods()
    } catch (error) { errorMessage.value = `状态修改失败：${error.message}`; log(errorMessage.value, 'error') }
    return
  }
  const states = new Map(mods.value.filter(m => m.kind !== 'pak').map(m => [m.name, m.enabled]))
  states.set(mod.name, next)
  try {
    await writeModsFile(states)
    mod.enabled = next
    mod.registered = true
    mod.description = next ? '已登记并启用' : '已登记，当前停用'
    log(`${next ? '已启用' : '已停用'} ${mod.name}，mods.txt 已备份`)
  } catch (error) { errorMessage.value = `保存失败：${error.message}`; log(errorMessage.value, 'error') }
}

// 统一落盘加载顺序：UI 先乐观更新，失败再回滚重扫
async function saveModOrder(reordered) {
  mods.value = [...reordered, ...mods.value.filter(item => item.kind === 'pak')]
  try {
    await writeModsFile(new Map(reordered.map(item => [item.name, item.enabled])))
    log('已保存 UE4SS 加载顺序并备份 mods.txt')
    await scanMods()
    return true
  } catch (error) {
    await scanMods()
    errorMessage.value = `排序保存失败：${error.message}`
    log(errorMessage.value, 'error')
    return false
  }
}

async function moveMod(mod, delta) {
  if (sortLock.value) return log('加载顺序已锁定，请先解锁', 'error')
  if (sort.value !== '加载顺序' || mod.missing) return
  if (mod.kind === 'pak') return
  const ue4ssMods = mods.value.filter(item => item.kind !== 'pak')
  const from = ue4ssMods.findIndex(item => item.id === mod.id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= ue4ssMods.length) return
  const reordered = [...ue4ssMods]
  ;[reordered[from], reordered[to]] = [reordered[to], reordered[from]]
  await saveModOrder(reordered)
}

// ---- 拖动排序 ----
// 只有「按加载顺序」视图、未锁定、且是已登记的 UE4SS 模组才能拖
function canDragMod(mod) {
  return sort.value === '加载顺序' && !sortLock.value && mod.kind !== 'pak' && !mod.missing
}
function onModDragStart(mod, event) {
  if (sortLock.value || sort.value !== '加载顺序' || mod.kind === 'pak' || mod.missing) { event.preventDefault(); return }
  dragModId.value = mod.id
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', mod.id)
}
function onModDragOver(mod, event) {
  if (!dragModId.value || mod.kind === 'pak') return
  event.preventDefault()
  dropTargetId.value = mod.id
}
function onModDragEnd() { dragModId.value = null; dropTargetId.value = null }
async function onModDrop(target) {
  const sourceId = dragModId.value
  dropTargetId.value = null
  dragModId.value = null
  if (!sourceId || sourceId === target.id || target.kind === 'pak') return
  const ue4ssMods = mods.value.filter(item => item.kind !== 'pak')
  const from = ue4ssMods.findIndex(item => item.id === sourceId)
  const to = ue4ssMods.findIndex(item => item.id === target.id)
  if (from < 0 || to < 0) return
  const reordered = [...ue4ssMods]
  const [moved] = reordered.splice(from, 1)
  reordered.splice(to, 0, moved)
  await saveModOrder(reordered)
}

// 按依赖关系做拓扑排序：被依赖的排前面。没有依赖信息的模组保持原有相对顺序。
function autoSortedMods() {
  const ue4ssMods = mods.value.filter(item => item.kind !== 'pak')
  const byName = new Map(ue4ssMods.map(item => [item.name.toLowerCase(), item]))
  const dependenciesOf = mod => String(mod.cloud?.dependencies || '')
    .split(/[,，;；\s]+/).map(name => name.trim().toLowerCase()).filter(Boolean)
    .map(name => byName.get(name)).filter(Boolean)
  const result = [], placed = new Set(), visiting = new Set()
  const visit = mod => {
    if (placed.has(mod.id) || visiting.has(mod.id)) return // visiting 同时兜住循环依赖
    visiting.add(mod.id)
    for (const dependency of dependenciesOf(mod)) visit(dependency)
    visiting.delete(mod.id)
    placed.add(mod.id)
    result.push(mod)
  }
  for (const mod of ue4ssMods) visit(mod)
  return result
}

async function autoSortMods() {
  if (sortLock.value) return log('加载顺序已锁定，请先解锁', 'error')
  const reordered = autoSortedMods()
  const withCloud = reordered.filter(mod => mod.cloud?.dependencies).length
  if (!withCloud) log('没有任何模组声明了前置依赖，顺序未变（只有从工坊安装的模组带依赖信息）')
  else log(`已按依赖关系重排 ${withCloud} 个有依赖声明的模组`)
  await saveModOrder(reordered)
}

// ---- 排序导入 / 导出 ----
function exportModOrder() {
  const order = mods.value.filter(item => item.kind !== 'pak').map(item => ({ name: item.name, enabled: item.enabled }))
  if (!order.length) return showToast('当前没有可导出的模组', 'error')
  const payload = { format: 'fengsha-mod-order', version: 1, exportedAt: new Date().toISOString(), order }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `烽沙加载顺序-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  showToast(`已导出 ${order.length} 个模组的加载顺序`)
  log(`已导出加载顺序（${order.length} 个模组）`)
}

async function importModOrder(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try {
    const parsed = JSON.parse(await file.text())
    const list = Array.isArray(parsed) ? parsed : parsed?.order
    if (!Array.isArray(list) || !list.length) throw new Error('文件里没有排序数据')
    const wanted = list.map(item => String(typeof item === 'string' ? item : item?.name || '').trim().toLowerCase()).filter(Boolean)
    const ue4ssMods = mods.value.filter(item => item.kind !== 'pak')
    const byName = new Map(ue4ssMods.map(item => [item.name.toLowerCase(), item]))
    const ordered = [], used = new Set()
    for (const name of wanted) {
      const mod = byName.get(name)
      if (mod && !used.has(mod.id)) { ordered.push(mod); used.add(mod.id) }
    }
    // 文件里没有的模组接在后面，保证不丢模组
    for (const mod of ue4ssMods) if (!used.has(mod.id)) ordered.push(mod)
    const matched = ordered.length - (ue4ssMods.length - used.size)
    if (sortLock.value) setSortLock(false)
    await saveModOrder(ordered)
    showToast(`已导入排序：匹配到 ${matched} / ${ue4ssMods.length} 个模组`)
    log(`已导入加载顺序（匹配 ${matched} 个，${ue4ssMods.length - matched} 个未在文件中，已排在末尾）`)
  } catch (error) {
    showToast(`导入失败：${error.message}`, 'error')
    log(`导入加载顺序失败：${error.message}`, 'error')
  }
}

// ---- 前置依赖检测 ----
// 依赖信息来自安装时写入的云端清单，只对"从工坊装进来的模组"有效；
// 手动拖进来的模组没有依赖数据，直接跳过，不会误报。
function missingDependencies() {
  const byName = new Map(mods.value.map(item => [item.name.toLowerCase(), item]))
  const missing = []
  for (const mod of mods.value) {
    if (!mod.enabled || mod.missing) continue
    const declared = String(mod.cloud?.dependencies || '').split(/[,，;；\s]+/).map(name => name.trim()).filter(Boolean)
    for (const dependency of declared) {
      const target = byName.get(dependency.toLowerCase())
      if (!target) missing.push({ mod: mod.name, dependency, reason: '未安装' })
      else if (!target.enabled) missing.push({ mod: mod.name, dependency: target.name, reason: '已安装但未启用' })
    }
  }
  return missing
}

function confirmDependencies() {
  const missing = missingDependencies()
  if (!missing.length) return true
  const shown = missing.slice(0, 8).map(item => `· 「${item.mod}」需要「${item.dependency}」（${item.reason}）`).join('\n')
  const more = missing.length > 8 ? `\n…另有 ${missing.length - 8} 项` : ''
  return window.confirm(`检测到 ${missing.length} 处前置依赖问题：\n\n${shown}${more}\n\n缺前置时模组可能不生效甚至导致游戏异常。是否仍要启动？`)
}

async function copyDirectory(source, target) {
  for await (const [name, entry] of source.entries()) {
    if (entry.kind === 'file') {
      const from = await entry.getFile()
      const to = await target.getFileHandle(name, { create: true })
      const writer = await to.createWritable()
      await writer.write(from)
      await writer.close()
    } else await copyDirectory(entry, await target.getDirectoryHandle(name, { create: true }))
  }
}

// ── 拖入 ZIP 自动安装 ─────────────────────────────────────────────
// 桌面版：把 ZIP 拖到本地管理列表上，后端先判定「装了能不能用」，
// 不合格当场拦下并说明原因；合格直接安装，装完自动排入 mods.txt 加载顺序（默认启用）。
// 浏览器版拿不到文件的真实路径、也碰不到游戏目录，只能提示用桌面版。
const zipDragOver = ref(false)

function onModListDragOver(event) {
  if (!window.fengshaDesktop || !event.dataTransfer) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
  zipDragOver.value = true
}

async function onModListDrop(event) {
  event.preventDefault()
  zipDragOver.value = false
  const files = [...(event.dataTransfer?.files || [])]
  if (!files.length) return
  const zips = files.filter(file => /\.zip$/i.test(file.name))
  if (!zips.length) {
    showToast('只支持拖入 .zip 压缩包；已解压的模组文件夹请用左下角「安装本地模组」', 'error')
    return
  }
  const root = localStorage.getItem('fengsha-game-root')
  if (!root) {
    showToast('先选择游戏目录，再把模组 ZIP 拖进来', 'error')
    return
  }
  for (const file of zips) await installDroppedZip(root, file)
}

async function installDroppedZip(root, file) {
  const fallbackTitle = file.name.replace(/\.zip$/i, '')
  installProgress.value = { title: file.name, phase: 'installing', percent: 0 }
  try {
    const result = await window.fengshaDesktop.installWork(root, {
      localPath: window.fengshaDesktop.pathForFile(file),
      title: fallbackTitle,
      overwrite: true
    })
    // 预检不合格：讲清楚为什么，绝不写入游戏目录
    if (result?.rejected) {
      installProgress.value = null
      log(`拖入的「${file.name}」安装失败：${result.error}`, 'error')
      showToast(`「${fallbackTitle}」不是可用的模组：${result.error}`, 'error')
      return
    }
    if (!result?.ok) throw new Error(result?.error || '安装未完成')
    if (result.kind === 'runtime') {
      installProgress.value = { title: file.name, phase: 'done', percent: 100 }
      log(`拖入的「${file.name}」识别为 UE4SS 前置包，已覆盖到游戏目录的 ue4ss 下`)
      showToast(`「${fallbackTitle}」是前置包，已安装到游戏目录`)
      setTimeout(() => { installProgress.value = null }, 2400)
      return
    }
    await scanMods()
    installProgress.value = { title: file.name, phase: 'done', percent: 100 }
    const issues = result.check?.issues || []
    // UE4SS 模组装完自动追加到 mods.txt 末尾并启用——把排入的位置讲给玩家听
    const position = mods.value.filter(mod => mod.kind !== 'pak').findIndex(mod => mod.name === result.name) + 1
    if (issues.length) {
      log(`「${file.name}」已安装但可能不生效：${issues.join('；')}`, 'error')
      showToast(`「${fallbackTitle}」已安装，但可能不生效：${issues[0]}`, 'error')
    } else if (result.kind === 'pak') {
      log(`拖入的「${file.name}」安装完成：${result.pakType === 'IoStore' ? 'IoStore' : 'LogicMods'} PAK`)
      showToast(`「${fallbackTitle}」已安装到 PAK 目录`)
    } else {
      log(`拖入的「${file.name}」安装完成：「${result.name}」已启用并排入加载顺序第 ${position} 位`)
      showToast(`「${result.name}」已安装并排入加载顺序（第 ${position} 位）`)
    }
    setTimeout(() => { installProgress.value = null }, 2400)
  } catch (error) {
    installProgress.value = null
    log(`拖入的「${file.name}」安装失败：${error.message}`, 'error')
    showToast(`「${fallbackTitle}」安装失败：${error.message}`, 'error')
  }
}

async function installMod() {
  if (window.fengshaDesktop && !localStorage.getItem('fengsha-game-root')) return chooseGame()
  if (!window.fengshaDesktop && !modsHandle.value) return chooseGame()
  try {
    if (window.fengshaDesktop) {
      const sourcePath = await window.fengshaDesktop.chooseDirectory()
      if (!sourcePath) return
      const name = sourcePath.split(/[\\/]/).filter(Boolean).pop()
      if (['mods', 'ue4ss'].includes(name.toLowerCase())) throw new Error('请选择单个 MOD 文件夹')
      const root = localStorage.getItem('fengsha-game-root')
      const packageInfo = await window.fengshaDesktop.inspectModSource(root, sourcePath)
      let overwrite = false
      if (packageInfo) {
        overwrite = packageInfo.conflicts.length > 0 && window.confirm(`识别到 ${packageInfo.type === 'IoStore' ? 'IoStore' : 'LogicMods PAK'} 模组：${packageInfo.groups.join('、')}。目标中有 ${packageInfo.conflicts.length} 个同名文件；覆盖前会备份旧文件。继续？`)
        if (packageInfo.conflicts.length && !overwrite) return
      } else {
        const exists = await window.fengshaDesktop.modExists(root, name)
        overwrite = exists && window.confirm(`「${name}」已存在。覆盖前会把旧文件复制到 Mods/backup。继续？`)
        if (exists && !overwrite) return
      }
      await window.fengshaDesktop.installMod(root, sourcePath, name, overwrite, [...mods.value.filter(m => m.kind !== 'pak').map(m => ({ name: m.name, enabled: m.enabled })), { name, enabled: true }])
      log(packageInfo ? `安装完成：${packageInfo.groups.join('、')}（${packageInfo.type}）` : `安装完成：${name}，已备份 mods.txt`)
      await scanMods()
      return
    }
    sourceHandle.value = await window.showDirectoryPicker({ mode: 'read' })
    const name = sourceHandle.value.name
    if (name.toLowerCase() === 'mods' || name.toLowerCase() === 'ue4ss') throw new Error('请选择单个 MOD 文件夹')
    for await (const [childName, entry] of sourceHandle.value.entries()) {
      if (['LogicMods', '~mods'].includes(childName) || (entry.kind === 'file' && /\.(pak|ucas|utoc)$/i.test(childName))) throw new Error('PAK / IoStore 安装目前需要使用桌面版管理器，浏览器版不会把它误装进 UE4SS。')
    }
    let existing = null
    for await (const [childName, entry] of modsHandle.value.entries()) if (childName.toLowerCase() === name.toLowerCase() && entry.kind === 'directory') existing = entry
    if (existing && !window.confirm(`「${name}」已存在。覆盖前会把旧文件复制到 Mods/backup。继续？`)) return
    if (existing) {
      const backupRoot = await modsHandle.value.getDirectoryHandle('backup', { create: true })
      const backupDir = await backupRoot.getDirectoryHandle(`mod_${name}_${new Date().toISOString().replace(/[:.]/g, '-')}`, { create: true })
      await copyDirectory(existing, backupDir)
    }
    const target = await modsHandle.value.getDirectoryHandle(name, { create: true })
    await copyDirectory(sourceHandle.value, target)
    const states = new Map(mods.value.filter(m => m.kind !== 'pak').map(m => [m.name, m.enabled]))
    states.set(name, true)
    await writeModsFile(states)
    log(`安装完成：${name}，已备份 mods.txt`)
    await scanMods()
  } catch (error) {
    if (error.name !== 'AbortError') { errorMessage.value = `安装失败：${error.message}`; log(errorMessage.value, 'error') }
  }
}

async function copyModsPath(mod = null) {
  if (window.fengshaDesktop ? !localStorage.getItem('fengsha-game-root') : !modsHandle.value) return chooseGame()
  const target = mod?.kind === 'pak' ? `${localStorage.getItem('fengsha-game-root')}\\${mod.relativePath.replaceAll('/', '\\')}` : pathHint.value
  const copied = await copyTextToClipboard(target)
  if (copied) { showToast('模组目录已复制'); log(`模组目录已复制：${target}`) }
  else { showToast('复制失败，路径已写入日志', 'error'); log(`复制失败，模组目录：${target}`, 'error') }
}

async function copyAuthorContact() {
  const copied = await copyTextToClipboard('3549993943')
  showToast(copied ? '作者 QQ：3549993943 已复制' : '作者 QQ：3549993943')
}

function scrollHelpTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function launchGame() {
  if (!ue4ssReady.value && window.fengshaDesktop && localStorage.getItem('fengsha-game-root')) {
    const proceed = window.confirm('当前目录未检测到 UE4SS 启动文件（dwmapi.dll + ue4ss/UE4SS.dll）。游戏可以启动，但 UE4SS 模组大概率不会加载。仍要启动吗？')
    if (!proceed) return
  }
  // 前置依赖检测：缺前置是模组不生效最常见的原因，放在启动前拦一次
  if (!confirmDependencies()) {
    log('已取消启动：存在未满足的前置依赖', 'error')
    activeTab.value = '本地管理'
    return
  }
  if (window.fengshaDesktop && mods.value.some(mod => mod.kind === 'pak' && mod.enabled) && !pakLoaderLogSeen.value) {
    const proceed = window.confirm('已启用 PAK 模组，但还没有检测到烽沙 ContainerLoader 的初始化日志。请先安装烽沙专用 UE4SS + ContainerLoader，并在游戏关闭时安装。仍要启动游戏吗？')
    if (!proceed) return
  }
  if (window.fengshaDesktop) await window.fengshaDesktop.launchGame()
  else window.location.href = 'steam://run/1733690'
  log('已请求 Steam 启动《烽沙》（AppID 1733690）')
}
function openFengshaLoaderPage() {
  const url = 'https://www.modcraft.games/games/fengsha/mods/2'
  if (window.fengshaDesktop) window.fengshaDesktop.openExternal(url)
  else window.open(url, '_blank', 'noopener')
}
async function scanSteamGame() {
  if (!window.fengshaDesktop) return chooseGame()
  scanning.value = true
  errorMessage.value = ''
  try {
    const info = await window.fengshaDesktop.detectGame()
    if (!info) throw new Error('未在 Steam 库中找到已安装的《烽沙》（AppID 1733690），请手动选择游戏目录')
    localStorage.setItem('fengsha-game-root', info.root)
    rootName.value = info.root.split(/[\\/]/).filter(Boolean).pop()
    pathHint.value = `${info.root}\\${GAME_PARTS.join('\\')}`
    localStorage.setItem('fengsha-game-name', rootName.value)
    localStorage.setItem('fengsha-game-path', pathHint.value)
    ue4ssReady.value = info.ue4ssReady
    pakLoaderLogSeen.value = info.pakLoaderLogSeen
    log(`Steam 已识别《烽沙》：${info.root}`)
    if (!info.modsReady) {
      gameReady.value = false
      mods.value = []
      errorMessage.value = info.ue4ssReady ? '检测到 UE4SS，但没有 Mods/mods.txt；请先完成 UE4SS 配置。' : '已找到游戏，但尚未安装烽沙专用 UE4SS + ContainerLoader 前置；UE4SS 与 PAK 模组都需要兼容的游戏加载环境。'
      return
    }
    await scanMods()
  } catch (error) {
    errorMessage.value = error.message
    log(error.message, 'error')
  } finally { scanning.value = false }
}
function toggleFavorite(mod) { mod.favorite = !mod.favorite; selected.value = mod }
async function copyLogs() {
  const text = logs.value.map(l => `[${l.time}] ${l.message}`).join('\n')
  const copied = await copyTextToClipboard(text)
  if (copied) { showToast(`已复制 ${logs.value.length} 条日志`); log('日志已复制到剪贴板') }
  else { showToast('复制失败：浏览器拒绝了剪贴板访问', 'error'); log('复制日志失败：浏览器拒绝了剪贴板访问', 'error') }
}

async function checkDesktopUpdate(manual = false) {
  if (!isDesktop) return
  updateError.value = ''
  updatePhase.value = 'checking'
  try {
    const release = await window.fengshaDesktop.checkForUpdates()
    updateInfo.value = release
    if (!manual && (!release.available || localStorage.getItem('fengsha-dismissed-update') === release.version)) return
    updatePhase.value = release.available ? 'available' : 'current'
    showUpdateDialog.value = true
  } catch (error) {
    updateError.value = error.message
    updatePhase.value = 'error'
    if (manual) showUpdateDialog.value = true
  }
}
async function downloadDesktopUpdate() {
  updateError.value = ''
  updateProgress.value = { received: 0, total: updateInfo.value.size }
  updatePhase.value = 'downloading'
  try {
    await window.fengshaDesktop.downloadUpdate(updateInfo.value.version)
    updatePhase.value = 'ready'
  } catch (error) {
    updateError.value = error.message
    updatePhase.value = 'available'
  }
}
async function applyDesktopUpdate() {
  updatePhase.value = 'applying'
  updateError.value = ''
  try { await window.fengshaDesktop.applyUpdate() }
  catch (error) { updateError.value = error.message; updatePhase.value = 'ready' }
}
function dismissUpdate() {
  if (updateInfo.value?.available) localStorage.setItem('fengsha-dismissed-update', updateInfo.value.version)
  showUpdateDialog.value = false
}

function onKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    document.querySelector('.searchbox input')?.focus()
  }
  if (event.key === 'Escape') { settingsOpen.value = false; showDraftDialog.value = false; showUpdateDialog.value = false }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  if (window.fengshaDesktop) stopUpdateProgress = window.fengshaDesktop.onUpdateDownloadProgress(progress => { updateProgress.value = progress })
  log('管理器已就绪。选择游戏安装目录后，将读取 UE4SS/Mods/mods.txt。')
  // 深链解析与云端数据加载不依赖本地目录扫描，先跑。
  // 原来它们排在 await restoreGameHandle() 之后：IndexedDB 一旦卡住或抛错，
  // 分享链接（?mod=）就永远打不开，工坊也永远加载不出来。
  if (new URLSearchParams(window.location.search).has('mod')) activeTab.value = '工坊'
  loadSupabase()
  if (window.fengshaDesktop) void checkDesktopUpdate()
  try {
    if (window.fengshaDesktop && localStorage.getItem('fengsha-game-root')) {
      await scanMods()
      if (!gameReady.value) await scanSteamGame()
    } else if (window.fengshaDesktop) await scanSteamGame()
    else if (!('showDirectoryPicker' in window)) errorMessage.value = '当前浏览器不支持本地目录访问，请使用最新版 Edge 或 Chrome。'
    else await restoreGameHandle()
  } catch (error) {
    log(`恢复本地游戏目录失败：${error.message}`, 'error')
  }
})
onUnmounted(() => { window.removeEventListener('keydown', onKeydown); stopUpdateProgress(); clearImageSelection() })
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <img class="header-art" :src="`${assetBase}fengsha-command-header.png`" alt="" aria-hidden="true" />
      <div class="brand"><div class="brand-mark">烽<span>沙</span></div><div class="brand-copy"><b>烽沙</b><small>MOD 创作工坊</small></div></div>
      <nav class="main-nav">
        <button :class="{ active: activeTab === '工坊' }" @click="activeTab = '工坊'"><Package :size="19"/>模组工坊</button>
        <button :class="{ active: activeTab === '本地管理' }" @click="activeTab = '本地管理'"><HardDrive :size="18"/>本地管理</button>
        <button :class="{ active: activeTab === '创作中心' }" @click="activeTab = '创作中心'"><Upload :size="18"/>创作中心</button>
        <button :class="{ active: activeTab === '创作指南' }" @click="activeTab = '创作指南'"><BookOpen :size="18"/>创作指南</button>
        <button :class="{ active: activeTab === '工具箱' }" @click="activeTab = '工具箱'"><Wrench :size="18"/>工具箱</button>
        <button :class="{ active: activeTab === '使用帮助' }" @click="activeTab = '使用帮助'; selected = null; selectedWork = null"><CircleAlert :size="18"/>使用帮助</button>
        <button v-if="isDesktop" :class="{ active: activeTab === 'AI 军师' }" @click="activeTab = 'AI 军师'; selected = null; selectedWork = null"><Bot :size="18"/>AI 军师</button>
        <a v-if="!isDesktop" class="download-nav-link" :href="`${siteBase}download.html`"><Download :size="15"/>下载桌面版</a>
      </nav>
      <div class="top-spacer"></div><div class="build-tag"><span></span> 云端工坊</div>
            <div v-if="cloudUser" class="account-menu-wrap"><button class="account-chip" :class="{ open: accountMenuOpen }" @click="toggleAccountMenu" title="账号菜单"><img v-if="avatarUrl" class="account-avatar" :src="avatarUrl" alt=""/><span v-else class="account-avatar fallback">{{ (cloudUser.username || '玩').slice(0, 1) }}</span><span class="account-name">{{ cloudUser.username }}</span><ChevronDown :size="14" class="account-caret"/></button><div v-if="accountMenuOpen" class="account-menu-backdrop" @click="closeAccountMenu"></div><transition name="menu"><div v-if="accountMenuOpen" class="account-dropdown"><div class="account-dropdown-head"><img v-if="avatarUrl" class="account-avatar large" :src="avatarUrl" alt=""/><span v-else class="account-avatar large fallback">{{ (cloudUser.username || '玩').slice(0, 1) }}</span><div class="account-dropdown-copy"><strong>{{ cloudUser.username }}</strong><span class="account-dropdown-mail">{{ cloudUser.email }}</span><div class="account-stats"><span><b>{{ authorWorks.length }}</b> 作品</span><span><b>{{ authorFavoriteTotal }}</b> 收藏</span></div></div></div><div class="account-menu-list"><button @click="closeAccountMenu(); openUserCenter()"><CircleUserRound :size="16"/><span>用户中心</span></button><button @click="menuUpload"><Upload :size="16"/><span>上传 MOD</span></button><button @click="menuGo('创作中心')"><Package :size="16"/><span>我的 MOD</span><b>{{ authorWorks.length }}</b></button><button @click="menuOpenSettings"><Settings :size="16"/><span>设置</span></button><button v-if="isDesktop" @click="openGamePath"><FolderOpen :size="16"/><span>打开游戏路径</span></button><button @click="menuOpenSettings"><Folder :size="16"/><span>游戏路径设置</span></button><button @click="openFeedback"><MessageCircle :size="16"/><span>反馈问题</span></button></div><div class="account-menu-foot"><button class="danger" @click="closeAccountMenu(); signOut()"><LogOut :size="16"/><span>退出登录</span></button></div></div></transition></div><button v-else class="account-button" @click="openAuth('login')">登录 / 注册</button>
      <button class="icon-button" title="游戏设置" @click="settingsOpen = true"><Settings :size="18"/></button>
    </header>

    <main class="workspace" :class="{ 'detail-open': Boolean(centerDetail) }">
      <aside class="sidebar panel">
        <template v-if="activeTab === '本地管理'">
          <div class="side-section-label">模组筛选</div>
          <button v-for="(name, i) in ['全部模组', '已启用', '已禁用', '收藏模组']" :key="name" class="side-link" :class="{ chosen: filter === name }" @click="filter = name; categoryFilter = '全部分类'">
            <component :is="[Package, Check, CircleAlert, Star][i]" :size="17"/><span>{{ name }}</span><b>{{ [mods.length, enabledCount, mods.length - enabledCount, mods.filter(m => m.favorite).length][i] }}</b>
          </button>
          <div class="side-divider"></div><div class="side-section-label">分类 <button class="tiny-icon" @click="categoryFilter = '全部分类'"><ChevronDown :size="15"/></button></div>
          <button class="side-link category-link" :class="{ chosen: categoryFilter === category }" v-for="category in categories" :key="category" @click="categoryFilter = category; filter = '全部模组'"><span class="category-dot"></span><span>{{ category }}</span><b>{{ mods.filter(m => m.category === category).length }}</b></button>
        </template>
        <template v-else-if="activeTab === '工坊'">
          <div class="side-section-label">工坊导航</div>
          <button class="side-link" :class="{ chosen: workshopView === 'discover' }" @click="selectWorkshopView('discover')"><Package :size="17"/><span>发现作品</span><b>{{ workshopWorks.length }}</b></button>
          <button class="side-link" :class="{ chosen: workshopView === 'newest' }" @click="selectWorkshopView('newest')"><Star :size="17"/><span>最新发布</span></button>
          <button class="side-link" :class="{ chosen: workshopView === 'all' }" @click="selectWorkshopView('all')"><RefreshCw :size="17"/><span>浏览全部</span></button>
          <div class="side-divider"></div><div class="side-section-label">作品分类</div>
          <button class="side-link category-link" :class="{ chosen: workshopCategory === category }" v-for="category in workshopCategories" :key="category" @click="workshopCategory = category"><span class="category-dot"></span><span>{{ category }}</span></button>
        </template>
        <template v-else-if="activeTab === '创作中心'">
          <div class="side-section-label">作者中心</div><button class="side-link" :class="{ chosen: activeTab === '创作中心' }" @click="activeTab = '创作中心'"><Upload :size="17"/><span>我的云端作品</span><b>{{ authorWorks.length }}</b></button><button class="side-link" @click="startDraft"><Plus :size="17"/><span>上传新作品</span></button><div class="side-divider"></div><div class="side-section-label">本机保存</div><p class="side-note">本地草稿仍只保存在此浏览器。</p>
        </template>
        <template v-else-if="activeTab === 'AI 军师'">
          <div class="side-section-label">烽沙 AI 军师</div>
          <button class="side-link chosen"><Bot :size="17"/><span>模组诊断助手</span></button>
          <div class="side-divider"></div><div class="side-section-label">可用能力</div>
          <p class="side-note">读取游戏加载器、UE4SS 模组状态和 PAK 文件清单。所有检查均为只读。</p>
          <button class="side-link" @click="settingsOpen = true"><Settings :size="17"/><span>游戏目录设置</span></button>
        </template>
        <template v-else-if="activeTab === '使用帮助'">
          <div class="side-section-label">玩家使用帮助</div>
          <button class="side-link chosen" @click="scrollHelpTo('help-start')"><Check :size="17"/><span>安装顺序</span></button>
          <button class="side-link" @click="scrollHelpTo('help-ue4ss')"><Download :size="17"/><span>UE4SS 前置</span></button>
          <button class="side-link" @click="scrollHelpTo('help-types')"><Package :size="17"/><span>模组类型与安装</span></button>
          <button class="side-link" @click="scrollHelpTo('help-piracy')"><CircleAlert :size="17"/><span>版本兼容说明</span></button>
          <div class="side-divider"></div><div class="side-section-label">联系作者</div>
          <p class="side-note">QQ：3549993943</p>
        </template>
        <template v-else>
          <div class="side-section-label">创作工坊</div><button class="side-link" @click="activeTab = '工坊'"><Package :size="17"/><span>模组工坊</span></button><button class="side-link" @click="activeTab = '本地管理'"><HardDrive :size="17"/><span>本地管理</span></button><button class="side-link" @click="activeTab = '创作中心'"><Upload :size="17"/><span>作者中心</span></button>
        </template>
        <div class="side-bottom"><div class="game-mini"><Gamepad2 :size="16"/><span>{{ rootName }}</span></div><button v-if="activeTab === '本地管理'" class="primary-button install-button" @click="installMod"><Plus :size="18"/>安装本地模组<ChevronDown :size="15" class="button-tail"/></button><button v-else-if="activeTab === '使用帮助'" class="primary-button install-button" @click="openFengshaLoaderPage"><Download :size="17"/>获取兼容前置</button><button v-else class="primary-button install-button" @click="startDraft"><Plus :size="18"/>新建作品</button></div>
      </aside>

      <section class="center-column">
        <section v-if="centerDetail" class="detail-panel panel">
          <div class="detail-panel-head"><div class="detail-panel-title"><span class="section-eyebrow">{{ activeTab === '本地管理' ? 'MOD DETAIL' : activeTab === '创作中心' ? 'MY WORK' : 'WORK DETAIL' }}</span><b>{{ activeTab === '本地管理' ? '模组详情' : activeTab === '创作中心' ? '我的作品详情' : '作品详情' }}</b></div><button class="secondary-button back-button" @click="selected = null; selectedWork = null"><ArrowLeft :size="15"/>返回列表</button></div>
          <div class="detail-panel-body">
            <template v-if="activeTab === '本地管理' && selected"><div class="work-layout"><div class="work-main"><header class="work-hero"><div class="work-hero-mark"><Package :size="26"/></div><div class="work-hero-copy"><div class="work-hero-title"><h2>{{ selected.name }}</h2><span class="state-chip" :class="selected.missing ? 'off' : selected.enabled ? 'on' : 'off'">{{ selected.missing ? '文件缺失' : selected.enabled ? '已启用' : '已禁用' }}</span></div><p class="work-hero-byline"><span>{{ selected.author }}</span><i>·</i><span>{{ selected.kind === 'pak' ? (selected.pakType === 'IoStore' ? 'IoStore' : 'PAK') : 'UE4SS' }}</span><i>·</i><span>{{ selected.category }}</span></p></div></header><p class="work-desc">{{ selected.description }}</p><p v-if="selected.kind === 'pak'" class="work-note">PAK 模组不使用 UE4SS 的 mods.txt，也不支持此处调整加载顺序。IoStore 模组需要完整的同名 .pak、.ucas、.utoc 文件及对应加载器。</p></div><aside class="work-side"><div class="side-panel"><div class="side-panel-title">模组信息</div><dl class="work-facts"><div><dt>格式</dt><dd>{{ selected.kind === 'pak' ? (selected.pakType === 'IoStore' ? 'IoStore' : 'PAK') : 'UE4SS' }}</dd></div><div><dt>所在目录</dt><dd>{{ selected.kind === 'pak' ? (selected.pakType === 'IoStore' ? '~mods' : 'LogicMods') : 'Mods' }}</dd></div><div><dt>当前状态</dt><dd :class="selected.enabled ? 'state-on' : 'state-off'">{{ selected.missing ? '文件缺失' : selected.enabled ? '已启用' : '已禁用' }}</dd></div></dl></div><div class="side-panel"><div class="side-panel-title">操作</div><button v-if="!selected.missing" class="primary-button work-cta side-cta" @click="toggleMod(selected)"><Settings :size="16"/>{{ selected.enabled ? '停用模组' : '启用模组' }}</button><div v-if="selected.kind !== 'pak' && sort === '加载顺序'" class="detail-order-actions"><button class="secondary-button" :disabled="mods.filter(item => item.kind !== 'pak').findIndex(item => item.id === selected.id) === 0 || selected.missing" @click="moveMod(selected, -1)"><ArrowUp :size="14"/>上移</button><button class="secondary-button" :disabled="mods.filter(item => item.kind !== 'pak').findIndex(item => item.id === selected.id) === mods.filter(item => item.kind !== 'pak').length - 1 || selected.missing" @click="moveMod(selected, 1)"><ArrowDown :size="14"/>下移</button></div></div></aside></div></template>
            <template v-else-if="selectedWork">
            <div class="work-layout">
              <div class="work-main">
                <header class="work-hero"><div class="work-hero-mark"><Package :size="26"/></div><div class="work-hero-copy"><div class="work-hero-title"><h2>{{ selectedWork.title }}</h2><span v-if="selectedWork.pinned_at" class="pin-chip"><Pin :size="11"/>置顶</span></div><p class="work-hero-byline"><span>{{ selectedWork.author }}</span><i>·</i><span>v{{ selectedWork.version }}</span><i>·</i><span>{{ selectedWork.category }}</span><i>·</i><span>发布于 {{ new Date(selectedWork.created_at).toLocaleDateString('zh-CN') }}</span></p><div class="work-hero-stats"><span><Download :size="12"/>{{ selectedWork.downloads || 0 }} 次下载</span><span><Heart :size="12"/>{{ communityState.likes }} 点赞</span><span><Star :size="12"/>{{ communityState.favorites }} 收藏</span><span><MessageCircle :size="12"/>{{ communityState.comments }} 评论</span></div></div></header>
                <p class="work-desc">{{ selectedWork.description || selectedWork.summary || '暂无详细说明。' }}</p>
                <div v-if="selectedWork.cover_url || selectedWork.screenshot_urls?.length" class="work-gallery"><img v-if="selectedWork.cover_url" :src="selectedWork.cover_url" :alt="`${selectedWork.title} 封面`"/><img v-for="(url, index) in selectedWork.screenshot_urls" :key="url" :src="url" :alt="`${selectedWork.title} 效果图 ${index + 1}`"/></div>
                <section v-if="activeTab === '工坊'" class="comment-section"><div class="comment-head"><MessageCircle :size="16"/><b>玩家评论</b><span>{{ communityState.comments }}</span></div><form class="comment-form" @submit.prevent="submitCommunityComment"><textarea v-model="communityComment" maxlength="1000" rows="3" placeholder="写下使用体验或建议…"/><button class="primary-button" :disabled="communitySubmitting || !communityComment.trim()"><LoaderCircle v-if="communitySubmitting" :size="15" class="spin"/><MessageCircle v-else :size="15"/>发表评论</button></form><div v-if="communityLoading" class="comment-empty">正在读取评论…</div><div v-else-if="!commentThreads.length" class="comment-empty">还没有评论，来分享第一条使用体验。</div><div v-else class="comment-list"><article v-for="thread in commentThreads" :key="thread.root.id" class="comment-item"><header><img v-if="avatarSrc(thread.root.avatar_path)" class="comment-avatar-img" :src="avatarSrc(thread.root.avatar_path)" alt=""/><span v-else class="comment-avatar">{{ (thread.root.display_name || '玩').slice(0, 1) }}</span><b>{{ thread.root.display_name }}</b><time>{{ new Date(thread.root.created_at).toLocaleDateString('zh-CN') }}</time></header><p>{{ thread.root.body }}</p><div v-if="thread.replies.length" class="comment-replies"><div v-for="reply in thread.replies" :key="reply.id" class="comment-reply"><header><img v-if="avatarSrc(reply.avatar_path)" class="comment-avatar-img small" :src="avatarSrc(reply.avatar_path)" alt=""/><span v-else class="comment-avatar small">{{ (reply.display_name || '玩').slice(0, 1) }}</span><b>{{ reply.display_name }}</b><span v-if="reply.user_id === selectedWork?.owner_id" class="reply-tag">作者</span><time>{{ new Date(reply.created_at).toLocaleDateString('zh-CN') }}</time></header><p>{{ reply.body }}</p></div></div><div v-if="cloudUser" class="comment-owner-actions"><button type="button" class="text-action" @click="startReply(thread.root)">{{ replyTarget === thread.root.id ? '取消回复' : '回复' }}</button></div><form v-if="replyTarget === thread.root.id" class="reply-form" @submit.prevent="submitCommentReply(thread.root)"><textarea v-model="replyDraft" maxlength="1000" rows="2" placeholder="回复这条评论…"/><button class="primary-button" :disabled="replySubmitting || !replyDraft.trim()"><LoaderCircle v-if="replySubmitting" :size="14" class="spin"/><MessageCircle v-else :size="14"/>回复</button></form></article></div></section>
              </div>
              <aside class="work-side">
                <div class="side-panel"><div class="side-panel-title">模组信息</div><dl class="work-facts"><div><dt>分类</dt><dd>{{ selectedWork.category }}</dd></div><div><dt>版本</dt><dd>v{{ selectedWork.version }}</dd></div><div><dt>下载量</dt><dd>{{ selectedWork.downloads || 0 }}</dd></div><div v-if="selectedWork.compatibility"><dt>兼容版本</dt><dd>{{ selectedWork.compatibility }}</dd></div><div v-if="selectedWork.package_size"><dt>文件大小</dt><dd>{{ Math.ceil(selectedWork.package_size / 1024) }} KB</dd></div><div v-if="selectedWork.dependencies"><dt>依赖项</dt><dd>{{ selectedWork.dependencies }}</dd></div></dl></div>
                <div class="side-panel"><div class="side-panel-title">下载</div><button v-if="activeTab === '工坊'" class="primary-button work-cta side-cta" @click="downloadWork(selectedWork)"><Download :size="16"/>下载 ZIP</button><button v-if="activeTab === '创作中心' && selectedWork.owner_id === cloudUser?.id" class="primary-button work-cta side-cta" @click="editPublishedWork(selectedWork)"><Upload :size="16"/>更新这个 MOD</button><button v-if="cloudUser?.is_admin" type="button" class="pin-toggle side-cta" :class="{ active: selectedWork.pinned_at }" :disabled="pinSubmitting" @click="toggleWorkPin(selectedWork)"><LoaderCircle v-if="pinSubmitting" :size="13" class="spin"/><PinOff v-else-if="selectedWork.pinned_at" :size="13"/><Pin v-else :size="13"/>{{ selectedWork.pinned_at ? '取消置顶' : '置顶作品' }}</button></div>
                <div v-if="activeTab === '工坊'" class="side-panel"><div class="side-panel-title">互动</div><div class="side-actions"><button :class="{ active: communityState.liked }" :disabled="communitySubmitting" @click="toggleCommunity('like')"><Heart :size="15"/>点赞<b>{{ communityState.likes }}</b></button><button :class="{ active: communityState.favorited }" :disabled="communitySubmitting" @click="toggleCommunity('favorite')"><Star :size="15"/>收藏<b>{{ communityState.favorites }}</b></button><button @click="shareWork(selectedWork)"><Share2 :size="15"/>分享链接</button></div><div class="tip-actions"><button type="button" class="tip-button" @click="openAuthorDonation"><Heart :size="13"/>打赏作者</button><button type="button" class="tip-button subtle" @click="openPlatformDonation"><Heart :size="13"/>打赏烽沙工具</button></div><div v-if="shareFallbackUrl" class="share-fallback"><span>浏览器拦截了自动复制，请手动复制：</span><input :value="shareFallbackUrl" readonly @focus="$event.target.select()"/></div><div v-if="communityError" class="community-error">{{ communityError }}</div></div>
              </aside>
            </div>
            </template>
          </div>
        </section>

        <section v-if="activeTab === 'AI 军师'" class="agent-panel panel">
          <div class="agent-heading"><div class="agent-avatar"><Bot :size="24"/></div><div><span class="section-eyebrow">FENGSHA MOD AGENT</span><h1>AI 军师</h1><p>连接本机 DuckAI，协助分析烽沙 MOD 安装与加载问题。</p></div></div>
          <div class="agent-connection"><label class="agent-field"><span>本机 API 地址</span><input v-model="agentOrigin" spellcheck="false" aria-label="本机 AI API 地址" @input="agentOnline = false; agentAnswered = false; agentError = ''; agentModelsFound = []"/></label><label class="agent-field"><span>模型</span><select v-model="agentModel" aria-label="AI 模型" @change="agentAnswered = false; agentError = ''"><option v-for="model in (agentModelsFound.length ? agentModelsFound : [agentModel])" :key="model" :value="model">{{ model }}</option></select></label><button class="secondary-button agent-connect" :disabled="agentBusy" @click="checkAgent"><RefreshCw :size="15"/>{{ agentOnline ? '重新检测' : '检测连接' }}</button></div>
          <div class="agent-status" :class="{ online: agentOnline && !agentError, offline: agentError }"><i></i><span>{{ agentError || (agentAnswered ? `模型已回复 · ${agentModel}` : agentOnline ? '本机桥接已连接，模型能否回复尚未验证。' : '尚未连接。请先在本机启动 DuckAI 服务。') }}</span></div>
          <div class="agent-safety"><ShieldCheck :size="15"/><span>安全边界：模型只能读取当前游戏目录的状态。不会自行安装、启用、排序、删除模组或启动游戏。</span></div>
          <div class="agent-prompts"><span>试试这样问</span><button type="button" @click="agentDraft = '帮我检查当前 UE4SS 前置和模组状态'">检查加载器和模组</button><button type="button" @click="agentDraft = '为什么我的 PAK 模组可能没有生效？请根据当前状态分析'">分析 PAK 未生效</button></div>
          <div class="agent-chat" aria-live="polite"><article v-for="(message, index) in agentMessages" :key="index" class="agent-message" :class="message.role"><span>{{ message.role === 'assistant' ? '军师' : '你' }}</span><p>{{ message.content }}</p></article><div v-if="agentBusy" class="agent-thinking"><LoaderCircle :size="15" class="spin"/>正在分析…</div></div>
          <form class="agent-composer" @submit.prevent="sendAgentMessage"><textarea v-model="agentDraft" maxlength="2000" rows="2" placeholder="描述你遇到的模组问题…" :disabled="agentBusy" @keydown.ctrl.enter.prevent="sendAgentMessage"/><button class="primary-button" type="submit" :disabled="agentBusy || !agentDraft.trim()"><LoaderCircle v-if="agentBusy" :size="16" class="spin"/><Send v-else :size="16"/>发送</button></form>
          <small class="agent-footnote">DuckAI 是非官方桥接服务。对话会从本机转发至 Duck.ai 后端；服务不提供有效 API 密钥认证，请勿公开端口或粘贴密钥、账号等隐私内容。可用性受第三方限流、网络和服务条款变化影响。</small>
        </section>

        <div v-if="activeTab === '本地管理' && !centerDetail" class="list-panel panel" :class="{ 'drag-over': zipDragOver }" @dragover="onModListDragOver" @dragleave="zipDragOver = false" @drop="onModListDrop">
          <div v-if="hasGameRoot && !ue4ssReady" class="prereq-banner"><CircleAlert :size="17"/><span><b>未检测到烽沙兼容前置</b> — PAK 和 UE4SS 模组都需要游戏兼容的加载环境。</span><button class="text-action" @click="openFengshaLoaderPage">获取烽沙专用前置</button><button class="text-action" @click="scanSteamGame">重新扫描</button></div>
          <div v-else-if="hasGameRoot && isDesktop && mods.some(mod => mod.kind === 'pak' && mod.enabled) && !pakLoaderLogSeen" class="prereq-banner"><CircleAlert :size="17"/><span><b>PAK 加载器状态待确认</b> — 检测到 UE4SS，但日志里还没有 ContainerLoader 初始化挂载记录。安装烽沙专用前置后启动游戏，再重新扫描确认。</span><button class="text-action" @click="openFengshaLoaderPage">获取烽沙专用前置</button><button class="text-action" @click="scanMods">重新扫描</button></div>
          <div v-else-if="hasGameRoot && isDesktop && pakLoaderLogSeen && mods.some(mod => mod.kind === 'pak' && mod.enabled)" class="prereq-banner prereq-ok"><ShieldCheck :size="17"/><span><b>检测到 PAK 加载器初始化日志</b> — 该记录不代表已验证每个模组内容均正常生效。</span></div>
          <div class="list-toolbar">
            <label class="searchbox"><Search :size="17"/><input v-model="query" placeholder="搜索模组名称、作者或描述…"/><kbd>Ctrl K</kbd></label>
            <div class="toolbar-right"><label class="sortbox"><ArrowDownWideNarrow :size="15"/><select v-model="sort"><option>加载顺序</option><option>名称排序</option><option>启用优先</option></select><ChevronDown :size="14"/></label><template v-if="sort === '加载顺序'"><button class="icon-button subtle" :class="{ selected: sortLock }" :title="sortLock ? '解锁加载顺序' : '锁定加载顺序，防止误拖动'" @click="setSortLock(!sortLock)"><Lock v-if="sortLock" :size="15"/><Unlock v-else :size="15"/></button><button class="icon-button subtle" title="按前置依赖自动排序" @click="autoSortMods"><ListOrdered :size="16"/></button><button class="icon-button subtle" title="导出加载顺序为文件" @click="exportModOrder"><Download :size="16"/></button><label class="icon-button subtle" title="从文件导入加载顺序"><Upload :size="16"/><input type="file" accept="application/json,.json" class="hidden-file-input" @change="importModOrder"/></label></template><button class="icon-button subtle" :class="{ selected: scanning }" title="重新扫描" @click="scanMods"><RefreshCw :size="16"/></button><button class="icon-button subtle" :class="{ selected: view === 'grid' }" title="切换卡片视图" @click="view = view === 'list' ? 'grid' : 'list'"><component :is="view === 'list' ? Grid2X2 : List" :size="17"/></button></div>
          </div>
          <div v-if="errorMessage" class="error-banner"><CircleAlert :size="17"/><span>{{ errorMessage }}</span><button class="icon-button" @click="errorMessage = ''"><X :size="15"/></button></div>
          <div class="list-heading"><span>#</span><span>模组名称</span><span>格式 / 作者</span><span>分类</span><span>状态</span><span>操作</span></div>
          <div class="mod-list" :class="{ grid: view === 'grid' }">
            <article v-for="(mod, index) in shownMods" :key="mod.id || mod.name" class="mod-row" :class="{ selected: selected?.id === mod.id, disabled: !mod.enabled, draggable: canDragMod(mod), dragging: dragModId === mod.id, 'drop-target': dropTargetId === mod.id && dragModId !== mod.id }" :draggable="canDragMod(mod)" @click="selected = mod" @dragstart="onModDragStart(mod, $event)" @dragover="onModDragOver(mod, $event)" @dragend="onModDragEnd" @drop.prevent="onModDrop(mod)">
              <span class="row-index">{{ String(index + 1).padStart(2, '0') }}</span><div class="mod-emblem"><Package :size="20"/></div>
              <div class="mod-name"><strong>{{ mod.name }}<span v-if="mod.cloud" class="cloud-tag" :title="mod.cloud.dependencies ? `来自工坊 · 前置依赖：${mod.cloud.dependencies}` : '来自工坊'">云</span></strong><span>{{ mod.description }}</span></div><div class="mod-version"><b>{{ mod.missing ? '缺少文件' : mod.kind === 'pak' ? (mod.pakType === 'IoStore' ? 'IoStore' : 'PAK 模组') : 'UE4SS' }}</b><span>{{ mod.author }}</span></div>
              <span class="category-pill" :class="{ alert: mod.missing }">{{ mod.category }}</span>
              <button class="switch" :class="{ on: mod.enabled }" :disabled="mod.missing || (mod.incomplete && !mod.enabled)" :aria-label="mod.enabled ? '停用' : '启用'" @click.stop="toggleMod(mod)"><i></i></button>
              <div class="row-actions"><button :title="mod.favorite ? '取消收藏' : '收藏'" @click.stop="toggleFavorite(mod)"><Star :size="15" :fill="mod.favorite ? 'currentColor' : 'none'"/></button><button title="复制模组目录" @click.stop="selected = mod; copyModsPath(mod)"><FolderOpen :size="15"/></button><button title="查看详情" @click.stop="selected = mod"><ChevronRight :size="16"/></button></div>
            </article>
            <div v-if="!shownMods.length" class="empty-state"><div class="empty-icon"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M19 15 32 8l13 7-13 8-13-8Z"/><path d="M19 15v18l13 8V23M45 15v18l-13 8M26 19l13-8M32 23v18M15 20l-7 9 5 1 8-9M49 20l7 9-5 1-8-9"/><path d="M6 49h52M11 54h42"/><path d="M21 27h5v8h-5z"/></svg></div><strong>{{ emptyState.title }}</strong><p>{{ emptyState.hint }}</p><button v-if="emptyState.kind === 'needs-permission'" class="primary-button" @click="resumeGameHandle"><FolderOpen :size="15"/>恢复游戏目录访问</button><button v-else-if="emptyState.kind === 'no-directory'" class="primary-button" @click="chooseGame">选择游戏目录</button><button v-else class="secondary-button" @click="installMod"><Plus :size="15"/>安装本地模组</button></div>
          </div>
          <div class="list-footer"><span>显示 <b>{{ shownMods.length }}</b> / {{ mods.length }} 个条目</span><span class="scan-status"><i :class="{ online: gameReady }"></i>{{ scanning ? '正在扫描…' : gameReady ? 'UE4SS 已连接' : '等待选择游戏目录' }}</span></div>
        </div>
        <section v-else-if="activeTab === '工坊' && !centerDetail" class="workshop-panel panel">
          <div class="page-heading"><div><span class="section-eyebrow">FENGSHA MOD WORKSHOP</span><h1>烽沙模组工坊</h1><p>发现玩家创作，分享你的战国世界。</p></div><button class="primary-button" @click="cloudUser ? startDraft() : openAuth('register')"><Plus :size="16"/>上传 MOD</button></div>
          <div v-if="workshopError" class="offline-banner"><CircleAlert :size="18"/><div><b>暂时无法连接工坊</b><span>{{ workshopError }}</span></div><button class="secondary-button" @click="refreshWorkshop">重试</button></div>
          <div v-else class="author-notice"><ShieldCheck :size="17"/><span>玩家作品上传后立即公开 · 下载 ZIP 后解压，再从本地管理选择文件夹安装</span></div>
          <div class="workshop-toolbar"><label class="searchbox"><Search :size="17"/><input v-model="workshopQuery" placeholder="搜索作品、作者或简介…"/></label><label class="sortbox"><ArrowDownWideNarrow :size="15"/><select v-model="workshopSort"><option>最新发布</option><option>名称排序</option></select><ChevronDown :size="14"/></label></div>
          <div class="work-grid"><article v-for="work in shownWorks" :key="work.id" class="work-card" :class="{ picked: selectedWork?.id === work.id }" @click="selectWork(work)"><div class="work-art" :class="['gold','red','teal'][Number(work.id.slice(0, 2).replace(/\\D/g, '') || 0) % 3]"><img v-if="work.cover_url" :src="work.cover_url" :alt="`${work.title} 封面`"/><span v-else>{{ work.title.slice(0, 1) }}</span><span v-if="installedWorkIds.has(work.id)" class="state-badge installed">已安装</span><span v-else-if="downloadedWorkIds.has(work.id)" class="state-badge downloaded">已下载</span><span v-if="work.pinned_at" class="pin-badge"><Pin :size="11"/>置顶</span></div><div class="work-card-body"><div class="work-title-line"><b>{{ work.title }}</b></div><p>{{ work.summary }}</p><div class="work-meta"><span>{{ work.category }}</span><span>v{{ work.version }}</span><span>{{ work.author }}</span></div><div class="work-card-bottom"><span>发布于 {{ new Date(work.created_at).toLocaleDateString('zh-CN') }}</span><span class="download-count">↓ {{ work.downloads || 0 }}</span><button @click.stop="downloadWork(work)">下载 ZIP</button></div></div></article><div v-if="!shownWorks.length" class="draft-empty"><Package :size="23"/><b>{{ workshopLoading ? '正在加载云端作品…' : workshopError ? '工坊暂不可用' : '工坊还没有公开作品' }}</b><span>{{ workshopLoading ? '正在读取云端已发布作品。' : '登录后上传 MOD，上传完成后即可公开下载。' }}</span><button v-if="!workshopLoading && !cloudUser" class="secondary-button" @click="openAuth('register')">注册并上传</button></div></div>
        </section>

        <section v-else-if="activeTab === '创作中心' && !centerDetail" class="author-panel panel">
          <div class="page-heading"><div><span class="section-eyebrow">CREATOR STUDIO</span><h1>我的创作中心</h1><p>{{ cloudUser ? `已登录为 ${cloudUser.username}，管理你的云端作品。` : '登录工坊账号后上传 MOD，与其他烽沙玩家分享。' }}</p></div><button class="primary-button" @click="cloudUser ? startDraft() : openAuth('login')"><Plus :size="16"/>上传新作品</button></div>
          <div class="author-notice"><ShieldCheck :size="17"/><span>ZIP 最大 50 MB；封面和效果图支持 JPG、PNG、WebP，单张最大 5 MB，上传完成后立即公开。</span></div>
          <div class="author-stats"><div><span>我的云端作品</span><b>{{ authorWorks.length }}</b></div><div><span>已公开</span><b>{{ authorWorks.filter(m => m.status === 'published').length }}</b></div><div><span>图片作品</span><b>{{ authorWorks.filter(m => m.cover_path || m.screenshot_paths?.length).length }}</b></div></div>
          <div class="draft-section-title"><b>我的 MOD</b><span>云端账号同步</span></div>
          <div v-if="authorWorks.length" class="author-table-toolbar"><div class="author-filter"><button v-for="option in ['全部', '已公开']" :key="option" type="button" :class="{ active: authorFilter === option }" @click="authorFilter = option">{{ option }}</button></div><span class="author-table-count">共 {{ shownAuthorWorks.length }} 件</span></div>
          <div v-if="shownAuthorWorks.length" class="author-table-wrap"><table class="author-table"><thead><tr><th>Mod 名称</th><th>分类</th><th>收藏</th><th>下载</th><th>更新时间</th><th>操作</th></tr></thead><tbody><tr v-for="work in shownAuthorWorks" :key="work.id"><td class="cell-name"><b>{{ work.title }}</b><span>{{ work.summary }}</span></td><td><span class="table-chip">{{ work.category }}</span></td><td class="cell-num">{{ work.favorites || 0 }}</td><td class="cell-num">{{ work.downloads || 0 }}</td><td class="cell-time">{{ new Date(work.updated_at || work.created_at).toLocaleDateString('zh-CN') }}</td><td class="cell-actions"><button type="button" class="text-action" @click="editPublishedWork(work)">更新</button><button type="button" class="text-action" @click="selectWork(work)">数据</button><button type="button" class="text-action danger" :disabled="deletingWorkId === work.id" @click="deleteAuthorWork(work)"><LoaderCircle v-if="deletingWorkId === work.id" :size="13" class="spin"/><Trash2 v-else :size="13"/>删除</button></td></tr></tbody></table></div>
          <div v-else-if="authorWorks.length" class="draft-empty"><FileArchive :size="25"/><b>当前筛选下没有作品</b><span>换成「全部」可以看到全部 {{ authorWorks.length }} 件作品。</span><button class="secondary-button" @click="authorFilter = '全部'">显示全部</button></div>
          <div v-else class="draft-empty"><FileArchive :size="25"/><b>{{ cloudUser ? '还没有云端作品' : '先登录或注册工坊账号' }}</b><span>上传作品和图片，发布后所有玩家都可查看、下载。</span><button class="secondary-button" @click="cloudUser ? startDraft() : openAuth('register')">{{ cloudUser ? '上传第一个作品' : '登录 / 注册' }}</button></div>
        </section>

        <section v-else-if="activeTab === '创作指南'" class="guide-panel panel"><span class="section-eyebrow">CREATOR GUIDE</span><h1>烽沙 MOD 创作指南</h1><p class="guide-lead">准备一份清楚、安全、易安装的 MOD 说明。</p><div class="guide-grid"><article><b>作品说明</b><p>写清楚功能、游戏版本、依赖、安装步骤与已知问题。使用你有权分享的内容。</p></article><article><b>安装安全</b><p>先备份存档。核对来源、文件结构和依赖；不确定时不要覆盖已有文件。</p></article><article><b>安装下载作品</b><p>从工坊下载 ZIP，确认来源后解压，再使用本地管理的文件夹安装并启用。</p></article><article><b>上传作品</b><p>上传 ZIP、封面和效果图；发布后所有玩家都能看到并下载，请确认你有权分享上传内容。</p></article></div><button class="primary-button" @click="cloudUser ? startDraft() : openAuth('register')"><Plus :size="16"/>上传 MOD</button></section>

        <section v-else-if="activeTab === '使用帮助'" class="help-panel panel">
          <header class="help-heading"><div><span class="section-eyebrow">PLAYER GUIDE · FENGSHA MOD MANAGER</span><h1>玩家使用帮助</h1><p>按顺序完成前置、目录识别和模组安装；不确定类型时先看作品说明。</p></div><button class="secondary-button" @click="settingsOpen = true"><Settings :size="15"/>游戏目录设置</button></header>
          <div id="help-start" class="help-prereq-callout"><div class="help-callout-icon"><CircleAlert :size="21"/></div><div><b>先安装烽沙兼容的 UE4SS 前置，再安装普通 MOD</b><p>缺少加载器时，UE4SS 脚本不会生效；部分 PAK 也依赖兼容的 ContainerLoader。</p></div><button class="primary-button" @click="openFengshaLoaderPage"><Download :size="16"/>获取兼容前置<ChevronRight :size="15"/></button></div>
          <div class="help-step-grid">
            <article class="help-step-card"><span class="help-step-number">01</span><div><b>识别游戏目录</b><p>桌面版可在「本地管理」扫描 Steam 库，也可在游戏目录设置中手动选择《烽沙》根目录。浏览器版选择目录后，还需按浏览器提示授权。</p><button class="text-action" @click="settingsOpen = true"><FolderOpen :size="14"/>打开目录设置</button></div></article>
            <article id="help-ue4ss" class="help-step-card help-step-important"><span class="help-step-number">02</span><div><b>先装 UE4SS 前置</b><p>游戏关闭时安装与当前游戏版本兼容的前置。完成后返回管理器重新扫描；右侧「前置环境」显示已就绪，才表示检测到 UE4SS 文件。</p><p class="help-muted">PAK / IoStore 模组可能还需要前置内的 ContainerLoader；UE4SS 显示就绪不等于 PAK 加载器已成功初始化。</p><button class="text-action" @click="openFengshaLoaderPage"><Download :size="14"/>打开烽沙兼容前置页面</button></div></article>
            <article id="help-types" class="help-step-card"><span class="help-step-number">03</span><div><b>查看模组类型和依赖</b><p><strong>UE4SS</strong> 模组通常安装在 <code>ue4ss\Mods</code>，并由 <code>mods.txt</code> 控制启用状态与加载顺序。需要调整时，在本地管理列表中选择模组后使用上移 / 下移。</p><p><strong>PAK / IoStore</strong> 使用游戏资源目录与对应加载器，不受 UE4SS 的 <code>mods.txt</code> 排序控制；IoStore 通常需要同组的 <code>.pak</code>、<code>.ucas</code>、<code>.utoc</code> 文件齐全。</p></div></article>
            <article class="help-step-card"><span class="help-step-number">04</span><div><b>下载并安装模组</b><p>在工坊打开作品详情，先核对游戏版本、模组类型和依赖。桌面版开启「下载后自动安装」后可直接安装；关闭时先下载 ZIP、解压，再到「本地管理 → 安装本地模组」选择解压出的单个模组文件夹。桌面版也可以直接把模组 ZIP 拖到模组列表上：工具会先检查这个包是不是能用的模组，不合格会说明原因并拒绝安装，合格则直接装好并自动排入加载顺序。</p><p>安装后检查模组状态与加载顺序，再启动游戏。出现覆盖提示时会先备份同名文件；不要在游戏运行时替换前置或模组文件。</p></div></article>
            <article class="help-step-card"><span class="help-step-number">05</span><div><b>遇到未生效或启动报错</b><p>重新扫描目录，确认 UE4SS 前置、依赖、游戏版本和文件结构。查看管理日志中的具体错误；启用 PAK 后还要确认 ContainerLoader 初始化记录。仍无法解决时，联系模组作者并附上模组名、游戏版本和错误日志。</p></div></article>
          </div>
          <section id="help-piracy" class="help-boundary"><div><span class="section-eyebrow">COMPATIBILITY NOTICE</span><h2>关于盗版 / 修改版游戏</h2><p>管理器不提供盗版游戏的安装教程，也不会破解、绕过 Steam 授权校验或修补受保护的游戏文件。手动选中某个目录只代表管理器能访问该目录，不代表该版本受支持或模组可以正常加载。盗版、改包和不同版本可能缺少文件或与加载器不兼容；如需稳定使用及获得排错支持，请使用 Steam 正版，并保持游戏与前置版本匹配。</p></div><ShieldCheck :size="22"/></section>
          <footer class="help-contact"><div><span class="section-eyebrow">AUTHOR CONTACT</span><b>作者联系方式：QQ 3549993943</b><small>反馈时请说明管理器版本、游戏版本和遇到的问题。</small></div><button class="secondary-button" @click="copyAuthorContact"><Clipboard :size="15"/>复制 QQ 号</button></footer>
        </section>

        <div v-else-if="activeTab === '工具箱'" class="toolbox-panel panel"><div class="section-eyebrow">QUICK TOOLS</div><h2>烽沙工具箱</h2><p>常用的本地管理入口</p><div class="tool-grid"><button class="tool-card" @click="copyModsPath"><FolderOpen/><b>复制 Mods 相对路径</b><span>复制游戏目录内 UE4SS 模组文件夹的相对路径</span></button><button class="tool-card" @click="scanMods"><RefreshCw/><b>重新扫描</b><span>从游戏目录重新读取模组状态</span></button><button class="tool-card" @click="launchGame"><Gamepad2/><b>启动烽沙</b><span>通过 Steam 启动 App 1733690</span></button><button class="tool-card" @click="settingsOpen = true"><Settings/><b>游戏目录设置</b><span>选择或更换游戏安装目录</span></button></div></div>
        <div class="logs-panel panel"><div class="logs-head"><div class="log-tabs" role="tablist"><button type="button" role="tab" :aria-selected="logFilter === 'all'" :class="{ active: logFilter === 'all' }" @click="logFilter = 'all'">全部日志<b>{{ logCounts.all }}</b></button><button type="button" role="tab" :aria-selected="logFilter === 'info'" :class="{ active: logFilter === 'info' }" @click="logFilter = 'info'">操作记录<b>{{ logCounts.info }}</b></button><button type="button" role="tab" :aria-selected="logFilter === 'error'" :class="{ active: logFilter === 'error' }" @click="logFilter = 'error'">错误信息<b>{{ logCounts.error }}</b></button></div><button class="text-action" @click="logs = []"><Trash2 :size="14"/>清空日志</button><button class="text-action" @click="copyLogs"><Clipboard :size="14"/>复制日志</button></div><div class="logs-body"><div v-for="(entry, i) in shownLogs" :key="`${entry.time}-${i}`" class="log-line" :class="entry.type"><time>[{{ entry.time }}]</time><span>{{ entry.message }}</span></div><div v-if="!shownLogs.length" class="log-empty">{{ logs.length ? '当前分类下没有记录' : '暂无操作记录' }}</div></div></div>
      </section>

      <aside class="right-column">
        <div class="game-card panel"><div class="game-cover"><img class="cover-image" :src="`${assetBase}fengsha-steam-cover.jpg?v=20261011`" alt="烽沙游戏封面"/></div><div class="game-status"><span>游戏状态</span><b><i :class="{ online: gameReady }"></i>{{ gameReady ? '已连接到游戏目录' : hasGameRoot ? '目录已识别，检查前置' : '尚未选择游戏目录' }}</b></div><div class="game-status"><span>前置环境</span><b><i :class="{ online: ue4ssReady }"></i>{{ ue4ssReady ? `UE4SS ${ue4ssVersion || ''} · 已就绪` : '未检测到 UE4SS' }}</b><small>前置是加载器，不会出现在下方模组列表里</small></div><div class="path-label">游戏安装目录</div><button class="path-box" @click="chooseGame"><span>{{ pathHint || '点击选择游戏安装目录' }}</span><Folder :size="15"/></button><button v-if="isDesktop" class="scan-steam-button" @click="scanSteamGame"><RefreshCw :size="13"/>扫描 Steam 库自动识别</button><button class="primary-button launch-button" @click="launchGame"><Gamepad2 :size="17"/>启动游戏<ChevronDown :size="15" class="button-tail"/></button><div class="game-facts"><div><span>已安装模组</span><b>{{ mods.filter(m => !m.missing).length }}</b></div><div><span>已启用模组</span><b>{{ enabledCount }}</b></div><div><span>管理方式</span><b>{{ mods.some(m => m.kind === 'pak') ? 'UE4SS + PAK' : 'UE4SS' }}</b></div></div></div>
        <div class="quick-card panel"><div class="quick-title"><span>{{ activeTab === '创作中心' || activeTab === '工坊' ? '工坊状态' : '管理操作' }}</span><span>QUICK ACTIONS</span></div><template v-if="activeTab === '创作中心' || activeTab === '工坊'"><button @click="cloudUser ? startDraft() : openAuth('register')"><Plus/><span>上传新作品</span></button><button @click="refreshWorkshop"><RefreshCw/><span>刷新公开作品</span></button><button @click="openPlatformDonation"><Heart/><span>打赏烽沙工具</span></button><div class="safety-note"><ShieldCheck :size="15"/><span>上传完成后立即公开</span></div></template><template v-else><button @click="installMod"><Plus/><span>从文件夹安装</span></button><button @click="copyModsPath"><FolderOpen/><span>复制 Mods 相对路径</span></button><button @click="settingsOpen = true"><Settings/><span>选择游戏目录</span></button><div class="safety-note"><ShieldCheck :size="15"/><span>每次修改状态前，自动备份 mods.txt</span></div></template></div>
      </aside>
    </main>

    <div v-if="showDraftDialog" class="modal-backdrop" @click.self="showDraftDialog = false"><form class="draft-modal panel" @submit.prevent="editingPublishedModId ? submitUpload() : saveDraft()"><div class="modal-head"><div><span class="section-eyebrow">CREATOR WORKSHOP</span><h2>{{ editingPublishedModId ? '更新云端 MOD' : editingDraftId ? '编辑本地草稿' : '上传 MOD 到工坊' }}</h2></div><button type="button" class="icon-button" @click="showDraftDialog = false"><X :size="18"/></button></div><div class="author-notice"><ShieldCheck :size="16"/><span>作品上传完成后立即公开；ZIP 最大 50 MB，图片支持 JPG、PNG、WebP，单张最大 5 MB。</span></div><div v-if="authError" class="offline-banner compact"><CircleAlert :size="15"/><span>{{ authError }}</span></div><div class="form-grid"><label class="form-field wide"><span>作品名称 *</span><input v-model="draftForm.title" maxlength="80" required placeholder="例如：烽火山河扩展"/></label><label class="form-field"><span>作者</span><input :value="cloudUser?.username || draftForm.author" disabled/></label><label class="form-field"><span>版本 *</span><input v-model="draftForm.version" maxlength="24" required placeholder="1.0.0"/></label><label class="form-field"><span>分类</span><select v-model="draftForm.category"><option>城市建筑</option><option>游戏机制</option><option>界面美化</option><option>地图扩展</option><option>人物事件</option><option>其他</option></select></label><label class="form-field"><span>模组类型 *</span><select v-model="draftForm.modType"><option value="ue4ss">UE4SS 模组（Lua 脚本）</option><option value="pak">PAK 模组（.pak / .ucas / .utoc）</option><option value="runtime">UE4SS 前置包（UE4SS 本体）</option></select><small>选错类型会导致玩家装上后不生效；上传时会按这里校验压缩包结构</small></label><label class="form-field"><span>兼容游戏版本</span><input v-model="draftForm.compatibility" placeholder="如：当前版本 / 未测试"/></label><label class="form-field wide"><span>一句话简介 *</span><input v-model="draftForm.summary" maxlength="180" required placeholder="简要介绍这个 MOD"/></label><label class="form-field wide"><span>详细说明</span><textarea v-model="draftForm.description" rows="3" placeholder="功能、安装方式、已知问题…"/></label><label class="form-field"><span>依赖项</span><input v-model="draftForm.dependencies" placeholder="用逗号分隔，没有可留空"/></label><label class="form-field"><span>标签</span><input v-model="draftForm.tags" placeholder="用逗号分隔"/></label><label class="form-field"><span>更新说明</span><input v-model="draftForm.changelog" placeholder="本版本变更"/></label><label class="form-field"><span>{{ editingPublishedModId ? '替换 ZIP（可选）' : 'MOD ZIP 压缩包 *' }}</span><input type="file" accept=".zip,application/zip" @change="recordPackage"/><small>{{ draftForm.packageName ? `${draftForm.packageName} · ${Math.ceil(draftForm.packageSize / 1024)} KB` : editingPublishedModId ? '不选择则保留当前 ZIP' : '上传实际 ZIP 文件；7z 暂不支持' }}</small></label><label class="form-field"><span>MOD 封面图</span><input type="file" accept="image/jpeg,image/png,image/webp" ref="coverInput" @change="recordCover"/><button v-if="coverFile" type="button" class="text-action image-remove-action" @click="removeCoverSelection">取消选择图片</button><small>{{ draftForm.coverName || '可选，单张最大 5 MB' }}</small></label><label class="form-field"><span>作者打赏码</span><div class="field-note"><Wallet :size="15"/><span>打赏码已移到「用户中心」统一设置：上传一次，你名下所有作品的「打赏作者」都会显示这张图。</span></div><button type="button" class="text-action" @click="showDraftDialog = false; openUserCenter()">去用户中心设置打赏码</button></label><label class="form-field"><span>MOD 效果图</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple ref="screenshotInput" @change="recordScreenshots"/><small>{{ draftForm.screenshotNames.length ? `已选 ${draftForm.screenshotNames.length} 张：${draftForm.screenshotNames.join('、')}` : '可选，最多 5 张，单张最大 5 MB' }}</small></label><div v-if="coverPreview || screenshotPreviews.length" class="image-preview-grid wide">
          <div v-if="coverPreview" class="image-preview-tile"><img :src="coverPreview" alt="Cover preview"/><span>{{ draftForm.coverName }}</span><button type="button" aria-label="移除封面图片" @click="removeCoverSelection"><X :size="14"/></button></div>
          <div v-for="(url,index) in screenshotPreviews" :key="url" class="image-preview-tile"><img :src="url" :alt="`效果图预览 ${index+1}`"/><span>{{ screenshotFiles[index]?.name }}</span><button type="button" :aria-label="`移除第 ${index+1} 张效果图`" @click="removeScreenshotSelection(index)"><X :size="14"/></button></div>
        </div><div class="form-field wide draft-save-note">本机草稿只保存文字资料；重新打开后请重新选择图片与 ZIP。</div></div><div v-if="submitting" class="offline-banner compact busy-banner"><LoaderCircle :size="15" class="spin"/><span>{{ uploadPhase || '正在上传…' }}请勿关闭窗口或重复点击。</span></div><div class="form-actions"><button type="button" class="secondary-button" :disabled="submitting" @click="showDraftDialog = false">取消</button><button v-if="!editingPublishedModId" type="button" class="secondary-button" :disabled="submitting" @click="saveDraft"><FileArchive :size="15"/>保存本机草稿</button><button type="button" class="primary-button" :disabled="submitting" @click="submitUpload"><LoaderCircle v-if="submitting" :size="15" class="spin"/><Upload v-else :size="15"/>{{ submitting ? (uploadPhase || '正在保存…') : editingPublishedModId ? '保存更新' : '立即公开上传' }}</button></div></form></div>

    <div v-if="userCenterOpen" class="modal-backdrop" @click.self="userCenterOpen = false"><section class="user-center panel"><div class="modal-head"><div><span class="section-eyebrow">PLAYER ACCOUNT</span><h2>用户中心</h2></div><button class="icon-button" @click="userCenterOpen = false"><X :size="18"/></button></div><div class="user-identity"><img v-if="avatarPreview || avatarUrl" class="user-avatar-img" :src="avatarPreview || avatarUrl" alt=""/><span v-else class="user-avatar"><CircleUserRound :size="22"/></span><div class="user-identity-copy"><strong>{{ cloudUser?.username }}</strong><span class="user-meta"><Mail :size="12"/>{{ cloudUser?.email }}<template v-if="cloudUser?.created_at"> · 注册于 {{ new Date(cloudUser.created_at).toLocaleDateString('zh-CN') }}</template></span><div class="avatar-actions"><label class="avatar-upload"><input type="file" accept="image/jpeg,image/png,image/webp" ref="avatarInput" @change="recordAvatar"/>{{ avatarUrl ? '更换头像' : '上传头像' }}</label><button v-if="avatarFile" type="button" class="primary-button small-button" :disabled="avatarSaving" @click="saveAvatar"><LoaderCircle v-if="avatarSaving" :size="13" class="spin"/><Upload v-else :size="13"/>{{ avatarSaving ? '保存中…' : '保存头像' }}</button><button v-if="avatarFile" type="button" class="text-action" @click="removeAvatarSelection">取消</button><button v-else-if="avatarUrl" type="button" class="text-action danger" :disabled="avatarSaving" @click="clearAvatar">移除头像</button></div></div></div><div class="user-section"><div class="user-section-head"><Wallet :size="15"/><div><strong>我的打赏码</strong><span>上传一次，你名下所有作品的「打赏作者」都会显示这张图</span></div></div><div class="user-tip-row"><img v-if="profileDonationPreview || profileDonationUrl" class="donation-qr user-qr" :src="profileDonationPreview || profileDonationUrl" :alt="profileDonationPreview ? '打赏码预览' : '我的打赏码'"/><div v-else class="user-qr-empty"><Wallet :size="18"/><span>还没有打赏码</span></div><div class="user-tip-controls"><label class="form-field donation-upload"><span>{{ profileDonationUrl ? '上传新图（会替换当前这张）' : '上传打赏码' }}</span><input type="file" accept="image/jpeg,image/png,image/webp" ref="profileDonationInput" @change="recordProfileDonation"/><small>{{ profileDonationName || '微信 / 支付宝 / 爱发电收款码，JPG·PNG·WebP，最大 5 MB' }}</small></label><div class="user-tip-actions"><button v-if="profileDonationFile" type="button" class="primary-button" :disabled="profileSaving" @click="saveProfileDonation"><LoaderCircle v-if="profileSaving" :size="14" class="spin"/><Upload v-else :size="14"/>{{ profileSaving ? '正在保存…' : '保存打赏码' }}</button><button v-if="profileDonationFile" type="button" class="text-action" @click="removeProfileDonationSelection">取消选择</button><button v-else-if="profileDonationUrl" type="button" class="text-action danger" :disabled="profileSaving" @click="clearProfileDonation">移除打赏码</button></div></div></div><div v-if="profileError" class="offline-banner compact"><CircleAlert :size="15"/><span>{{ profileError }}</span></div><div v-else-if="profileNotice" class="offline-banner compact notice-banner"><Check :size="15"/><span>{{ profileNotice }}</span></div></div><div v-if="cloudUser?.is_admin" class="user-section"><div class="user-section-head"><ShieldCheck :size="15"/><div><strong>平台收款码</strong><span>玩家点「打赏烽沙工具」时显示的收款码，只有管理员能设置</span></div></div><div class="user-tip-row"><img v-if="platformDonationPreview || platformDonationUrl" class="donation-qr user-qr" :src="platformDonationPreview || platformDonationUrl" :alt="platformDonationPreview ? '平台收款码预览' : '平台收款码'"/><div v-else class="user-qr-empty"><ShieldCheck :size="18"/><span>还没有平台收款码</span></div><div class="user-tip-controls"><label class="form-field donation-upload"><span>{{ platformDonationUrl ? '上传新图（会替换当前这张）' : '上传平台收款码' }}</span><input type="file" accept="image/jpeg,image/png,image/webp" ref="platformDonationInput" @change="recordPlatformDonation"/><small>{{ platformDonationName || '微信 / 支付宝 / 爱发电收款码，JPG·PNG·WebP，最大 5 MB' }}</small></label><div class="user-tip-actions"><button v-if="platformDonationUpload" type="button" class="primary-button" :disabled="platformSaving" @click="savePlatformDonation"><LoaderCircle v-if="platformSaving" :size="14" class="spin"/><Upload v-else :size="14"/>{{ platformSaving ? '正在保存…' : '保存平台收款码' }}</button><button v-if="platformDonationUpload" type="button" class="text-action" @click="removePlatformDonationSelection">取消选择</button></div></div></div><div v-if="platformError" class="offline-banner compact"><CircleAlert :size="15"/><span>{{ platformError }}</span></div><div v-else-if="platformNotice" class="offline-banner compact notice-banner"><Check :size="15"/><span>{{ platformNotice }}</span></div></div><div class="user-section user-account-row"><div class="user-section-head"><ShieldCheck :size="15"/><div><strong>账号</strong><span>作品与打赏码都保存在这个账号下</span></div></div><button type="button" class="secondary-button" :disabled="profileSaving" @click="signOut"><LogOut :size="15"/>退出登录</button></div></section></div>

    <div v-if="showAuthDialog" class="modal-backdrop" @click.self="showAuthDialog = false"><form class="auth-modal panel" @submit.prevent="submitAuth"><div class="modal-head"><div><span class="section-eyebrow">FENGSHA WORKSHOP ACCOUNT</span><h2>{{ awaitingSignupCode ? '邮箱验证码' : authMode === 'register' ? '注册工坊账号' : '登录工坊' }}</h2></div><button type="button" class="icon-button" @click="showAuthDialog = false"><X :size="18"/></button></div><p class="auth-description">{{ awaitingSignupCode ? `验证码已发送到 ${authForm.email}，输入后即可完成注册并自动登录。` : 'Supabase 邮箱账号用于管理你上传的作品；浏览和下载无需登录。' }}</p><label v-if="awaitingSignupCode" class="form-field"><span>邮件验证码 *</span><input v-model="authCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" pattern="[0-9]{6,8}" required placeholder="输入邮件中的验证码"/></label><template v-else><label v-if="authMode === 'register'" class="form-field"><span>玩家昵称 *</span><input v-model="authForm.username" minlength="2" maxlength="24" required autocomplete="nickname"/></label><label class="form-field"><span>邮箱 *</span><input v-model="authForm.email" type="email" required autocomplete="email"/></label><label class="form-field"><span>密码 *</span><input v-model="authForm.password" type="password" minlength="10" maxlength="128" required :autocomplete="authMode === 'login' ? 'current-password' : 'new-password'"/><small>至少 10 位。</small></label></template><div v-if="authBusy" class="offline-banner compact busy-banner"><LoaderCircle :size="15" class="spin"/><span>{{ authBusyText || '正在处理…' }}</span></div><div v-else-if="authError" class="offline-banner compact"><CircleAlert :size="15"/><span>{{ authError }}</span></div><div class="form-actions"><button v-if="awaitingSignupCode" type="button" class="text-action" :disabled="authBusy" @click="awaitingSignupCode = false; authCode = ''; authError = ''">返回修改账号信息</button><button v-else type="button" class="text-action" :disabled="authBusy" @click="authMode = authMode === 'login' ? 'register' : 'login'; authError = ''">{{ authMode === 'login' ? '创建新账号' : '已有账号？登录' }}</button><button v-if="awaitingSignupCode" type="button" class="secondary-button" :disabled="resendingCode || authBusy" @click="resendSignupCode"><LoaderCircle v-if="resendingCode" :size="15" class="spin"/>{{ resendingCode ? '正在发送…' : '重新发送验证码' }}</button><button type="submit" class="primary-button" :disabled="authBusy"><LoaderCircle v-if="authBusy" :size="15" class="spin"/><Check v-else :size="15"/>{{ authBusy ? (authBusyText || '处理中…') : awaitingSignupCode ? '验证并登录' : authMode === 'register' ? '注册' : '登录' }}</button></div></form></div>

    <div v-if="platformDonationOpen" class="modal-backdrop" @click.self="platformDonationOpen = false"><section class="donation-modal panel"><div class="modal-head"><div><span class="section-eyebrow">FENGSHA SUPPORT</span><h2>{{ donationTarget === 'author' ? '打赏模组作者' : '打赏烽沙工具' }}</h2></div><button class="icon-button" @click="platformDonationOpen = false"><X :size="18"/></button></div><p class="auth-description">{{ donationTarget === 'author' ? `感谢支持「${selectedWork?.title}」的作者。` : '感谢支持烽沙 MOD 管理器的维护与更新。' }}</p><img v-if="donationTarget === 'author' && authorDonationUrl" class="donation-qr" :src="authorDonationUrl" alt="作者收款码"/><img v-else-if="donationTarget === 'platform' && platformDonationUrl" class="donation-qr" :src="platformDonationUrl" alt="烽沙工具收款码"/><div v-else class="comment-empty">{{ donationTarget === 'author' ? '作者还没有设置收款码。' : '暂未设置工具收款码。' }}</div><p v-if="donationTarget === 'platform' && cloudUser?.is_admin" class="donation-admin-hint"><ShieldCheck :size="14"/>这是展示给所有玩家的收款码，在「用户中心 → 平台收款码」里更换。</p></section></div>
    <div v-if="showUpdateDialog" class="modal-backdrop update-backdrop" @click.self="dismissUpdate"><section class="update-modal panel" role="dialog" aria-modal="true" aria-labelledby="update-title"><div class="update-topline"><span>FENGSHA DESKTOP · SYSTEM MESSAGE</span><button class="icon-button" aria-label="关闭更新公告" :disabled="updatePhase === 'applying'" @click="dismissUpdate"><X :size="17"/></button></div><div class="update-hero"><div class="update-emblem"><img :src="`${assetBase}fengsha-mod-icon.png`" alt="烽沙 MOD 管理器"/></div><div><span class="section-eyebrow">版本更新公告</span><h2 id="update-title">{{ updateInfo?.available ? '管理器发现新版本' : updatePhase === 'error' ? '暂时无法检查更新' : '管理器已是最新版本' }}</h2><p>{{ updateInfo?.available ? `新版本 v${updateInfo.version} 已就绪` : updatePhase === 'error' ? '更新服务暂不可用，可稍后重试。' : '当前版本无需更新。' }}</p></div><span v-if="updateInfo?.available" class="update-version-stamp">v{{ updateInfo.version }}</span></div><div v-if="updateInfo?.available" class="update-note-box"><div class="update-note-title"><ShieldCheck :size="15"/>本次更新内容<span>RELEASE NOTES</span></div><ul><li v-for="(note,index) in updateInfo.releaseNotes" :key="index">{{ note }}</li><li v-if="!updateInfo.releaseNotes.length">性能与稳定性优化</li></ul></div><div v-if="updatePhase === 'downloading' || updatePhase === 'ready'" class="update-progress-area"><div class="update-progress-label"><span>{{ updatePhase === 'ready' ? '更新包校验完成' : '正在下载并校验更新包' }}</span><b>{{ updatePhase === 'ready' ? '100%' : `${updateProgress.total ? Math.min(99, Math.floor(updateProgress.received / updateProgress.total * 100)) : 0}%` }}</b></div><div class="update-progress-track"><i :style="{ width: `${updatePhase === 'ready' ? 100 : updateProgress.total ? Math.min(99, updateProgress.received / updateProgress.total * 100) : 0}%` }"/></div><small>{{ updatePhase === 'ready' ? '文件完整性校验通过，安装时会自动重启。' : `${(updateProgress.received / 1024 / 1024).toFixed(1)} / ${(updateProgress.total / 1024 / 1024).toFixed(1)} MB` }}</small></div><div v-if="updateError" class="update-error" role="alert"><CircleAlert :size="15"/>{{ updateError }}</div><div class="update-footer"><span>当前版本 v{{ updateInfo?.currentVersion || '0.2.1' }}<small>安全校验通过后才会替换程序文件</small></span><div><button class="secondary-button" :disabled="updatePhase === 'applying'" @click="updateInfo?.available ? dismissUpdate() : showUpdateDialog = false">{{ updateInfo?.available ? '稍后提醒' : '关闭' }}</button><button v-if="updateInfo?.available" class="primary-button update-primary" :disabled="['downloading','applying'].includes(updatePhase)" @click="updatePhase === 'ready' ? applyDesktopUpdate() : downloadDesktopUpdate()"><Download v-if="updatePhase !== 'ready'" :size="15"/><RefreshCw v-else :size="15"/>{{ updatePhase === 'downloading' ? '正在下载…' : updatePhase === 'applying' ? '正在安装…' : updatePhase === 'ready' ? '立即重启并安装' : '立即更新' }}</button><button v-else-if="updatePhase === 'error'" class="primary-button update-primary" @click="checkDesktopUpdate(true)"><RefreshCw :size="15"/>重新检查</button></div></div></section></div>

    <div v-if="settingsOpen" class="modal-backdrop" @click.self="settingsOpen = false"><section class="settings-modal panel"><div class="modal-head"><div><span class="section-eyebrow">GAME SETTINGS</span><h2>游戏目录设置</h2></div><button class="icon-button" @click="settingsOpen = false"><X :size="18"/></button></div><p>选择《烽沙》游戏安装目录。桌面版会扫描 UE4SS 的 <code>mods.txt</code>，以及 <code>Content/Paks/LogicMods</code> 和 <code>Content/Paks/~mods</code>。</p><div class="selected-path"><FolderOpen :size="17"/><span>{{ pathHint || '尚未选择目录' }}</span></div><div class="settings-game-actions"><button v-if="isDesktop" class="secondary-button" @click="scanSteamGame">扫描 Steam 库</button><button class="primary-button" @click="chooseGame">手动选择文件夹<ChevronRight :size="16"/></button></div><button v-if="isDesktop" class="secondary-button check-update-button" @click="checkDesktopUpdate(true)"><RefreshCw :size="14"/>检查管理器更新</button><label class="setting-toggle"><input type="checkbox" :checked="autoInstall" @change="setAutoInstall($event.target.checked)"/><span><b>下载后自动安装到游戏目录</b><small>开启后，在工坊点「下载 ZIP」会直接装进游戏并自动刷新本地列表；关闭则只下载 ZIP 文件。仅桌面版有效。</small></span></label><small>桌面版按 Steam 库文件清单自动识别 AppID 1733690；也可手动选游戏根目录。浏览器版仅支持 UE4SS 本地管理。</small></section></div>

    <transition name="toast"><div v-if="toast" class="toast" :class="toast.tone" role="status" aria-live="polite"><Check v-if="toast.tone !== 'error'" :size="15"/><CircleAlert v-else :size="15"/><span>{{ toast.message }}</span></div></transition>

    <div v-if="installProgress" class="install-progress" role="status" aria-live="polite"><LoaderCircle :size="16" class="spin"/><div class="install-progress-body"><b>{{ installProgress.phase === 'done' ? '安装完成' : installProgress.phase === 'downloading' ? '正在下载' : installProgress.phase === 'extracting' ? '正在解压' : installProgress.phase === 'inspecting' ? '正在识别模组类型' : '正在安装' }}「{{ installProgress.title }}」</b><div class="install-progress-track"><i :style="{ width: `${installProgress.phase === 'done' ? 100 : installProgress.percent || 0}%` }"/></div></div></div>
  </div>
</template>
