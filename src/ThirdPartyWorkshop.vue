<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { AlertCircle, ArrowDownToLine, ExternalLink, FileQuestion, FolderOpen, ImageOff, LoaderCircle, RefreshCw, Search, ShieldAlert } from 'lucide-vue-next'

const query = ref('')
const source = ref('全部来源')
const items = ref([])
const sourceStatus = ref('')
const unavailableSources = ref([])
const sourceErrors = ref([])
const loading = ref(false)
const error = ref('')
const expanded = ref('')
const downloading = ref('')
const downloadProgress = ref({ received: 0, total: 0, percent: 0 })
const downloaded = ref({})
let stopProgress = () => {}
let searchTimer = 0

const sources = ['全部来源', '3DM', 'Nexus Mods', '游侠网']
const visibleItems = computed(() => source.value === '全部来源' ? items.value : items.value.filter(item => item.source === source.value))
const sourceUnavailable = computed(() => unavailableSources.value.find(item => item.name === source.value))
const visibleSourceErrors = computed(() => source.value === '全部来源' ? sourceErrors.value : sourceErrors.value.filter(item => item.name === source.value))

async function refresh() {
  if (!window.fengshaDesktop?.searchThirdPartyMods) {
    sourceStatus.value = '第三方来源检索与下载仅在桌面版内提供。'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const result = await window.fengshaDesktop.searchThirdPartyMods(query.value.trim())
    items.value = result.items || []
    sourceStatus.value = result.sourceStatus || ''
    unavailableSources.value = result.unavailableSources || []
    sourceErrors.value = result.sourceErrors || []
  } catch (cause) {
    error.value = cause?.message || '读取第三方来源失败。'
    items.value = []
    sourceErrors.value = []
  } finally {
    loading.value = false
  }
}

function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(refresh, 350)
}

async function download(item) {
  if (!item.downloadUrl || downloading.value) return
  downloading.value = item.id
  downloadProgress.value = { received: 0, total: 0, percent: 0 }
  try {
    const result = await window.fengshaDesktop.downloadThirdPartyMod(item)
    downloaded.value = { ...downloaded.value, [item.id]: result }
  } catch (cause) {
    error.value = cause?.message || '下载失败。'
  } finally {
    downloading.value = ''
  }
}

async function openDownloaded(item) {
  const result = downloaded.value[item.id]
  if (result?.path) await window.fengshaDesktop.openPath(result.path)
}

function openSourcePage(item) {
  if (item.source !== 'Nexus Mods' || !item.pageUrl) return
  return window.fengshaDesktop?.openExternal?.(item.pageUrl)
}

onMounted(() => {
  stopProgress = window.fengshaDesktop?.onThirdPartyDownloadProgress?.(progress => { downloadProgress.value = progress }) || (() => {})
  refresh()
})
onUnmounted(() => { stopProgress(); clearTimeout(searchTimer) })
</script>

