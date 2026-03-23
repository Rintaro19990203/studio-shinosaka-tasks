import { supabase } from './supabase.js'

const MEMBERS = ['岸本理事','原田理事','黒木理事','藤枝理事','水上理事','田中理事','福澤理事','森監事','河口監事','川上氏','石野氏','管理会社','その他']
const CATS = ['設備','会計','総会','清掃','防犯','消防','その他']
const STATUS_LABEL = { todo: '未着手', doing: '対応中', done: '完了' }

const today = new Date(); today.setHours(0,0,0,0)
let tasks = []
let editId = null
let currentUser = null

// assignee は配列で保存。旧データ（文字列）にも対応
function getAssignees(t) {
  if (!t.assignee) return []
  if (Array.isArray(t.assignee)) return t.assignee
  try { const p = JSON.parse(t.assignee); return Array.isArray(p) ? p : [t.assignee] } catch { return [t.assignee] }
}

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

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
    document.getElementById('login-form').style.display = tab.dataset.tab === 'login' ? 'block' : 'none'
    document.getElementById('signup-form').style.display = tab.dataset.tab === 'signup' ? 'block' : 'none'
    document.getElementById('auth-msg').textContent = ''
  })
})

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

document.getElementById('btn-logout').addEventListener('click', async () => {
  await supabase.auth.signOut()
  currentUser = null
  showAuth()
})

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
  const checked = [...document.querySelectorAll('.assignee-cb:checked')].map(cb => cb.value)
  if (!title) { alert('タスク名を入力してください'); return }
  if (checked.length === 0) { alert('担当者を1人以上選択してください'); return }

  // ボタンを無効化してローディング表示
  const btnSave = document.getElementById('btn-save')
  const btnDelete = document.getElementById('btn-delete')
  const btnCancel = document.getElementById('btn-cancel')
  btnSave.disabled = true
  btnSave.textContent = '保存中...'
  btnDelete.disabled = true
  btnCancel.disabled = true

  const payload = {
    title,
    description: document.getElementById('f-desc').value.trim(),
    assignee: JSON.stringify(checked),
    category: document.getElementById('f-cat').value,
    due_date: document.getElementById('f-due').value || null,
    status: document.getElementById('f-status').value,
    progress_note: document.getElementById('f-progress-note').value.trim(),
    completion_note: document.getElementById('f-completion-note').value.trim(),
  }

  const prevTask = editId ? tasks.find(t => t.id == editId) : null
  const prevStatus = prevTask ? prevTask.status : null

  try {
    if (editId) {
      await supabase.from('tasks').update(payload).eq('id', editId)
    } else {
      await supabase.from('tasks').insert(payload)
    }

    if (payload.status === 'done' && prevStatus !== 'done') {
      const taskData = editId ? { ...prevTask, ...payload } : payload
      btnSave.textContent = 'メール送信中...'
      try {
        const { data: { session } } = await supabase.auth.getSession()
        await fetch('https://ntnkhngzjzvqgsofspmt.supabase.co/functions/v1/send-completion-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify(taskData),
        })
      } catch(e) {
        console.error('メール送信エラー:', e)
      }
    }

    closeModal()
    await loadTasks()
  } finally {
    // 必ずボタンを元に戻す
    btnSave.disabled = false
    btnSave.textContent = '保存'
    btnDelete.disabled = false
    btnCancel.disabled = false
  }
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

let quickFilter = null // 'all' | 'over' | 'soon' | 'done'

function getFiltered() {
  const a = document.getElementById('filterAssignee').value
  const c = document.getElementById('filterCat').value
  const q = document.getElementById('search').value.toLowerCase()
  return tasks.filter(t => {
    if (a && !getAssignees(t).includes(a)) return false
    if (c && t.category !== c) return false
    if (q && !t.title.toLowerCase().includes(q) && !(t.description||'').toLowerCase().includes(q)) return false
    if (quickFilter === 'over') return t.status !== 'done' && t.due_date && new Date(t.due_date) < today
    if (quickFilter === 'soon') return t.status !== 'done' && t.due_date && (new Date(t.due_date)-today)/864e5 <= 3 && (new Date(t.due_date)-today)/864e5 >= 0
    if (quickFilter === 'done') return t.status === 'done'
    return true
  })
}

window.setQuickFilter = function(type) {
  quickFilter = quickFilter === type ? null : type
  render()
}

