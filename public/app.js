let currentZone = null;
let isAdmin = false;
let unlocked = false;
let currentScale = 1;
let excelWorkbook = null;
let zones = [];
let socket = null;
let chatNick = localStorage.getItem('chatNick') || '';

// 当前查看器里的文件（供查看器内下载按钮使用）
let viewerCurrent = { name: '', zoneId: '' };

// ── 启动 ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadZones();
  setupUpload();
  initChat();
  if (chatNick) document.getElementById('chatNickname').value = chatNick;

  document.getElementById('viewerBody').addEventListener('wheel', e => {
    e.preventDefault();
    zoom(e.deltaY < 0 ? 0.15 : -0.15);
  }, { passive: false });
});

// ── 鉴权 & 状态 ───────────────────────────────────────────
async function checkAuth() {
  const res = await fetch('/api/me');
  const data = await res.json();
  isAdmin = data.isAdmin;
  unlocked = data.unlocked;

  document.getElementById('adminBadge').style.display = isAdmin ? '' : 'none';
  document.getElementById('unlockBadge').style.display = (unlocked && !isAdmin) ? '' : 'none';
  document.getElementById('loginBtn').style.display = isAdmin ? 'none' : '';
  document.getElementById('logoutBtn').style.display = isAdmin ? '' : 'none';
  document.getElementById('cardBtn').style.display = (unlocked || isAdmin) ? 'none' : '';

  // 管理员额外：显示卡密管理入口
  const existing = document.getElementById('adminPanelBtn');
  if (isAdmin && !existing) {
    const btn = document.createElement('button');
    btn.id = 'adminPanelBtn';
    btn.className = 'btn-outline open-panel-btn';
    btn.textContent = '🗂 卡密管理';
    btn.onclick = openAdminPanel;
    document.querySelector('.topbar-right').prepend(btn);
  } else if (!isAdmin && existing) {
    existing.remove();
  }
}

// ── 管理员登录 ────────────────────────────────────────────
function openLogin() {
  document.getElementById('loginModal').style.display = 'flex';
  setTimeout(() => document.getElementById('loginUser').focus(), 50);
}
function closeLogin() {
  document.getElementById('loginModal').style.display = 'none';
  document.getElementById('loginErr').textContent = '';
}
async function doLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const err = document.getElementById('loginErr');
  if (!username || !password) { err.textContent = '请输入用户名和密码'; return; }
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (res.ok) {
    closeLogin();
    await checkAuth();
    loadFiles(currentZone);
  } else {
    err.textContent = data.error || '登录失败';
  }
}
async function doLogout() {
  await fetch('/api/logout', { method: 'POST' });
  isAdmin = false; unlocked = false;
  await checkAuth();
  loadFiles(currentZone);
}

// ── 卡密解锁 ──────────────────────────────────────────────
function openCardModal() {
  document.getElementById('cardModal').style.display = 'flex';
  setTimeout(() => document.getElementById('cardCodeInput').focus(), 50);
}
function closeCardModal() {
  document.getElementById('cardModal').style.display = 'none';
  document.getElementById('cardErr').textContent = '';
  document.getElementById('cardCodeInput').value = '';
}
async function verifyCard() {
  const code = document.getElementById('cardCodeInput').value.trim();
  const err = document.getElementById('cardErr');
  if (!code) { err.textContent = '请输入卡密'; return; }
  const res = await fetch('/api/card/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  const data = await res.json();
  if (res.ok) {
    unlocked = true;
    closeCardModal();
    await checkAuth();
    // 如果有待执行的动作则继续
    if (pendingAction) { pendingAction(); pendingAction = null; }
  } else {
    err.textContent = data.error || '卡密无效';
  }
}

// 自动格式化卡密输入（插入短横线）
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('cardCodeInput');
  if (!inp) return;
  inp.addEventListener('input', () => {
    let v = inp.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16);
    inp.value = v.match(/.{1,4}/g)?.join('-') || v;
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') verifyCard(); });
});

// ── 解锁拦截（下载/查看前检查）─────────────────────────
let pendingAction = null;
function requireUnlock(action) {
  if (unlocked || isAdmin) { action(); return; }
  pendingAction = action;
  openCardModal();
}

