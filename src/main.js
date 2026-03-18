import { supabase } from './supabase.js'

const MEMBERS = ['岸本理事','田中理事','水上理事','福澤理事','藤枝理事','河口監事','森監事','川上氏（日ビル）','石野氏（日ビル）','日本ビルサービス','その他']
const CATS = ['設備','会計','総会','清掃','防犯','その他']

const today = new Date(); today.setHours(0,0,0,0)
let tasks = []
let editId = null
let currentUser = null

// ─── AUTH ───────────────────────────────────────────────
const authScreen = document.getElementById('auth-screen')
const mainApp = document.getElementById('main-app')

function showAuth() { authScreen.style.display = 'flex'; mainApp.style.display = 'none' }
function showApp(user) {
  currentUser = user
  authScreen.style.display = 'none'
  mainApp.style.display = 'block'
  document.getElementById('user-email').textContent = user.email
  loadTasks()
}

// タブ切り替え
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
    document.getElementById('login-form').style.display = tab.dataset.tab === 'login' ? 'block' : 'none'
    document.getElementById('signup-form').style.display = tab.dataset.tab === 'signup' ? 'block' : 'none'
    document.getElementById('auth-msg').textContent = ''
  })
})

// ログイン
document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim()
  const password = document.getElementById('login-password').value
  const msg = document.getElementById('auth-msg')
  msg.textContent = ''; msg.className = 'auth-msg'
  if (!email || !password) { msg.textContent = 'メールアドレスとパスワードを入力してください'; msg.className = 'auth-msg error'; return }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) { msg.textContent = 'ログイン失敗：メールアドレスまたはパスワードが正しくありません'; msg.className = 'auth-msg error'; return }
  showApp(data.user)
})

// 新規登録
document.getElementById('btn-signup').addEventListener('click', async () => {
  const email = document.getElementById('signup-email').value.trim()
  const password = document.getElementById('signup-password').value
  const msg = document.getElementById('auth-msg')
  msg.textContent = ''; msg.className = 'auth-msg'
  if (!email || !password) { msg.textContent = 'メールアドレスとパスワードを入力してください'; msg.className = 'auth-msg error'; return }
  if (password.length < 6) { msg.textContent = 'パスワードは6文字以上にしてください'; msg.className = 'auth-msg error'; return }
  const { error } = await supabase.auth.signUp({ email, password })
  if (error) { msg.textContent = '登録失敗：' + error.message; msg.className = 'auth-msg error'; return }
  msg.textContent = '確認メールを送信しました。メールのリンクをクリックして登録を完了してください。'; msg.className = 'auth-msg success'
})

// ログアウト
document.getElementById('btn-logout').addEventListener('click', async () => {
  await supabase.auth.signOut()
  currentUser = null
  showAuth()
})

// セッション確認
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session) showApp(session.user)
  else showAuth()
})

// ─── TASKS ───────────────────────────────────────────────
async function loadTasks() {
  document.getElementById('board-area').innerHTML = '<div class="loading">読み込み中...</div>'
  const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false })
  if (error) { document.getElementById('board-area').innerHTML = '<div class="loading">読み込みエラー</div>'; return }
  tasks = data || []
  render()
}

async function saveTask() {
  const title = document.getElementById('f-title').value.trim()
  const assignee = document.getElementById('f-assignee').value
  if (!title) { alert('タスク名を入力してください'); return }
  if (!assignee) { alert('担当者を選択してください'); return }
  const payload = {
    title,
    description: document.getElementById('f-desc').value.trim(),
    assignee,
    category: document.getElementById('f-cat').value,
    due_date: document.getElementById('f-due').value || null,
    status: document.getElementById('f-status').value,
    completion_note: document.getElementById('f-completion-note').value.trim(),
  }
  if (editId) {
    await supabase.from('tasks').update(payload).eq('id', editId)
  } else {
    await supabase.from('tasks').insert(payload)
  }
  closeModal()
  await loadTasks()
}

async function deleteTask() {
  if (!confirm('このタスクを削除しますか？')) return
  await supabase.from('tasks').delete().eq('id', editId)
  closeModal()
  await loadTasks()
}

// ─── UI ───────────────────────────────────────────────
function dueCls(d) {
  if (!d) return 'tag-ok'
  const dt = new Date(d); dt.setHours(0,0,0,0)
  const diff = (dt - today) / 864e5
  if (diff < 0) return 'tag-over'
  if (diff <= 3) return 'tag-warn'
  return 'tag-ok'
}
function dueLabel(d) {
  if (!d) return '期限なし'
  const dt = new Date(d); dt.setHours(0,0,0,0)
  const diff = (dt - today) / 864e5
  const s = `${dt.getMonth()+1}/${dt.getDate()}`
  if (diff < 0) return s + ' 超過'
  if (diff === 0) return s + ' 今日'
  if (diff <= 3) return s + ' まで'
  return s + ' まで'
}

