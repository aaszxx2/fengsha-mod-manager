<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { ArrowLeft, Check, Clipboard, Grid2X2, Heart, ImagePlus, LoaderCircle, Lock, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-vue-next'

const props = defineProps({ client: Object, user: Object, bucket: String, uploadRequest: Number, view: { type: String, default: 'all' } })
const emit = defineEmits(['auth', 'view', 'upload-handled'])
const works = ref([]), loading = ref(false), error = ref(''), notice = ref('')
const query = ref(''), category = ref('全部'), sort = ref('最新发布'), selected = ref(null)
const code = ref(''), liked = ref(false), busy = ref(false), codeLoading = ref(false), zoom = ref(false)
const showUpload = ref(false), saving = ref(false), phase = ref(''), formError = ref('')
const form = ref(blank()), file = ref(null), preview = ref(''), editingId = ref(null)
const categories = ['住宅庭院', '城池要塞', '生产工坊', '景观装饰', '其他建筑']
let listRequest = 0, detailRequest = 0
function blank() { return { title: '', description: '', category: '住宅庭院', code: '' } }
const filtered = computed(() => works.value.filter(w => (props.view !== 'mine' || w.owner_id === props.user?.id) && (category.value === '全部' || w.category === category.value) && `${w.title} ${w.author} ${w.description}`.toLowerCase().includes(query.value.trim().toLowerCase())).sort((a, b) => sort.value === '最多点赞' ? b.likes - a.likes || new Date(b.created_at) - new Date(a.created_at) : new Date(b.created_at) - new Date(a.created_at)))
function explain(e) { return /42P01|PGRST20[025]|schema cache/.test(`${e.code} ${e.message}`) ? '蓝图工坊尚未完成云端初始化，请联系工具维护者。' : e.message || '操作失败，请稍后重试。' }
async function refresh() {
  const request = ++listRequest
  if (!props.client) return
  loading.value = true; error.value = ''
  try {
    const result = await props.client.from('blueprint_works').select('id,owner_id,title,description,author,category,cover_path,created_at,blueprint_likes(count)').order('created_at', { ascending: false }).limit(200)
    if (result.error) throw result.error
    const rows = result.data || []
    const paths = rows.map(w => w.cover_path)
    const images = paths.length ? await props.client.storage.from(props.bucket).createSignedUrls(paths, 3600) : { data: [] }
    if (images.error) throw images.error
    const urls = new Map((images.data || []).map(i => [i.path, i.signedUrl]))
    if (request !== listRequest) return
    works.value = rows.map(w => ({ ...w, image: urls.get(w.cover_path), likes: w.blueprint_likes?.[0]?.count || 0 }))
    if (selected.value) selected.value = works.value.find(w => w.id === selected.value.id) || null
  } catch (e) { if (request === listRequest) error.value = explain(e) }
  finally { if (request === listRequest) loading.value = false }
}
async function readAccess() {
  const request = ++detailRequest, work = selected.value, user = props.user
  code.value = ''; liked.value = false; codeLoading.value = false
  if (!work || !user || !props.client) return
  codeLoading.value = true
  try {
    const reaction = await props.client.from('blueprint_likes').select('user_id').eq('blueprint_id', work.id).eq('user_id', user.id).maybeSingle()
    if (reaction.error) throw reaction.error
    if (request !== detailRequest) return
    liked.value = !!reaction.data
    if (reaction.data || work.owner_id === user.id) {
      const result = await props.client.from('blueprint_codes').select('code').eq('blueprint_id', work.id).maybeSingle()
      if (result.error) throw result.error
      if (request === detailRequest) code.value = result.data?.code || ''
    }
  } catch (e) { if (request === detailRequest) error.value = explain(e) }
  finally { if (request === detailRequest) codeLoading.value = false }
}
function open(work) { selected.value = work; error.value = ''; notice.value = ''; readAccess() }
function back() { ++detailRequest; selected.value = null; code.value = ''; notice.value = ''; error.value = '' }
async function likeAndUnlock() {
  if (!props.user) { emit('auth'); return }
  if (busy.value || !selected.value) return
  busy.value = true; error.value = ''
  const id = selected.value.id
  try {
    const result = await props.client.from('blueprint_likes').insert({ blueprint_id: id, user_id: props.user.id })
    if (result.error && result.error.code !== '23505') throw result.error
    if (selected.value?.id === id) await readAccess()
    await refresh()
  } catch (e) { error.value = explain(e) }
  finally { busy.value = false }
}
async function copyCode() {
  try { await navigator.clipboard.writeText(code.value); notice.value = '蓝图代码已复制，回到游戏的蓝图导入界面粘贴即可。' }
  catch { notice.value = '自动复制未成功，请在代码框中全选并复制。' }
}
function resetImage() { if (preview.value) URL.revokeObjectURL(preview.value); preview.value = ''; file.value = null }
function openUpload() { resetImage(); editingId.value = null; form.value = blank(); formError.value = ''; showUpload.value = true }
async function edit() {
  if (!code.value) { await readAccess(); if (!code.value) return }
  resetImage(); editingId.value = selected.value.id
  form.value = { title: selected.value.title, description: selected.value.description, category: selected.value.category, code: code.value }
  formError.value = ''; showUpload.value = true
}
function pickImage(event) {
  const next = event.target.files?.[0]
  event.target.value = ''
  if (!next) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type) || next.size > 5 * 1024 * 1024) { formError.value = '请选择 5 MB 以内的 JPG、PNG 或 WebP 图片。'; return }
  resetImage(); file.value = next; preview.value = URL.createObjectURL(next); formError.value = ''
}
function closeUpload() { if (!saving.value) { showUpload.value = false; form.value.code = ''; resetImage() } }
async function publish() {
  if (saving.value) return
  if (!props.user) { emit('auth'); return }
  if (!props.client) { formError.value = '云端尚未连接，请稍后重试。'; return }
  if (!form.value.title.trim() || !form.value.code.trim() || (!file.value && !editingId.value)) { formError.value = '请填写作品名称、粘贴蓝图代码，并上传一张建筑预览图。'; return }
  if (new TextEncoder().encode(form.value.code).length > 2 * 1024 * 1024) { formError.value = '蓝图代码最大支持 2 MB。'; return }
  saving.value = true; formError.value = ''
  const id = editingId.value || crypto.randomUUID(), owner = props.user.id
  const previous = works.value.find(w => w.id === id)
  let uploaded = '', saved = false
  try {
    let cover = previous?.cover_path
    if (file.value) {
      phase.value = '正在上传预览图…'
      uploaded = `${owner}/blueprints/${id}/${crypto.randomUUID()}.${({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[file.value.type]}`
      const image = await props.client.storage.from(props.bucket).upload(uploaded, file.value, { contentType: file.value.type, upsert: false })
      if (image.error) throw image.error
      cover = uploaded
    }
    phase.value = '正在保存蓝图…'
    const result = await props.client.rpc('save_fengsha_blueprint', { p_id: id, p_title: form.value.title.trim(), p_description: form.value.description.trim(), p_category: form.value.category, p_cover: cover, p_code: form.value.code })
    if (result.error) throw result.error
    saved = true
    if (uploaded && previous?.cover_path) await props.client.storage.from(props.bucket).remove([previous.cover_path])
    showUpload.value = false; form.value.code = ''; resetImage()
    await refresh()
    const published = works.value.find(w => w.id === id)
    if (published) open(published)
    notice.value = editingId.value ? '蓝图作品已更新。' : '蓝图作品已公开，其他玩家点赞后即可获取代码。'
  } catch (e) {
    if (uploaded && !saved) await props.client.storage.from(props.bucket).remove([uploaded]).catch(() => {})
    formError.value = explain(e)
  } finally { saving.value = false; phase.value = '' }
}
async function removeWork() {
  const work = selected.value
  if (!work || busy.value || !window.confirm(`确定删除蓝图「${work.title}」？`)) return
  busy.value = true; error.value = ''
  try {
    const result = await props.client.from('blueprint_works').delete().eq('id', work.id).eq('owner_id', props.user.id).select('id').single()
    if (result.error) throw result.error
    const cleanup = await props.client.storage.from(props.bucket).remove([work.cover_path])
    back(); await refresh()
    notice.value = cleanup.error ? '蓝图已删除，预览图清理未完成。' : '蓝图已删除。'
  } catch (e) { error.value = explain(e) } finally { busy.value = false }
}
watch(() => props.client, refresh, { immediate: true })
watch(() => props.user?.id, (id, previous) => { readAccess(); if (previous && id !== previous) closeUpload() })
watch(() => props.view, back)
watch(() => props.uploadRequest, value => { if (value) { openUpload(); emit('upload-handled') } }, { immediate: true })
defineExpose({ refresh })
const refreshTimer = setInterval(refresh, 50 * 60 * 1000)
onUnmounted(() => { ++listRequest; ++detailRequest; resetImage(); clearInterval(refreshTimer) })
</script>