function makeCard(t) {
  const dc = dueCls(t.due_date)
  const dl = dueLabel(t.due_date)
  const assignees = getAssignees(t)
  const createdAt = t.created_at ? (() => { const d = new Date(t.created_at); return `${d.getMonth()+1}/${d.getDate()} 登録` })() : ''
  return `<div class="task" onclick="openDetail('${t.id}')">
    <div class="task-title">${t.title}</div>
    ${t.description ? `<div class="task-desc">${t.description}</div>` : ''}
    ${t.progress_note ? `<div class="task-desc" style="border-left:2px solid var(--amber);padding-left:8px;color:var(--amber)">進捗：${t.progress_note}</div>` : ''}
    ${t.completion_note ? `<div class="task-desc" style="border-left:2px solid var(--green);padding-left:8px;color:var(--green)">完了報告：${t.completion_note}</div>` : ''}
    <div class="task-meta">
      ${assignees.map(a => `<span class="tag tag-person">${a}</span>`).join('')}
      <span class="tag tag-cat">${t.category || ''}</span>
      <span class="tag ${dc}">${dl}</span>
      ${createdAt ? `<span class="tag" style="background:var(--surface2);color:var(--text3)">${createdAt}</span>` : ''}
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
    <div class="stat ${quickFilter===null?'stat-active':''}" onclick="setQuickFilter(null)" style="cursor:pointer">
      <div class="stat-label">全タスク</div>
      <div class="stat-val">${tasks.length}</div>
    </div>
    <div class="stat ${quickFilter==='over'?'stat-active':''}" onclick="setQuickFilter('over')" style="cursor:pointer">
      <div class="stat-label">期限超過</div>
      <div class="stat-val red">${over}</div>
    </div>
    <div class="stat ${quickFilter==='soon'?'stat-active':''}" onclick="setQuickFilter('soon')" style="cursor:pointer">
      <div class="stat-label">期限3日以内</div>
      <div class="stat-val amber">${soon}</div>
    </div>
    <div class="stat ${quickFilter==='done'?'stat-active':''}" onclick="setQuickFilter('done')" style="cursor:pointer">
      <div class="stat-label">完了済み</div>
      <div class="stat-val green">${done}</div>
    </div>
  `

  const asel = document.getElementById('filterAssignee')
  const cur = asel.value
  asel.innerHTML = '<option value="">全担当者</option>' + MEMBERS.map(m => `<option value="${m}"${m===cur?' selected':''}>${m}</option>`).join('')
}