function getFiltered() {
  const a = document.getElementById('filterAssignee').value
  const c = document.getElementById('filterCat').value
  const q = document.getElementById('search').value.toLowerCase()
  return tasks.filter(t => {
    if (a && t.assignee !== a) return false
    if (c && t.category !== c) return false
    if (q && !t.title.toLowerCase().includes(q) && !(t.description||'').toLowerCase().includes(q)) return false
    return true
  })
}

function makeCard(t) {
  const dc = dueCls(t.due_date)
  const dl = dueLabel(t.due_date)
  return `<div class="task" onclick="openModal('${t.id}')">
    <div class="task-title">${t.title}</div>
    ${t.description ? `<div class="task-desc">${t.description}</div>` : ''}
    ${t.completion_note ? `<div class="task-desc" style="border-left:2px solid var(--green);padding-left:8px;color:var(--green)">完了報告：${t.completion_note}</div>` : ''}
    <div class="task-meta">
      <span class="tag tag-person">${t.assignee}</span>
      <span class="tag tag-cat">${t.category || ''}</span>
      <span class="tag ${dc}">${dl}</span>
    </div>
  </div>`
}

function render() {
  const f = getFiltered()
  const cols = { todo: [], doing: [], done: [] }
  f.forEach(t => { if (cols[t.status]) cols[t.status].push(t) })

  document.getElementById('board-area').innerHTML = `<div class="board">
    <div class="col-todo">
      <div class="col-head">未着手 <span class="col-count">${cols.todo.length}</span></div>
      <div class="task-list">${cols.todo.length ? cols.todo.map(makeCard).join('') : '<div class="empty">タスクなし</div>'}</div>
    </div>
    <div class="col-doing">
      <div class="col-head">対応中 <span class="col-count">${cols.doing.length}</span></div>
      <div class="task-list">${cols.doing.length ? cols.doing.map(makeCard).join('') : '<div class="empty">タスクなし</div>'}</div>
    </div>
    <div class="col-done">
      <div class="col-head">完了 <span class="col-count">${cols.done.length}</span></div>
      <div class="task-list">${cols.done.length ? cols.done.map(makeCard).join('') : '<div class="empty">タスクなし</div>'}</div>
    </div>
  </div>`

  const over = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < today).length
  const soon = tasks.filter(t => t.status !== 'done' && t.due_date && (new Date(t.due_date)-today)/864e5 <= 3 && (new Date(t.due_date)-today)/864e5 >= 0).length
  const done = tasks.filter(t => t.status === 'done').length
  document.getElementById('stats').innerHTML = `
    <div class="stat"><div class="stat-label">全タスク</div><div class="stat-val">${tasks.length}</div></div>
    <div class="stat"><div class="stat-label">期限超過</div><div class="stat-val red">${over}</div></div>
    <div class="stat"><div class="stat-label">期限3日以内</div><div class="stat-val amber">${soon}</div></div>
    <div class="stat"><div class="stat-label">完了済み</div><div class="stat-val green">${done}</div></div>
  `

  const asel = document.getElementById('filterAssignee')
  const cur = asel.value
  asel.innerHTML = '<option value="">全担当者</option>' + MEMBERS.map(m => `<option value="${m}"${m===cur?' selected':''}>${m}</option>`).join('')
}

// モーダル
window.openModal = function(id) {
  editId = id || null
  const m = id ? tasks.find(t => t.id == id) : null
  document.getElementById('modal-title').textContent = id ? 'タスクを編集' : 'タスクを追加'
  document.getElementById('f-title').value = m ? m.title : ''
  document.getElementById('f-desc').value = m ? m.description || '' : ''
  document.getElementById('f-assignee').value = m ? m.assignee : ''
  document.getElementById('f-cat').value = m ? m.category || '設備' : '設備'
  document.getElementById('f-due').value = m ? m.due_date || '' : ''
  document.getElementById('f-status').value = m ? m.status : 'todo'
  document.getElementById('f-completion-note').value = m ? m.completion_note || '' : ''
  document.getElementById('btn-delete').style.display = id ? '' : 'none'
  document.getElementById('modal-overlay').style.display = 'flex'
}

function closeModal() { document.getElementById('modal-overlay').style.display = 'none' }
window.closeModal = closeModal

document.getElementById('btn-save').addEventListener('click', saveTask)
document.getElementById('btn-delete').addEventListener('click', deleteTask)
document.getElementById('btn-cancel').addEventListener('click', closeModal)
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal() })
document.getElementById('btn-add').addEventListener('click', () => openModal(null))
document.getElementById('filterAssignee').addEventListener('change', render)
document.getElementById('filterCat').addEventListener('change', render)
document.getElementById('search').addEventListener('input', render)

// 30秒ごとに自動更新
setInterval(() => { if (currentUser) loadTasks() }, 30000)