<template>
  <section class="blueprint-panel panel">
    <header class="bp-heading"><div><span class="section-eyebrow">FENGSHA · BLUEPRINT GALLERY</span><h1>蓝图工坊<span>让好建筑，被更多人看见</span></h1><p>分享你的建筑灵感。喜欢一座建筑，点个赞，把它带回你的世界。</p></div><button class="primary-button" @click="openUpload"><Plus :size="17"/>分享蓝图</button></header>
    <div class="bp-steps"><span><b>01</b> 发现心仪建筑</span><i>→</i><span><b>02</b> 点赞解锁代码</span><i>→</i><span><b>03</b> 复制到游戏导入</span></div>
    <div v-if="error" class="offline-banner compact" role="alert">{{ error }}<button class="text-action" @click="refresh">重试</button></div>
    <p v-if="notice" class="bp-notice" role="status"><Check :size="15"/>{{ notice }}</p>
    <div v-if="!client" class="offline-banner compact">正在连接云端工坊；若长时间未连接，请检查网络后重新打开工具。</div>
    <template v-if="!selected">
      <div class="bp-toolbar"><div class="bp-tabs"><button :class="{ chosen: view !== 'mine' }" @click="emit('view', 'all')">发现蓝图</button><button :class="{ chosen: view === 'mine' }" @click="emit('view', 'mine')">我的蓝图</button></div><button class="icon-button" aria-label="刷新蓝图" :disabled="loading" @click="refresh"><RefreshCw :size="16" :class="{ spin: loading }"/></button></div>
      <div class="bp-filters"><label class="searchbox"><Search :size="16"/><input v-model="query" placeholder="搜索建筑、作者或灵感…" aria-label="搜索蓝图"/></label><select v-model="category" aria-label="蓝图分类"><option>全部</option><option v-for="item in categories" :key="item">{{ item }}</option></select><select v-model="sort" aria-label="蓝图排序"><option>最新发布</option><option>最多点赞</option></select></div>
      <div v-if="loading && !works.length" class="bp-empty"><LoaderCircle class="spin"/><strong>正在寻找建筑灵感…</strong></div>
      <div v-else-if="view === 'mine' && !user" class="bp-empty"><Lock :size="30"/><strong>登录后查看你的蓝图</strong><button class="primary-button" @click="emit('auth')">登录工坊</button></div>
      <div v-else-if="!filtered.length" class="bp-empty"><Grid2X2 :size="36"/><strong>{{ query || category !== '全部' ? '暂时没有匹配的建筑' : view === 'mine' ? '把你的第一座建筑带到工坊' : '蓝图工坊，等你来建造' }}</strong><p>上传建筑预览图和游戏导出的蓝图代码，与其他玩家分享你的创造。</p><button class="primary-button" @click="openUpload"><Plus :size="16"/>发布蓝图作品</button></div>
      <div v-else class="bp-grid"><button v-for="work in filtered" :key="work.id" class="bp-card" @click="open(work)"><div class="bp-card-image"><img v-if="work.image" :src="work.image" :alt="work.title" loading="lazy"/><span v-else>预览图暂不可用</span><span class="bp-category">{{ work.category }}</span><span class="bp-image-hint">查看建筑与代码 ↗</span></div><div class="bp-card-copy"><h2>{{ work.title }}</h2><p>{{ work.description || '作者分享了一座建筑，来看看吧。' }}</p><div class="bp-card-foot"><span>{{ work.author }}</span><span><Heart :size="13"/>{{ work.likes }}</span></div></div></button></div>
    </template>
    <div v-else class="bp-detail"><button class="text-action" @click="back"><ArrowLeft :size="15"/>返回蓝图列表</button><button class="bp-detail-image" @click="zoom = true" aria-label="放大建筑预览图"><img v-if="selected.image" :src="selected.image" :alt="selected.title"/><span>点击查看大图</span></button><div class="bp-detail-title"><div><span class="bp-tag">{{ selected.category }}</span><h2>{{ selected.title }}</h2><p>{{ selected.author }} · {{ new Date(selected.created_at).toLocaleDateString('zh-CN') }} · {{ selected.likes }} 人点赞</p></div><div v-if="selected.owner_id === user?.id" class="bp-owner-actions"><button class="secondary-button" :disabled="busy || codeLoading" @click="edit"><Pencil :size="14"/>编辑</button><button class="icon-button" :disabled="busy" aria-label="删除蓝图" @click="removeWork"><Trash2 :size="16"/></button></div></div><p class="bp-description">{{ selected.description || '作者暂未添加建筑说明。' }}</p>
      <section class="bp-code-panel"><header><div><span class="section-eyebrow">BLUEPRINT CODE</span><h3>蓝图代码</h3></div><span class="bp-tag"><component :is="code ? Check : Lock" :size="12"/>{{ code ? '已解锁' : '点赞后可见' }}</span></header><div v-if="codeLoading" class="bp-unlock"><LoaderCircle class="spin"/>正在读取蓝图代码…</div><template v-else-if="code"><textarea :value="code" readonly rows="6" spellcheck="false" aria-label="已解锁的蓝图代码"/><div class="bp-code-actions"><small>复制完整代码，在游戏蓝图导入界面粘贴。</small><button class="primary-button" @click="copyCode"><Clipboard :size="16"/>复制蓝图代码</button></div></template><div v-else class="bp-unlock"><Lock :size="27"/><h3>{{ liked ? '你已点赞，代码暂未加载' : '给作者一个赞，把建筑带回家' }}</h3><p>{{ liked ? '请重试读取蓝图代码。' : '点赞是对创作的支持。登录并点赞后，即可查看和复制完整代码。' }}</p><button class="primary-button" :disabled="busy" @click="liked ? readAccess() : likeAndUnlock()"><LoaderCircle v-if="busy" :size="16" class="spin"/><Heart v-else :size="16"/>{{ liked ? '重新读取代码' : user ? '点赞并解锁代码' : '登录后点赞解锁' }}</button></div></section>
    </div>
    <Teleport to="body"><div v-if="showUpload" class="modal-backdrop bp-upload-backdrop" @click.self="closeUpload"><form class="panel bp-upload" role="dialog" aria-modal="true" aria-labelledby="bp-upload-title" @submit.prevent="publish"><div class="modal-head"><div><span class="section-eyebrow">SHARE YOUR CREATION · 蓝图作品</span><h2 id="bp-upload-title">{{ editingId ? '编辑蓝图作品' : '分享一座好建筑' }}</h2></div><button type="button" class="icon-button" :disabled="saving" aria-label="关闭" @click="closeUpload"><X :size="18"/></button></div><p class="bp-upload-intro">一张建筑预览图，一份蓝图代码，让其他玩家也能拥有你的设计。</p><fieldset :disabled="saving"><div class="bp-upload-layout"><div><div class="form-field"><span>建筑预览图 *</span><label class="bp-image-upload"><img v-if="preview || (editingId && selected?.image)" :src="preview || selected.image" alt="蓝图预览"/><span><ImagePlus :size="25"/>{{ preview ? '更换预览图' : editingId ? '保留当前图片或点击更换' : '选择建筑截图' }}<small>JPG / PNG / WebP · 最大 5 MB</small></span><input type="file" accept="image/jpeg,image/png,image/webp" aria-label="上传建筑预览图" @change="pickImage"/></label></div><label class="form-field"><span>作品名称 *</span><input v-model="form.title" required maxlength="80" placeholder="为你的建筑起个名字"/></label><label class="form-field"><span>建筑分类</span><select v-model="form.category"><option v-for="item in categories" :key="item">{{ item }}</option></select></label></div><div><label class="form-field bp-code-field"><span>蓝图代码 *</span><textarea v-model="form.code" required rows="9" spellcheck="false" placeholder="在游戏中导出蓝图，将完整代码粘贴到这里…"/><small>完整保留游戏导出的代码，最大 2 MB。玩家点赞后可见。</small></label><label class="form-field"><span>建筑说明</span><textarea v-model="form.description" maxlength="2000" rows="3" placeholder="介绍建筑用途、摆放建议、游戏版本或所需材料…"/></label></div></div></fieldset><p class="bp-upload-rule"><Lock :size="14"/>预览图公开展示，蓝图代码在玩家点赞后解锁。</p><div v-if="formError" class="offline-banner compact" role="alert">{{ formError }}</div><div class="form-actions"><span class="bp-publish-author">{{ user ? `发布为 ${user.username}` : '发布前需登录工坊账号' }}</span><button type="button" class="secondary-button" :disabled="saving" @click="closeUpload">取消</button><button class="primary-button" type="submit" :disabled="saving"><LoaderCircle v-if="saving" :size="15" class="spin"/><Plus v-else :size="15"/>{{ saving ? phase : editingId ? '保存修改' : '公开发布蓝图' }}</button></div></form></div><div v-if="zoom && selected" class="bp-lightbox" role="dialog" aria-label="建筑大图" @click.self="zoom = false"><button class="icon-button" aria-label="关闭大图" @click="zoom = false"><X/></button><img :src="selected.image" :alt="selected.title"/></div></Teleport>
  </section>