// ── 卡密管理面板（管理员）────────────────────────────────
async function openAdminPanel() {
  document.getElementById('adminPanel').style.display = 'flex';
  await refreshCardList();
}
function closeAdminPanel() {
  document.getElementById('adminPanel').style.display = 'none';
}
async function refreshCardList() {
  const res = await fetch('/api/cards');
  const cards = await res.json();
  const list = document.getElementById('cardList');
  if (!cards.length) {
    list.innerHTML = '<div class="card-empty">还没有卡密，点击上方生成</div>';
    return;
  }
  list.innerHTML = cards.map(c => {
    const depleted = c.maxUses > 0 && c.usedCount >= c.maxUses;
    const usesText = c.maxUses === 0
      ? `已用 ${c.usedCount} 次（不限）`
      : `${c.usedCount} / ${c.maxUses} 次`;
    return `
      <div class="card-item">
        <span class="card-code">${c.code}</span>
        <span class="card-label">${escHtml(c.label)}</span>
        <span class="card-uses ${depleted ? 'depleted' : ''}">${usesText}</span>
        <button class="card-copy-btn" onclick="copyCard('${c.code}')">复制</button>
        <button class="card-del-btn" onclick="deleteCard('${c.code}')">删除</button>
      </div>`;
  }).join('');
}
async function generateCard() {
  const customCode = document.getElementById('genCustomCode').value.trim();
  const label = document.getElementById('genLabel').value.trim() || '未命名';
  const maxUses = Number(document.getElementById('genMaxUses').value);
  const res = await fetch('/api/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, maxUses, customCode })
  });
  const data = await res.json();
  if (!res.ok) { alert(data.error || '生成失败'); return; }
  document.getElementById('genCustomCode').value = '';
  document.getElementById('genLabel').value = '';
  await refreshCardList();
}
async function deleteCard(code) {
  if (!confirm(`删除卡密 ${code}？`)) return;
  await fetch(`/api/cards/${code}`, { method: 'DELETE' });
  await refreshCardList();
}
function copyCard(code) {
  navigator.clipboard.writeText(code).then(() => alert(`已复制：${code}`));
}