<template>
  <section class="third-party-panel panel">
    <header class="third-party-heading">
      <div><span class="section-eyebrow">EXTERNAL MOD SOURCES</span><h1>第三方模组来源</h1><p>聚合公开页面信息；支持的文件直接下载到管理器目录，全程不打开来源网站。</p></div>
      <button class="secondary-button" :disabled="loading" @click="refresh"><LoaderCircle v-if="loading" :size="15" class="spin"/><RefreshCw v-else :size="15"/>刷新来源</button>
    </header>

    <div class="third-party-search">
      <label class="searchbox"><Search :size="17"/><input v-model="query" placeholder="搜索烽沙资源…" @input="onSearchInput" @keydown.enter="refresh"/></label>
      <div class="third-party-sources" role="group" aria-label="选择资源来源">
        <button v-for="name in sources" :key="name" :class="{ active: source === name }" :aria-pressed="source === name" @click="source = name">{{ name }}</button>
      </div>
    </div>

    <div class="third-party-notice"><ShieldAlert :size="17"/><span>外站资料由来源页面提供。下载的文件保存在本机「烽沙 MOD 管理器 / third-party-downloads」目录；可执行文件只保存，不会被管理器运行或自动安装。</span></div>
    <div v-if="error" class="third-party-error" role="alert"><AlertCircle :size="16"/>{{ error }}</div>
    <div v-if="sourceStatus && (source === '全部来源' || source === '3DM')" class="third-party-status"><AlertCircle :size="15"/>{{ sourceStatus }}</div>
    <div v-for="item in visibleSourceErrors" :key="item.name" class="third-party-status"><AlertCircle :size="15"/>{{ item.name }}：{{ item.message }}</div>

    <div v-if="sourceUnavailable" class="source-unavailable">
      <FileQuestion :size="24"/><b>{{ sourceUnavailable.name }}目前无法提供应用内下载</b><p>{{ sourceUnavailable.reason }}</p>
      <span>本工坊不会将介绍页伪装成可下载 MOD，也不会把你带到外部网站。</span>
    </div>

    <div v-else-if="loading && !visibleItems.length" class="third-party-list third-party-skeleton-grid" aria-label="正在读取模组" aria-busy="true">
      <article v-for="slot in 6" :key="slot" class="third-party-card third-party-skeleton-card" aria-hidden="true">
        <div class="third-party-skeleton-cover"></div>
        <div class="third-party-skeleton-copy"><i></i><i></i><i></i></div>
      </article>
      <p class="third-party-loading-note"><LoaderCircle :size="15" class="spin"/>正在汇总 3DM、Nexus Mods 和游侠网的公开条目…</p>
    </div>
    <div v-else-if="visibleItems.length" class="third-party-list">
      <article v-for="item in visibleItems" :key="item.id" class="third-party-card" :class="{ expanded: expanded === item.id }">
        <button class="third-party-card-main" :aria-expanded="expanded === item.id" @click="expanded = expanded === item.id ? '' : item.id">
          <div class="third-party-cover"><img v-if="item.image" :src="item.image" :alt="`${item.title} 预览图`" loading="lazy"/><ImageOff v-else :size="23"/></div>
          <div class="third-party-copy"><div class="third-party-card-title"><b>{{ item.title }}</b><span class="source-tag">{{ item.source }}</span></div><p>{{ item.summary || '暂无简介' }}</p><div class="third-party-meta"><span v-if="item.date">更新于 {{ item.date }}</span><span v-if="item.size">{{ item.size }}</span><span v-if="item.author">作者：{{ item.author }}</span></div></div>
          <span class="third-party-chevron">{{ expanded === item.id ? '收起' : '详情' }}</span>
        </button>
        <div v-if="expanded === item.id" class="third-party-detail">
          <img v-if="item.image" :src="item.image" :alt="`${item.title} 预览图`" loading="lazy"/>
          <div><h2>资源介绍</h2><p>{{ item.description || item.summary || '来源没有提供详细说明。' }}</p><p class="third-party-source-note">来源：{{ item.source }} · {{ item.size || '大小未标注' }}。<template v-if="item.source === '3DM'">{{ item.fileName?.toLowerCase().endsWith('.exe') ? '此条目是修改器程序，不属于 UE4SS / PAK 游戏 MOD。' : '下载文件将以原始文件保存，管理器不会自动运行或安装外站文件。' }}</template><template v-else-if="item.source === 'Nexus Mods'">Nexus 当前收录 {{ item.files?.length || 0 }} 个文件版本；下载资格由作者与 Nexus API 控制。</template><template v-else>游侠补丁站条目详情。</template></p>
            <div v-if="item.source === 'Nexus Mods' && item.files?.length" class="nexus-files"><b>文件版本</b><div v-for="file in item.files" :key="file.fileId" class="nexus-file-row"><span><strong>{{ file.name }}</strong><small>{{ file.category }} · v{{ file.version || '未标注' }} · {{ file.sizeLabel || '大小未知' }}</small></span><span class="nexus-file-state">{{ file.primary ? '主文件' : '旧版本' }}</span></div></div>
            <div v-if="downloaded[item.id]" class="third-party-download-done"><span>已保存：{{ downloaded[item.id].fileName }}</span><button class="secondary-button" @click="openDownloaded(item)"><FolderOpen :size="14"/>查看文件</button></div>
            <div v-else-if="downloading === item.id" class="third-party-progress"><div><span>正在下载</span><b>{{ downloadProgress.total ? `${downloadProgress.percent}%` : `${(downloadProgress.received / 1024 / 1024).toFixed(1)} MB` }}</b></div><progress :value="downloadProgress.total ? downloadProgress.received : undefined" :max="downloadProgress.total || undefined"/></div>
            <div v-else-if="item.downloadUrl"><button class="primary-button" :disabled="Boolean(downloading)" @click="download(item)"><ArrowDownToLine :size="15"/>在管理器内下载文件</button><p v-if="item.fileName?.toLowerCase().endsWith('.exe')" class="third-party-download-note"><ShieldAlert :size="13"/>这是可执行程序。下载后请自行判断和运行；管理器不会启动它。</p></div>
            <div v-else class="third-party-download-unavailable">
              <p class="third-party-unavailable"><AlertCircle :size="14"/>{{ item.downloadReason }}</p>
              <button v-if="item.source === 'Nexus Mods' && item.pageUrl" class="secondary-button" @click="openSourcePage(item)"><ExternalLink :size="14"/>打开 Nexus 模组主页</button>
            </div>
          </div>
        </div>
      </article>
    </div>
    <div v-else class="third-party-empty"><FileQuestion :size="22"/><b>{{ error ? '来源暂不可用' : query.trim() ? `没有找到「${query.trim()}」相关资源` : `${source === '全部来源' ? '暂未找到' : source + ' 暂未找到'}相关资源` }}</b><span>搜索会查询 3DM 补丁目录、Nexus Mods 公共 API 和游侠补丁站站内搜索；具体下载能力按来源页面提供的链接判断。</span></div>

    <footer class="third-party-footer"><ExternalLink :size="14"/><span>来源展示仅在应用内读取公开标题、图片、简介和文件地址。暂时无法直连的来源会说明原因，不会跳转网站。</span></footer>
  </section>