</template>

<style scoped>
.blueprint-panel{padding:20px;min-height:600px;max-height:calc(100vh - 180px);overflow:auto;border-top:2px solid #f4d21b;color:#e5ecee}.bp-heading{display:flex;justify-content:space-between;gap:16px;align-items:center}.bp-heading h1{font-size:26px;margin:7px 0}.bp-heading h1 span{display:block;font-size:11px;font-weight:400;color:#8faaa9;margin-top:8px;letter-spacing:2px}.bp-heading p,.bp-upload-intro{font-size:12px;color:#9eafb4;line-height:1.8}.bp-heading .primary-button{flex-shrink:0}.bp-steps{display:flex;justify-content:space-between;gap:8px;padding:15px 12px;margin:18px 0;background:#17312c66;border:1px solid #38534d;color:#b1c9c3;font-size:11px}.bp-steps b{color:#f6d72a;margin-right:5px;font-size:13px}.bp-steps i{color:#5c7771}.bp-toolbar,.bp-filters,.bp-card-foot,.bp-detail-title,.bp-code-panel header,.bp-code-actions,.bp-owner-actions{display:flex;align-items:center;justify-content:space-between;gap:10px}.bp-tabs{display:flex;gap:22px}.bp-tabs button{background:none;border:0;border-bottom:2px solid transparent;padding:12px 0;color:#9caaac;cursor:pointer}.bp-tabs button.chosen{color:#ffdb29;border-color:#ffdb29}.bp-filters{margin:14px 0 18px}.bp-filters select,.bp-upload select{background:#111d21;border:1px solid #3b4e52;color:#d5e1e4;padding:9px;max-width:100%;border-radius:3px}.bp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:17px}.bp-card{text-align:left;border:1px solid #394b4e;padding:0;background:#101b20;color:inherit;cursor:pointer;overflow:hidden;border-radius:5px;transition:border-color .2s,transform .2s}.bp-card:hover{border-color:#c5ae39;transform:translateY(-2px)}.bp-card-image{aspect-ratio:16/10;position:relative;background:linear-gradient(135deg,#1b3b35,#121d26);display:grid;place-items:center}.bp-card-image img{width:100%;height:100%;object-fit:cover;position:absolute}.bp-category{position:absolute;left:10px;top:10px;padding:5px 8px;background:#0d1d20d9;color:#dbe6e1;font-size:10px;border:1px solid #7b8b6a66}.bp-image-hint{position:absolute;bottom:0;left:0;right:0;padding:24px 12px 10px;background:linear-gradient(transparent,#071214db);font-size:10px;color:#e8dd9d}.bp-card-copy{padding:13px}.bp-card h2{font-size:16px;margin:0 0 8px;overflow-wrap:anywhere}.bp-card-copy p{font-size:11px;color:#93a9ad;height:32px;line-height:16px;overflow:hidden}.bp-card-foot{border-top:1px solid #293a3e;padding-top:11px;font-size:11px;color:#a6b8b8}.bp-card-foot span{display:flex;align-items:center;gap:5px}.bp-card-foot span:last-child{color:#f0d16f}.bp-empty{text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;min-height:310px;color:#b8c8c7}.bp-empty>svg{color:#bcae64}.bp-empty p{font-size:12px;max-width:340px;line-height:1.9;color:#8fa7aa}.bp-notice{display:flex;align-items:center;gap:7px;padding:10px;background:#1d483b77;color:#9ee1bd;font-size:12px}.bp-detail>.text-action{padding:10px 0 18px}.bp-detail-image{width:100%;border:1px solid #3b5352;background:#071214;padding:0;cursor:zoom-in;position:relative;display:block;min-height:100px}.bp-detail-image img{display:block;width:100%;max-height:420px;object-fit:contain}.bp-detail-image span{position:absolute;right:10px;bottom:10px;color:white;background:#061415bd;padding:5px 9px;font-size:10px}.bp-detail-title{margin-top:20px}.bp-detail-title h2{font-size:24px;margin:10px 0}.bp-detail-title p{font-size:11px;color:#8eaaa9}.bp-tag{display:inline-flex;align-items:center;gap:5px;color:#d7ca8b;background:#80712c33;padding:5px 8px;font-size:10px}.bp-description{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.9;font-size:12px;color:#b8c9cb;margin:22px 0}.bp-code-panel{padding:18px;background:#0b181c;border:1px solid #3b534c}.bp-code-panel h3{margin:6px 0;font-size:17px}.bp-code-panel textarea,.bp-upload textarea{width:100%;background:#081216;border:1px solid #3b5357;color:#c1d7cf;padding:12px;resize:vertical;font:12px/1.65 Consolas,monospace;box-sizing:border-box}.bp-code-panel textarea{margin:15px 0;word-break:break-all}.bp-unlock{display:flex;align-items:center;flex-direction:column;gap:10px;padding:30px 15px;text-align:center}.bp-unlock>svg{color:#c9b45e}.bp-unlock p{font-size:12px;color:#94aaa9;line-height:1.8}.bp-code-actions small{font-size:11px;color:#95aaa9}.bp-code-actions button{flex-shrink:0}.bp-upload-backdrop{z-index:4}.bp-upload{width:min(800px,94vw);max-height:92vh;overflow:auto;padding:24px;box-sizing:border-box;border-top:2px solid #f6d82a;background:#101c21}.bp-upload fieldset{border:0;margin:0;padding:0;min-width:0}.bp-upload-layout{display:grid;grid-template-columns:1fr 1.3fr;gap:24px}.bp-upload .form-field{margin-bottom:15px}.bp-upload .form-field>span{display:block;font-size:12px;margin-bottom:9px}.bp-image-upload{position:relative;display:grid;place-items:center;min-height:180px;border:1px dashed #647c71;background:#172c2866;overflow:hidden;cursor:pointer}.bp-image-upload img{position:absolute;width:100%;height:100%;object-fit:cover}.bp-image-upload>span{z-index:1;display:flex;flex-direction:column;align-items:center;gap:9px;background:#0b171cc9;padding:14px;color:#e2d58e;font-size:12px}.bp-image-upload small{color:#9caeae;font-size:10px}.bp-image-upload input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}.bp-upload-rule{display:flex;align-items:center;gap:7px;padding:12px;border:1px solid #465041;color:#c9c49c;font-size:11px}.bp-publish-author{margin-right:auto;font-size:11px;color:#95aaa9}.bp-lightbox{position:fixed;inset:0;z-index:150;background:#000e;display:grid;place-items:center;padding:30px}.bp-lightbox>button{position:absolute;right:20px;top:20px}.bp-lightbox img{max-width:94vw;max-height:90vh;object-fit:contain}.bp-owner-actions{flex-shrink:0}
@media(min-width:1700px){.bp-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:1100px){.bp-heading h1{font-size:22px}.bp-heading p{display:none}.bp-steps{font-size:10px;padding:10px 6px}.bp-filters{flex-wrap:wrap}.bp-filters .searchbox{max-width:none;flex-basis:100%}}@media(max-width:650px){.blueprint-panel{padding:13px;max-height:none}.bp-grid,.bp-upload-layout{grid-template-columns:1fr}.bp-code-actions{align-items:stretch;flex-direction:column}.bp-steps{flex-wrap:wrap}.bp-steps i{display:none}.bp-heading h1 span{font-size:9px;letter-spacing:0}.bp-upload{padding:16px}.bp-upload-layout{gap:0}.bp-publish-author{display:none}}
</style>