// ── 分区 ──────────────────────────────────────────────────
async function loadZones() {
  const res = await fetch('/api/zones');
  zones = await res.json();
  const tabs = document.getElementById('zoneTabs');
  tabs.innerHTML = zones.map((z, i) =>
    `<div class="zone-tab ${i === 0 ? 'active' : ''}" onclick="switchZone(this,'${z.id}')">${z.name}</div>`
  ).join('');
  switchZone(tabs.querySelector('.zone-tab'), zones[0].id);
}
function switchZone(el, zoneId) {
  document.querySelectorAll('.zone-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  currentZone = zoneId;
  const zone = zones.find(z => z.id === zoneId);
  document.getElementById('sectionLabel').textContent = zone ? zone.name + ' 的文件' : '文件列表';
  loadFiles(zoneId);
}

// ── 上传（无需鉴权）──────────────────────────────────────
function setupUpload() {
  const zone = document.getElementById('uploadZone');
  const input = document.getElementById('fileInput');
  zone.addEventListener('click', e => { if (e.target.tagName !== 'LABEL') input.click(); });
  input.addEventListener('change', () => { uploadFiles(input.files); input.value = ''; });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); uploadFiles(e.dataTransfer.files); });
}
async function uploadFiles(files) {
  if (!files || !files.length) return;
  const msg = document.getElementById('uploadMsg');
  const bar = document.getElementById('progressBar');
  const wrap = document.getElementById('progressWrap');
  for (const file of files) {
    const form = new FormData();
    form.append('file', file);
    wrap.style.display = 'block'; bar.style.width = '0%';
    msg.className = ''; msg.textContent = `正在上传：${file.name}`;
    try {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/upload/${currentZone}`);
        xhr.upload.onprogress = e => { if (e.lengthComputable) bar.style.width = (e.loaded / e.total * 100) + '%'; };
        xhr.onload = () => xhr.status === 200 ? resolve() : reject(JSON.parse(xhr.responseText));
        xhr.onerror = () => reject({ error: '网络错误' });
        xhr.send(form);
      });
      bar.style.width = '100%';
      msg.className = 'success'; msg.textContent = `✅ ${file.name} 上传成功`;
    } catch (e) {
      msg.className = 'error'; msg.textContent = `❌ ${file.name} 失败：${e.error || '未知错误'}`;
    }
  }
  setTimeout(() => { wrap.style.display = 'none'; msg.textContent = ''; }, 2500);
  loadFiles(currentZone);
}

// ── 文件列表 ──────────────────────────────────────────────
async function loadFiles(zoneId) {
  if (!zoneId) return;
  const grid = document.getElementById('fileGrid');
  grid.innerHTML = '<div class="empty-tip">加载中...</div>';
  const res = await fetch(`/api/files/${zoneId}`);
  const files = await res.json();
  document.getElementById('fileCount').textContent = files.length ? `共 ${files.length} 个文件` : '';
  if (!files.length) {
    grid.innerHTML = '<div class="empty-tip">这个区域还没有文件，快来上传吧！</div>';
    return;
  }
  grid.innerHTML = files.map(f => `
    <div class="file-card ${f.featured ? 'file-card--featured' : ''}">
      ${f.featured ? '<div class="featured-badge">📌 重点</div>' : ''}
      ${f.type === 'image'
        ? `<img class="file-thumb" src="/uploads/${zoneId}/${encodeURIComponent(f.name)}" loading="lazy">`
        : f.type === 'ppt' ? `<div class="file-thumb-excel">📑</div>` : `<div class="file-thumb-excel">📊</div>`}
      <div class="file-info">
        <div class="file-name" title="${escHtml(f.displayName)}">${escHtml(f.displayName)}</div>
        <div class="file-meta"><span>${formatSize(f.size)}</span><span>${formatDate(f.mtime)}</span></div>
      </div>
      <div class="file-actions">
        <button onclick="requireUnlock(() => openFile('${f.name}','${f.type}','${zoneId}'))">👁 查看</button>
        <button onclick="requireUnlock(() => doDownload('${f.name}','${f.displayName}','${zoneId}'))">⬇ 下载</button>
        ${isAdmin ? `<button class="del-action" onclick="deleteFile('${f.name}','${zoneId}')">🗑 删除</button>` : ''}
      </div>
    </div>
  `).join('');
}

function openFile(name, type, zoneId) {
  if (type === 'image') openImage(name, zoneId);
  else if (type === 'ppt') { alert('PPT文件请直接下载查看'); doDownload(name, name.replace(/^\d+_/, ''), zoneId); }
  else openExcel(name, zoneId);
}

function doDownload(name, displayName, zoneId) {
  const a = document.createElement('a');
  a.href = `/api/download/${zoneId}/${encodeURIComponent(name)}`;
  a.download = displayName;
  a.click();
}

async function deleteFile(name, zoneId) {
  if (!confirm(`确定删除 "${name.replace(/^\d+_/, '')}" 吗？`)) return;
  const res = await fetch(`/api/files/${zoneId}/${encodeURIComponent(name)}`, { method: 'DELETE' });
  const data = await res.json();
  if (res.ok) loadFiles(zoneId);
  else alert(data.error || '删除失败');
}

// ── 图片查看器 ────────────────────────────────────────────
function openImage(name, zoneId) {
  currentScale = 1;
  viewerCurrent = { name, zoneId };
  const img = document.getElementById('viewerImg');
  img.src = `/uploads/${zoneId}/${encodeURIComponent(name)}`;
  img.style.transform = 'scale(1)';
  document.getElementById('imgTitle').textContent = name.replace(/^\d+_/, '');
  document.getElementById('zoomLabel').textContent = '100%';
  document.getElementById('imageViewer').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function viewerDownload() {
  doDownload(viewerCurrent.name, viewerCurrent.name.replace(/^\d+_/, ''), viewerCurrent.zoneId);
}
function zoom(delta) {
  currentScale = Math.min(Math.max(0.1, currentScale + delta), 12);
  document.getElementById('viewerImg').style.transform = `scale(${currentScale})`;
  document.getElementById('zoomLabel').textContent = Math.round(currentScale * 100) + '%';
}
function resetZoom() {
  currentScale = 1;
  document.getElementById('viewerImg').style.transform = 'scale(1)';
  document.getElementById('zoomLabel').textContent = '100%';
}
function closeViewer() {
  document.getElementById('imageViewer').style.display = 'none';
  document.getElementById('viewerImg').src = '';
  document.body.style.overflow = '';
}

// ── Excel 查看器 ──────────────────────────────────────────
async function openExcel(name, zoneId) {
  document.getElementById('excelTitle').textContent = name.replace(/^\d+_/, '');
  document.getElementById('excelViewer').style.display = 'flex';
  document.getElementById('excelBody').innerHTML = '<div style="padding:40px;text-align:center;color:#bbb">解析中...</div>';
  document.getElementById('sheetTabsWrap').innerHTML = '';
  document.body.style.overflow = 'hidden';
  const res = await fetch(`/uploads/${zoneId}/${encodeURIComponent(name)}`);
  const buf = await res.arrayBuffer();
  excelWorkbook = XLSX.read(buf, { type: 'array' });
  document.getElementById('sheetTabsWrap').innerHTML = excelWorkbook.SheetNames.map((n, i) =>
    `<div class="sheet-tab ${i === 0 ? 'active' : ''}" onclick="switchSheet(this,'${n}')">${escHtml(n)}</div>`
  ).join('');
  renderSheet(excelWorkbook.SheetNames[0]);
}
function switchSheet(el, name) {
  document.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderSheet(name);
}
function renderSheet(name) {
  document.getElementById('excelBody').innerHTML = XLSX.utils.sheet_to_html(excelWorkbook.Sheets[name], { editable: false });
}
function closeExcel() {
  document.getElementById('excelViewer').style.display = 'none';
  document.getElementById('excelBody').innerHTML = '';
  document.getElementById('sheetTabsWrap').innerHTML = '';
  excelWorkbook = null;
  document.body.style.overflow = '';
}

// ── 聊天 ──────────────────────────────────────────────────
function initChat() {
  socket = io();
  fetch('/api/chat/history').then(r => r.json()).then(msgs => {
    document.getElementById('chatMessages').innerHTML = '';
    msgs.forEach(m => appendMsg(m, false));
    scrollChat();
  });
  socket.on('chat:message', msg => { appendMsg(msg, true); scrollChat(); });
  socket.on('chat:deleted', ({ id }) => { document.getElementById(`msg-${id}`)?.remove(); });
  document.getElementById('chatText').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.getElementById('chatNickname').addEventListener('change', e => {
    chatNick = e.target.value.trim();
    localStorage.setItem('chatNick', chatNick);
  });
}
function appendMsg(msg, animate) {
  const box = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-msg'; div.id = `msg-${msg.id}`;
  if (animate) div.style.animation = 'fadeIn .2s ease';
  const delBtn = isAdmin ? `<button class="del-msg-btn" onclick="deleteMsg(${msg.id})">删除</button>` : '';
  div.innerHTML = `
    <div class="chat-msg-head">
      <span class="chat-nick">${escHtml(msg.nickname)}</span>
      <span class="chat-time">${formatTime(msg.time)}</span>
    </div>
    <div class="chat-bubble">${escHtml(msg.text)}${delBtn}</div>`;
  box.appendChild(div);
}
function sendMessage() {
  const nick = document.getElementById('chatNickname').value.trim() || '匿名';
  const text = document.getElementById('chatText').value.trim();
  if (!text) return;
  chatNick = nick; localStorage.setItem('chatNick', nick);
  socket.emit('chat:send', { nickname: nick, text });
  document.getElementById('chatText').value = '';
  document.getElementById('chatText').focus();
}
function deleteMsg(id) {
  if (!confirm('删除这条消息？')) return;
  socket.emit('chat:delete', { id, adminPassword: '4genanhaiziM' });
}
function scrollChat() {
  const box = document.getElementById('chatMessages');
  box.scrollTop = box.scrollHeight;
}

let chatOpen = true;
function toggleChat() {
  chatOpen = !chatOpen;
  document.getElementById('chatSidebar').classList.toggle('collapsed', !chatOpen);
  document.getElementById('chatFab').style.display = chatOpen ? 'none' : '';
}

// ── 工具函数 ──────────────────────────────────────────────
function formatSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
function formatDate(t) {
  const d = new Date(t);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function formatTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeViewer(); closeExcel(); closeLogin(); closeCardModal(); closeAdminPanel(); }
  if (e.key === 'Enter' && document.getElementById('loginModal').style.display !== 'none') doLogin();
});