</template>

<style scoped>
.third-party-panel{height:calc(100vh - 118px);min-height:520px;display:flex;flex-direction:column;gap:14px;padding:18px;overflow:hidden;scrollbar-width:thin;scrollbar-color:#363a3e transparent}
.third-party-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}
.third-party-heading h1{margin:5px 0 3px;color:#eee8df;font-size:22px}
.third-party-heading p{margin:0;color:#96999c;font-size:11px;line-height:1.6}
.third-party-heading>.secondary-button{flex:none;height:36px;padding:0 11px;font-size:10px}
.third-party-search{display:flex;align-items:center;gap:12px}
.third-party-search .searchbox{flex:1;max-width:none}
.third-party-sources{display:flex;gap:4px;flex:none}
.third-party-sources button{height:34px;padding:0 10px;border:1px solid #35393d;border-radius:4px;background:#15191d;color:#aeb1b2;font-size:10px;white-space:nowrap}
.third-party-sources button:hover,.third-party-sources button.active{border-color:#765247;background:#2a201d;color:#ead5bd}
.third-party-notice,.third-party-status,.third-party-error{display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid #55482d;border-radius:5px;background:#201d15;color:#d7c18e;font-size:10px;line-height:1.6}
.third-party-notice svg,.third-party-status svg,.third-party-error svg{flex:none}
.third-party-error{border-color:#694047;background:#251719;color:#e4aaa9}
.third-party-list{flex:1;min-height:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));grid-auto-rows:max-content;align-content:start;gap:12px;overflow:auto;padding:1px 3px 8px}
.third-party-card{min-width:0;min-height:260px;align-self:start;border:1px solid #30363a;border-radius:6px;background:linear-gradient(180deg,#171d21,#101518);overflow:hidden;transition:border-color .16s,transform .16s}
.third-party-card:hover{border-color:#74613b;transform:translateY(-2px)}
.third-party-card.expanded{border-color:#6f4b3f}
.third-party-card-main{width:100%;min-height:258px;display:flex;flex-direction:column;align-items:stretch;gap:0;padding:0;border:0;background:transparent;text-align:left;color:inherit;cursor:pointer}
.third-party-cover{width:100%;aspect-ratio:16/9;flex:none;display:grid;place-items:center;overflow:hidden;border:0;border-bottom:1px solid #34383a;border-radius:0;background:linear-gradient(135deg,#2e2c25,#111518);color:#747976}
.third-party-cover img{width:100%;height:100%;object-fit:cover}
.third-party-copy{min-width:0;flex:1;padding:11px 12px 12px}
.third-party-card-title{display:flex;align-items:center;gap:8px;min-width:0}
.third-party-card-title b{overflow:hidden;color:#e6dfd3;font-size:12px;line-height:1.5;text-overflow:ellipsis;white-space:nowrap}
.source-tag{flex:none;border:1px solid #52503b;border-radius:3px;padding:2px 5px;color:#d2c278;font-size:8px}
.third-party-copy p{margin:6px 0;color:#a5a7a7;font-size:10px;line-height:1.55;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.third-party-meta{display:flex;flex-wrap:wrap;gap:5px 12px;color:#82898b;font-size:9px}
.third-party-chevron{display:flex;justify-content:flex-end;flex:none;padding:0 12px 10px;color:#a9997f;font-size:9px}
.third-party-skeleton-grid{position:relative;min-height:260px}
.third-party-skeleton-card{min-height:205px;padding:0;animation:skeleton-pulse 1.4s ease-in-out infinite alternate}
.third-party-skeleton-cover{aspect-ratio:16/9;background:linear-gradient(110deg,#1a2023 8%,#252c30 18%,#1a2023 33%);background-size:200% 100%;animation:skeleton-shimmer 1.5s linear infinite}
.third-party-skeleton-copy{display:grid;gap:9px;padding:12px}
.third-party-skeleton-copy i{height:8px;border-radius:5px;background:#252c30}
.third-party-skeleton-copy i:first-child{width:78%;height:11px;background:#30373a}
.third-party-skeleton-copy i:last-child{width:55%}
.third-party-loading-note{grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:8px;margin:0;padding:5px;color:#a7a49c;font-size:10px}
@keyframes skeleton-shimmer{to{background-position-x:-200%}}
@keyframes skeleton-pulse{to{border-color:#4b4332}}
.third-party-detail{display:grid;grid-template-columns:minmax(150px,240px) 1fr;gap:15px;border-top:1px solid #2d3235;padding:14px;background:#101417}
.third-party-detail>img{display:block;width:100%;max-height:160px;object-fit:cover;border:1px solid #353a3c;border-radius:4px;background:#090b0c}
.third-party-detail h2{margin:0 0 6px;color:#d9c49e;font-size:11px}
.third-party-detail p{margin:0 0 10px;color:#b0b2b0;font-size:10px;line-height:1.7;overflow-wrap:anywhere}
.third-party-detail .third-party-source-note,.third-party-detail .third-party-download-note{color:#8d9292;font-size:9px}
.nexus-files{margin:10px 0 12px;border:1px solid #30383c;border-radius:5px;background:#141a1e;overflow:hidden}
.nexus-files>b{display:block;padding:7px 9px;border-bottom:1px solid #2d3438;color:#d4c49f;font-size:9px}
.nexus-file-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;border-bottom:1px solid #252d31}
.nexus-file-row:last-child{border-bottom:0}
.nexus-file-row>span:first-child{min-width:0;display:flex;flex-direction:column;gap:4px}
.nexus-file-row strong{overflow:hidden;color:#c9cecb;font-size:9px;text-overflow:ellipsis;white-space:nowrap}
.nexus-file-row small{color:#848e90;font-size:8px}
.nexus-file-state{flex:none;color:#bca56e;font-size:8px}
.third-party-download-note{display:flex;align-items:center;gap:5px;margin:7px 0 0!important}
.third-party-detail .primary-button{height:36px;width:max-content;padding:0 12px;font-size:10px}
.third-party-unavailable{display:flex;align-items:center;gap:7px;color:#ddad8e!important}
.third-party-download-unavailable{display:grid;justify-items:start;gap:9px}
.third-party-download-done{display:flex;align-items:center;gap:10px;color:#9dc5a7;font-size:10px}
.third-party-download-done .secondary-button{height:32px;padding:0 9px;font-size:9px}
.third-party-progress{max-width:380px;color:#bdb5a4;font-size:10px}
.third-party-progress>div{display:flex;justify-content:space-between;margin-bottom:5px}
.third-party-progress b{color:#e9d15c}
.third-party-progress progress{width:100%;height:5px;accent-color:#e9cf2e}
.source-unavailable,.third-party-empty{min-height:210px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;border:1px dashed #3a3d3d;border-radius:6px;background:#111518;text-align:center;color:#9ba0a0;padding:24px}
.source-unavailable>svg,.third-party-empty>svg{color:#c5a866}
.source-unavailable b,.third-party-empty b{color:#e2ded5;font-size:12px}
.source-unavailable p{max-width:680px;margin:0;color:#b2b1ab;font-size:10px;line-height:1.7}
.source-unavailable span,.third-party-empty span{max-width:640px;color:#858b8c;font-size:9px;line-height:1.6}
.third-party-footer{display:flex;align-items:center;gap:7px;margin-top:auto;padding-top:9px;border-top:1px solid #292f32;color:#848a8b;font-size:9px;line-height:1.5}
.third-party-footer svg{flex:none;color:#aa9168}
@media(max-width:720px){.third-party-panel{padding:12px}.third-party-heading{align-items:flex-start}.third-party-heading h1{font-size:18px}.third-party-search{align-items:stretch;flex-direction:column}.third-party-sources{overflow:auto}.third-party-list{grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:9px}.third-party-detail{grid-template-columns:1fr}.third-party-detail>img{max-height:180px}}
@media(prefers-reduced-motion:reduce){.third-party-card,.third-party-skeleton-card,.third-party-skeleton-cover{animation:none;transition:none}}
</style>