// ─── 詳細パネル ───────────────────────────────────────────────
window.openDetail = function(id) {
  const t = tasks.find(t => t.id == id)
  if (!t) return
  const assignees = getAssignees(t)
  const createdAt = t.created_at ? (() => { const d = new Date(t.created_at); return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}` })() : '—'
  const dueStr = t.due_date ? (() => { const d = new Date(t.due_date); return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}` })() : '—'

  document.getElementById('detail-title').textContent = t.title
  document.getElementById('detail-content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:1rem">
      <div style="background:var(--surface2);border-radius:var(--radius);padding:.75rem;grid-column:1/-1">
        <div style="font-size:11px;color:var(--text2);margin-bottom:5px">担当者</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${assignees.map(a => `<span class="tag tag-person">${a}</span>`).join('')}</div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--radius);padding:.75rem">
        <div style="font-size:11px;color:var(--text2);margin-bottom:3px">ステータス</div>
        <div style="font-size:14px;font-weight:500">${STATUS_LABEL[t.status] || t.status}</div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--radius);padding:.75rem">
        <div style="font-size:11px;color:var(--text2);margin-bottom:3px">カテゴリ</div>
        <div style="font-size:14px;font-weight:500">${t.category || '—'}</div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--radius);padding:.75rem">
        <div style="font-size:11px;color:var(--text2);margin-bottom:3px">期限</div>
        <div style="font-size:14px;font-weight:500">${dueStr}</div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--radius);padding:.75rem">
        <div style="font-size:11px;color:var(--text2);margin-bottom:3px">登録日</div>
        <div style="font-size:14px;font-weight:500">${createdAt}</div>
      </div>
    </div>
    ${t.description ? `<div style="margin-bottom:1rem"><div style="font-size:11px;color:var(--text2);margin-bottom:5px;font-weight:500">詳細・メモ</div><div style="font-size:13px;line-height:1.7;white-space:pre-wrap">${t.description}</div></div>` : ''}
    ${t.progress_note ? `<div style="margin-bottom:1rem;padding:12px;border-left:3px solid var(--amber);background:rgba(239,159,39,0.06);border-radius:0 var(--radius) var(--radius) 0"><div style="font-size:11px;color:var(--amber);margin-bottom:5px;font-weight:500">進捗状況</div><div style="font-size:13px;line-height:1.7;white-space:pre-wrap">${t.progress_note}</div></div>` : ''}
    ${t.completion_note ? `<div style="margin-bottom:1rem;padding:12px;border-left:3px solid var(--green);background:rgba(99,153,34,0.06);border-radius:0 var(--radius) var(--radius) 0"><div style="font-size:11px;color:var(--green);margin-bottom:5px;font-weight:500">完了報告</div><div style="font-size:13px;line-height:1.7;white-space:pre-wrap">${t.completion_note}</div></div>` : ''}
  `
  document.getElementById('btn-detail-edit').onclick = () => { closeDetail(); openModal(id) }
  document.getElementById('btn-detail-pdf').onclick = () => exportPDF(t)
  document.getElementById('detail-overlay').style.display = 'flex'
}

function closeDetail() { document.getElementById('detail-overlay').style.display = 'none' }
document.getElementById('btn-detail-close').addEventListener('click', closeDetail)
document.getElementById('detail-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeDetail() })

// ─── PDF出力 ───────────────────────────────────────────────
function exportPDF(t) {
  const assignees = getAssignees(t)
  const createdAt = t.created_at ? (() => { const d = new Date(t.created_at); return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日` })() : '—'
  const dueStr = t.due_date ? (() => { const d = new Date(t.due_date); return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日` })() : '—'
  const printWin = window.open('', '_blank')
  printWin.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
  <title>${t.title}</title>
  <style>
    body { font-family: 'Hiragino Sans', 'Noto Sans JP', sans-serif; padding: 40px; color: #1a1a18; font-size: 13px; line-height: 1.7; }
    h1 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
    .sub { font-size: 12px; color: #888; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
    .cell { background: #f5f4f0; border-radius: 8px; padding: 10px 14px; }
    .cell.full { grid-column: 1 / -1; }
    .cell-label { font-size: 11px; color: #888; margin-bottom: 4px; }
    .cell-val { font-size: 13px; font-weight: 500; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag { font-size: 11px; padding: 2px 8px; border-radius: 20px; background: #e0e0d8; color: #555; }
    .section { margin-bottom: 16px; }
    .section-title { font-size: 11px; font-weight: 700; color: #888; margin-bottom: 6px; }
    .section-body { font-size: 13px; white-space: pre-wrap; line-height: 1.7; }
    .progress { border-left: 3px solid #EF9F27; padding: 10px 14px; background: #fdf8f0; border-radius: 0 8px 8px 0; margin-bottom:16px }
    .done { border-left: 3px solid #639922; padding: 10px 14px; background: #f4faea; border-radius: 0 8px 8px 0; margin-bottom:16px }
    .footer { margin-top: 40px; font-size: 11px; color: #aaa; border-top: 1px solid #eee; padding-top: 12px; }
    @media print { body { padding: 20px; } }
  </style></head><body>
  <h1>${t.title}</h1>
  <div class="sub">スタジオ新大阪管理組合 理事会タスク管理</div>
  <div class="grid">
    <div class="cell full"><div class="cell-label">担当者</div><div class="tags">${assignees.map(a => `<span class="tag">${a}</span>`).join('')}</div></div>
    <div class="cell"><div class="cell-label">ステータス</div><div class="cell-val">${STATUS_LABEL[t.status] || t.status}</div></div>
    <div class="cell"><div class="cell-label">カテゴリ</div><div class="cell-val">${t.category || '—'}</div></div>
    <div class="cell"><div class="cell-label">期限</div><div class="cell-val">${dueStr}</div></div>
    <div class="cell"><div class="cell-label">登録日</div><div class="cell-val">${createdAt}</div></div>
  </div>
  ${t.description ? `<div class="section"><div class="section-title">詳細・メモ</div><div class="section-body">${t.description}</div></div>` : ''}
  ${t.progress_note ? `<div class="progress"><div class="section-title" style="color:#854F0B">進捗状況</div><div class="section-body">${t.progress_note}</div></div>` : ''}
  ${t.completion_note ? `<div class="done"><div class="section-title" style="color:#3B6D11">完了報告</div><div class="section-body">${t.completion_note}</div></div>` : ''}
  <div class="footer">出力日時：${new Date().toLocaleString('ja-JP')}</div>
  <script>window.onload=()=>{window.print()}<\/script>
  </body></html>`)
  printWin.document.close()
}

// ─── モーダル（担当者チェックボックス） ───────────────────────────────────────────────
function buildAssigneeCheckboxes(selected = []) {
  return MEMBERS.map(m => `
    <label style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;font-size:13px">
      <input type="checkbox" class="assignee-cb" value="${m}" ${selected.includes(m) ? 'checked' : ''} style="width:15px;height:15px;cursor:pointer">
      ${m}
    </label>
  `).join('')
}

window.openModal = function(id) {
  editId = id || null
  const m = id ? tasks.find(t => t.id == id) : null
  const selectedAssignees = m ? getAssignees(m) : []
  document.getElementById('modal-title').textContent = id ? 'タスクを編集' : 'タスクを追加'
  document.getElementById('f-title').value = m ? m.title : ''
  document.getElementById('f-desc').value = m ? m.description || '' : ''
  document.getElementById('f-assignee-list').innerHTML = buildAssigneeCheckboxes(selectedAssignees)
  document.getElementById('f-cat').value = m ? m.category || '設備' : '設備'
  document.getElementById('f-due').value = m ? m.due_date || '' : ''
  document.getElementById('f-status').value = m ? m.status : 'todo'
  document.getElementById('f-progress-note').value = m ? m.progress_note || '' : ''
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

setInterval(() => { if (currentUser) loadTasks() }, 30000)
