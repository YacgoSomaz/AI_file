// ── state ─────────────────────────────────────────────────────────
const state = {
  isAdmin:        false,
  currentProject:  null,   // { id, name }
  currentCategory: null,   // { id, name }
  searchTimer:     null,
  selectMode:      false,
  selectedFiles:   new Set(), // 当前选中的文件名集合
};

// ── API ───────────────────────────────────────────────────────────
async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

function uploadFile(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd  = new FormData();
    fd.append('file', file);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
    xhr.onload  = () => { const d = JSON.parse(xhr.responseText); xhr.status < 400 ? resolve(d) : reject(new Error(d.error)); };
    xhr.onerror = () => reject(new Error('网络错误'));
    xhr.open(method = 'POST', url);
    xhr.send(fd);
  });
}

// ── helpers ───────────────────────────────────────────────────────
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fileIcon(type) {
  if (type === 'image') return '🖼️';
  if (type === 'video') return '🎬';
  const ext = type;
  if (ext === '.pdf')  return '📄';
  if (ext === '.docx') return '📝';
  if (ext === '.xlsx') return '📊';
  if (ext === '.pptx') return '📽️';
  return '📁';
}
function typeBadge(type, name) {
  if (type === 'image') return '<span class="type-badge type-image">图片</span>';
  if (type === 'video') return '<span class="type-badge type-video">视频</span>';
  const ext = name.split('.').pop().toUpperCase();
  return `<span class="type-badge type-doc">${ext}</span>`;
}

// ── modal ─────────────────────────────────────────────────────────
function showModal(title, placeholder, onConfirm, isPassword = false) {
  const modal   = document.getElementById('modal');
  const input   = document.getElementById('modalInput');
  const confirm = document.getElementById('modalConfirm');
  const cancel  = document.getElementById('modalCancel');
  document.getElementById('modalTitle').textContent = title;
  input.placeholder = placeholder;
  input.type = isPassword ? 'password' : 'text';
  input.value = '';
  modal.classList.remove('hidden');
  setTimeout(() => input.focus(), 50);

  const cleanup = () => { modal.classList.add('hidden'); confirm.onclick = null; cancel.onclick = null; input.onkeydown = null; };
  confirm.onclick = () => { const v = input.value.trim(); if (v) { onConfirm(v); cleanup(); } };
  cancel.onclick  = cleanup;
  input.onkeydown = e => { if (e.key === 'Enter') confirm.onclick(); if (e.key === 'Escape') cleanup(); };
}

// ── views ─────────────────────────────────────────────────────────
function showView(name) {
  ['viewHome','viewProject','viewFiles'].forEach(id => {
    document.getElementById(id).classList.toggle('hidden', id !== name);
  });
}

function setHeader(title, showBack) {
  document.getElementById('headerTitle').textContent = title;
  document.getElementById('btnBack').classList.toggle('hidden', !showBack);
}

// ── home view ─────────────────────────────────────────────────────
function hideFileButtons() {
  document.getElementById('btnQrUpload').classList.add('hidden');
  document.getElementById('btnSelect').classList.add('hidden');
  document.getElementById('batchBar').classList.add('hidden');
  if (state.selectMode) { state.selectMode = false; state.selectedFiles.clear(); }
}

async function loadHome() {
  hideFileButtons();
  state.currentProject  = null;
  state.currentCategory = null;
  setHeader('公司文件库', false);
  showView('viewHome');

  const projects = await api('GET', '/api/projects');
  document.getElementById('projectCount').textContent = projects.length;

  const grid = document.getElementById('projectGrid');
  grid.innerHTML = '';

  if (projects.length === 0) {
    grid.innerHTML = '<div class="empty"><div class="empty-icon">📂</div><div class="empty-text">还没有项目，点击新建项目开始</div></div>';
  }

  projects.forEach(p => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      ${state.isAdmin ? `<button class="btn-delete-card" data-id="${p.id}">删除</button>` : ''}
      <div class="card-icon">🏗️</div>
      <div class="card-name">${p.name}</div>
      <div class="card-meta">${p.categoryCount} 个分类 · ${p.fileCount} 个文件</div>
    `;
    card.addEventListener('click', e => {
      if (e.target.closest('.btn-delete-card')) return;
      loadProject(p.id, p.name);
    });
    if (state.isAdmin) {
      card.querySelector('.btn-delete-card').addEventListener('click', e => {
        e.stopPropagation();
        if (confirm(`确定删除项目「${p.name}」？此操作将删除项目内所有文件，不可恢复。`)) {
          api('DELETE', `/api/projects/${p.id}`).then(loadHome).catch(e => alert(e.message));
        }
      });
    }
    grid.appendChild(card);
  });

  // new project card
  const newCard = document.createElement('div');
  newCard.className = 'card card-new';
  newCard.innerHTML = '<div class="card-new-icon">＋</div><div class="card-new-label">新建项目</div>';
  newCard.addEventListener('click', () => {
    showModal('新建项目', '输入项目名称，如：大华公园天下', async name => {
      await api('POST', '/api/projects', { name });
      loadHome();
    });
  });
  grid.appendChild(newCard);
}

// ── project view ──────────────────────────────────────────────────
async function loadProject(projectId, projectName) {
  hideFileButtons();
  state.currentProject  = { id: projectId, name: projectName };
  state.currentCategory = null;
  setHeader(projectName, true);
  showView('viewProject');

  const { categories } = await api('GET', `/api/projects/${projectId}/categories`);
  document.getElementById('categoryCount').textContent = categories.length;

  const grid = document.getElementById('categoryGrid');
  grid.innerHTML = '';

  if (categories.length === 0) {
    grid.innerHTML = '<div class="empty"><div class="empty-icon">📁</div><div class="empty-text">还没有分类，点击新建分类</div></div>';
  }

  categories.forEach(c => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      ${state.isAdmin ? `<button class="btn-delete-card" data-id="${c.id}">删除</button>` : ''}
      <div class="card-icon">📁</div>
      <div class="card-name">${c.name}</div>
      <div class="card-meta">${c.fileCount} 个文件</div>
    `;
    card.addEventListener('click', e => {
      if (e.target.closest('.btn-delete-card')) return;
      loadFiles(projectId, c.id, c.name);
    });
    if (state.isAdmin) {
      card.querySelector('.btn-delete-card').addEventListener('click', e => {
        e.stopPropagation();
        if (confirm(`确定删除分类「${c.name}」？此操作将删除分类内所有文件，不可恢复。`)) {
          api('DELETE', `/api/projects/${projectId}/categories/${c.id}`)
            .then(() => loadProject(projectId, projectName))
            .catch(e => alert(e.message));
        }
      });
    }
    grid.appendChild(card);
  });

  // new category card
  const newCard = document.createElement('div');
  newCard.className = 'card card-new';
  newCard.innerHTML = '<div class="card-new-icon">＋</div><div class="card-new-label">新建分类</div>';
  newCard.addEventListener('click', () => {
    showModal('新建分类', '输入分类名称，如：施工进度', async name => {
      await api('POST', `/api/projects/${projectId}/categories`, { name });
      loadProject(projectId, projectName);
    });
  });
  grid.appendChild(newCard);
}

// ── files view ────────────────────────────────────────────────────
async function loadFiles(projectId, categoryId, categoryName) {
  // 退出上一次的选择模式（如从别处返回）
  if (state.selectMode) exitSelectMode();
  state.currentCategory = { id: categoryId, name: categoryName };
  setHeader(`${state.currentProject.name}  /  ${categoryName}`, true);
  showView('viewFiles');
  // 显示文件视图专属按钮
  document.getElementById('btnQrUpload').classList.remove('hidden');
  if (state.isAdmin) document.getElementById('btnSelect').classList.remove('hidden');
  document.getElementById('inputSearch').value = '';
  document.getElementById('dateFrom').value = '';
  document.getElementById('dateTo').value   = '';
  await renderFiles();
}

async function renderFiles() {
  const { id: projectId }  = state.currentProject;
  const { id: categoryId } = state.currentCategory;
  const search   = document.getElementById('inputSearch').value.trim();
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo   = document.getElementById('dateTo').value;

  const params = new URLSearchParams();
  if (search)   params.set('search', search);
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo)   params.set('dateTo', dateTo);

  const { files } = await api('GET', `/api/projects/${projectId}/categories/${categoryId}/files?${params}`);
  const grid = document.getElementById('fileGrid');
  grid.innerHTML = '';

  if (files.length === 0) {
    grid.innerHTML = '<div class="empty"><div class="empty-icon">🗂️</div><div class="empty-text">没有找到文件</div></div>';
    return;
  }

  files.forEach(f => {
    const card = document.createElement('div');
    const isSelected = state.selectedFiles.has(f.name);
    card.className = 'card file-card' +
      (state.selectMode ? ' selectable' : '') +
      (isSelected ? ' selected' : '');
    card.dataset.name = f.name;

    const thumbContent = f.thumb
      ? `<img src="${f.thumb}" loading="lazy" alt="${f.displayName}">`
      : `<div class="file-thumb-placeholder">${fileIcon(f.type)}</div>`;

    const deleteBtn = state.isAdmin && !state.selectMode
      ? `<button class="btn-delete-card" data-name="${f.name}">删除</button>`
      : '';

    card.innerHTML =
      `<div class="file-thumb">${thumbContent}</div>` +
      `${typeBadge(f.type, f.displayName)}` +
      `<div class="file-actions">` +
        `<a href="/api/download/${projectId}/${categoryId}/${f.name}" download>↓ 下载</a>` +
        deleteBtn +
      `</div>` +
      `<div class="file-info">` +
        `<div class="file-name">${f.displayName}</div>` +
        `<div class="file-meta">${formatSize(f.size)} · ${formatDate(f.uploadedAt)}</div>` +
      `</div>`;

    // 选择模式：点击切换选中
    if (state.selectMode) {
      card.addEventListener('click', () => toggleSelect(f.name, card));
      return grid.appendChild(card);
    }

    // 图片：点击打开灯箱
    if (f.type === 'image') {
      card.querySelector('.file-thumb').style.cursor = 'zoom-in';
      card.addEventListener('click', e => {
        if (e.target.closest('.btn-delete-card') || e.target.closest('a')) return;
        openLightbox(`/uploads/${projectId}/${categoryId}/${f.name}`);
      });
    }

    if (state.isAdmin) {
      card.querySelector('.btn-delete-card').addEventListener('click', e => {
        e.stopPropagation();
        if (confirm(`确定删除文件「${f.displayName}」？`)) {
          api('DELETE', `/api/projects/${projectId}/categories/${categoryId}/files/${f.name}`)
            .then(renderFiles)
            .catch(err => alert(err.message));
        }
      });
    }

    grid.appendChild(card);
  });
}

// ── lightbox ──────────────────────────────────────────────────────
function openLightbox(src) {
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightbox').classList.remove('hidden');
}

// ── batch select ──────────────────────────────────────────────────
function enterSelectMode() {
  state.selectMode = true;
  state.selectedFiles.clear();
  document.getElementById('batchBar').classList.remove('hidden');
  document.getElementById('btnSelect').classList.add('active');
  document.getElementById('btnUpload').classList.add('hidden');
  document.getElementById('btnQrUpload').classList.add('hidden');
  updateBatchBar();
  renderFiles();
}

function exitSelectMode() {
  state.selectMode = false;
  state.selectedFiles.clear();
  document.getElementById('batchBar').classList.add('hidden');
  document.getElementById('btnSelect').classList.remove('active');
  document.getElementById('btnUpload').classList.remove('hidden');
  document.getElementById('btnQrUpload').classList.remove('hidden');
  renderFiles();
}

function toggleSelect(name, card) {
  if (state.selectedFiles.has(name)) {
    state.selectedFiles.delete(name);
    card.classList.remove('selected');
  } else {
    state.selectedFiles.add(name);
    card.classList.add('selected');
  }
  updateBatchBar();
}

function updateBatchBar() {
  const n = state.selectedFiles.size;
  document.getElementById('selectedCount').textContent = `已选 ${n} 项`;
  document.getElementById('btnDeleteSelected').disabled = n === 0;
}

async function deleteSelected() {
  const names = [...state.selectedFiles];
  if (!names.length) return;
  if (!confirm(`确定删除选中的 ${names.length} 个文件？此操作不可恢复。`)) return;

  const { id: projectId }  = state.currentProject;
  const { id: categoryId } = state.currentCategory;

  let failed = 0;
  for (const name of names) {
    try {
      await api('DELETE', `/api/projects/${projectId}/categories/${categoryId}/files/${name}`);
    } catch {
      failed++;
    }
  }
  if (failed > 0) alert(`${failed} 个文件删除失败`);
  exitSelectMode();
}

// ── QR code ───────────────────────────────────────────────────────
function getUploadUrl() {
  // 指向专属上传页，扫码后直接进入选文件流程
  return `${location.origin}/upload.html?p=${state.currentProject.id}&c=${state.currentCategory.id}`;
}

function showQrModal() {
  const url = getUploadUrl();
  // 显示目标路径，而不是原始 URL
  document.getElementById('qrUrl').textContent =
    `${state.currentProject.name}  →  ${state.currentCategory.name}`;
  document.getElementById('qrContainer').innerHTML =
    `<img src="/api/qr?data=${encodeURIComponent(url)}" width="240" height="240" alt="二维码" style="border-radius:8px">`;
  document.getElementById('qrModal').classList.remove('hidden');
}

// ── upload queue ──────────────────────────────────────────────────
// 最多同时跑 3 个上传，用户可以正常浏览，队列在后台跑
const uq = {
  items:         [],   // { id, file, url, status, progress, name }
  active:        0,
  MAX_CONCURRENT: 3,
  dismissTimer:  null,
  _idSeq:        0,

  // 把一批文件加入队列并启动
  enqueue(files, projectId, categoryId) {
    clearTimeout(this.dismissTimer);
    files.forEach(f => {
      this.items.push({
        id:       ++this._idSeq,
        file:     f,
        url:      `/api/upload/${projectId}/${categoryId}`,
        status:   'waiting',   // waiting | uploading | done | error
        progress: 0,
        name:     f.name,
        destProject:  projectId,
        destCategory: categoryId,
      });
    });
    this._render();
    this._pump();
  },

  // 启动尽可能多的并发上传
  _pump() {
    while (this.active < this.MAX_CONCURRENT) {
      const next = this.items.find(i => i.status === 'waiting');
      if (!next) break;
      this._upload(next);
    }
  },

  async _upload(item) {
    this.active++;
    item.status = 'uploading';
    this._render();
    try {
      await uploadFile(item.url, item.file, pct => {
        item.progress = pct;
        this._render();
      });
      item.progress = 100;
      item.status = 'done';
    } catch (e) {
      item.status = 'error';
      item.progress = 100;
    }
    this.active--;
    this._render();
    this._pump();

    // 全部结束后刷新文件列表，3 秒后收起面板
    // 图片缩略图在服务端上传完成前已同步生成，无需延迟二次刷新
    if (this.items.every(i => i.status === 'done' || i.status === 'error')) {
      if (state.currentProject && state.currentCategory) renderFiles();
      // 刷新 inbox 横幅与角标（FAB 上传时文件数会变）
      if (typeof inbox !== 'undefined') inbox.refreshBadge();
      this.dismissTimer = setTimeout(() => this._dismiss(), 3000);
    }
  },

  _dismiss() {
    document.getElementById('uploadQueue').classList.add('hidden');
    this.items = [];
    this._render();
  },

  _render() {
    const panel = document.getElementById('uploadQueue');
    if (!panel) return;
    if (this.items.length === 0) { panel.classList.add('hidden'); return; }

    panel.classList.remove('hidden');

    const done  = this.items.filter(i => i.status === 'done').length;
    const total = this.items.length;
    document.getElementById('uqCount').textContent = `${done} / ${total}`;

    const iconMap = { waiting: '⏳', uploading: '⬆️', done: '✅', error: '❌' };
    const pctText = i => {
      if (i.status === 'waiting')   return '等待';
      if (i.status === 'done')      return '完成';
      if (i.status === 'error')     return '失败';
      return i.progress + '%';
    };

    document.getElementById('uqList').innerHTML = this.items.map(i => `
      <li class="uq-item ${i.status}" data-id="${i.id}">
        <span class="uq-item-icon">${iconMap[i.status]}</span>
        <div class="uq-item-body">
          <div class="uq-item-name" title="${i.name}">${i.name}</div>
          <div class="uq-item-bar">
            <div class="uq-item-fill" style="width:${i.progress}%"></div>
          </div>
        </div>
        <span class="uq-item-pct">${pctText(i)}</span>
      </li>
    `).join('');
  }
};

// 入口：把选中的文件交给队列
function handleFiles(fileList) {
  if (!state.currentProject || !state.currentCategory) return;
  const files = Array.from(fileList).filter(f => f.size > 0);
  if (!files.length) return;
  uq.enqueue(files, state.currentProject.id, state.currentCategory.id);
}

// ── init ──────────────────────────────────────────────────────────
async function init() {
  const me = await api('GET', '/api/me');
  state.isAdmin = me.isAdmin;
  updateAdminBtn();

  // back button
  document.getElementById('btnBack').addEventListener('click', () => {
    if (state.currentCategory) {
      loadProject(state.currentProject.id, state.currentProject.name);
    } else {
      loadHome();
    }
  });

  // admin button
  document.getElementById('btnAdmin').addEventListener('click', () => {
    if (state.isAdmin) {
      api('POST', '/api/admin/logout').then(() => { state.isAdmin = false; updateAdminBtn(); reloadCurrentView(); });
    } else {
      showModal('管理员登录', '输入管理员卡密', async code => {
        await api('POST', '/api/admin/login', { code });
        state.isAdmin = true;
        updateAdminBtn();
        reloadCurrentView();
      }, true);
    }
  });

  // new project / category buttons (also handled via cards, these are toolbar shortcuts)
  document.getElementById('btnNewProject').addEventListener('click', () => {
    showModal('新建项目', '输入项目名称，如：大华公园天下', async name => {
      await api('POST', '/api/projects', { name });
      loadHome();
    });
  });
  document.getElementById('btnNewCategory').addEventListener('click', () => {
    if (!state.currentProject) return;
    showModal('新建分类', '输入分类名称，如：施工进度', async name => {
      await api('POST', `/api/projects/${state.currentProject.id}/categories`, { name });
      loadProject(state.currentProject.id, state.currentProject.name);
    });
  });

  // upload button & file input
  document.getElementById('btnUpload').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });
  document.getElementById('fileInput').addEventListener('change', e => {
    handleFiles(e.target.files);
    e.target.value = '';
  });

  // drag & drop
  const dropZone = document.getElementById('dropZone');
  const fileView = document.getElementById('viewFiles');
  fileView.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.remove('hidden'); dropZone.classList.add('drag-over'); });
  fileView.addEventListener('dragleave', e => { if (!fileView.contains(e.relatedTarget)) { dropZone.classList.add('drag-over'); } });
  dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); dropZone.classList.add('hidden'); });
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    dropZone.classList.add('hidden');
    handleFiles(e.dataTransfer.files);
  });

  // search & filter
  document.getElementById('inputSearch').addEventListener('input', () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(renderFiles, 300);
  });
  document.getElementById('dateFrom').addEventListener('change', renderFiles);
  document.getElementById('dateTo').addEventListener('change', renderFiles);
  document.getElementById('btnClearFilter').addEventListener('click', () => {
    document.getElementById('inputSearch').value = '';
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value   = '';
    renderFiles();
  });

  // 队列面板收起 / 展开
  document.getElementById('uqToggle').addEventListener('click', () => {
    document.getElementById('uploadQueue').classList.toggle('minimised');
  });

  // lightbox close
  document.getElementById('lightboxClose').addEventListener('click', () => document.getElementById('lightbox').classList.add('hidden'));
  document.getElementById('lightbox').addEventListener('click', e => {
    if (e.target === document.getElementById('lightbox')) document.getElementById('lightbox').classList.add('hidden');
  });

  // QR modal
  document.getElementById('btnQrUpload').addEventListener('click', showQrModal);
  document.getElementById('qrClose').addEventListener('click', () => document.getElementById('qrModal').classList.add('hidden'));
  document.getElementById('qrModal').addEventListener('click', e => {
    if (e.target === document.getElementById('qrModal')) document.getElementById('qrModal').classList.add('hidden');
  });

  // 批量选择
  document.getElementById('btnSelect').addEventListener('click', enterSelectMode);
  document.getElementById('btnCancelSelect').addEventListener('click', exitSelectMode);
  document.getElementById('btnSelectAll').addEventListener('click', () => {
    const cards = document.querySelectorAll('#fileGrid .file-card');
    cards.forEach(card => {
      const name = card.dataset.name;
      if (name) { state.selectedFiles.add(name); card.classList.add('selected'); }
    });
    updateBatchBar();
  });
  document.getElementById('btnDeleteSelected').addEventListener('click', deleteSelected);

  // URL 参数直跳（手机扫码后自动进入对应分类）
  const params = new URLSearchParams(location.search);
  const directP = params.get('p');
  const directC = params.get('c');
  if (directP && directC) {
    try {
      const projects = await api('GET', '/api/projects');
      const proj = projects.find(p => p.id === directP);
      if (proj) {
        const { categories } = await api('GET', `/api/projects/${directP}/categories`);
        const cat = categories.find(c => c.id === directC);
        if (cat) {
          state.currentProject = { id: proj.id, name: proj.name };
          await loadFiles(directP, directC, cat.name);
          return;
        }
      }
    } catch { /* fallback to home */ }
  }

  initInbox();
  loadHome();
}

function updateAdminBtn() {
  const btn = document.getElementById('btnAdmin');
  btn.textContent = state.isAdmin ? '🔓' : '🔒';
  btn.classList.toggle('active', state.isAdmin);
  btn.title = state.isAdmin ? '退出管理员' : '管理员登录';
  // 批量选择按钮只对管理员可见
  const selectBtn = document.getElementById('btnSelect');
  if (state.currentCategory) {
    selectBtn.classList.toggle('hidden', !state.isAdmin);
  }
}

function reloadCurrentView() {
  if (state.currentCategory) {
    renderFiles();
  } else if (state.currentProject) {
    loadProject(state.currentProject.id, state.currentProject.name);
  } else {
    loadHome();
  }
}

document.addEventListener('DOMContentLoaded', init);

// ── inbox（自由空间）──────────────────────────────────────────────
const inbox = {
  _selected: new Set(),   // 当前选中的文件名

  async open() {
    document.getElementById('inboxPanel').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    this._selected.clear();
    await this.render();
  },

  close() {
    document.getElementById('inboxPanel').classList.add('hidden');
    document.body.style.overflow = '';
    this._selected.clear();
  },

  // 刷新首页横幅 + FAB 提示
  async refreshBadge() {
    try {
      const files = await api('GET', '/api/inbox/files');
      this._updateAlert(files.length);
    } catch { /* 静默失败 */ }
  },

  _updateAlert(count) {
    // 首页横幅
    const banner = document.getElementById('inboxBanner');
    if (banner) {
      document.getElementById('inboxBannerCount').textContent = count;
      banner.classList.toggle('hidden', count === 0);
    }
    // FAB 脉冲
    const fab = document.getElementById('fabInboxUpload');
    if (fab) fab.classList.toggle('has-files', count > 0);
  },

  async render() {
    const grid = document.getElementById('inboxGrid');
    grid.innerHTML = '<div class="empty"><div class="empty-icon">⏳</div><div class="empty-text">加载中…</div></div>';

    let files;
    try {
      files = await api('GET', '/api/inbox/files');
    } catch {
      grid.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-text">加载失败，请重试</div></div>';
      return;
    }

    this._updateAlert(files.length);
    this._updateBatchBar();

    if (files.length === 0) {
      grid.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">自由空间暂无文件</div></div>';
      return;
    }

    grid.innerHTML = '';
    files.forEach(f => {
      const card = document.createElement('div');
      const isSel = this._selected.has(f.name);
      card.className = 'card file-card inbox-file-card' + (isSel ? ' inbox-selected' : '');
      card.dataset.name = f.name;

      const thumbContent = f.thumb
        ? `<img src="${f.thumb}" loading="lazy" alt="${f.displayName}">`
        : `<div class="file-thumb-placeholder">${fileIcon(f.type)}</div>`;

      card.innerHTML =
        `<label class="inbox-checkbox" title="选择">` +
          `<input type="checkbox" ${isSel ? 'checked' : ''}>` +
          `<span class="inbox-checkbox-mark"></span>` +
        `</label>` +
        `<div class="file-thumb">${thumbContent}</div>` +
        `${typeBadge(f.type, f.displayName)}` +
        `<div class="file-actions">` +
          `<a href="/api/inbox/download/${encodeURIComponent(f.name)}" download>↓ 下载</a>` +
          (state.isAdmin ? `<button class="btn-delete-card" data-name="${f.name}">删除</button>` : '') +
        `</div>` +
        `<div class="file-info">` +
          `<div class="file-name">${f.displayName}</div>` +
          `<div class="file-meta">${formatSize(f.size)} · ${formatDate(f.uploadedAt)}</div>` +
        `</div>`;

      // 勾选
      const chk = card.querySelector('input[type=checkbox]');
      chk.addEventListener('change', () => {
        if (chk.checked) this._selected.add(f.name);
        else this._selected.delete(f.name);
        card.classList.toggle('inbox-selected', chk.checked);
        this._updateBatchBar();
      });

      // 点卡片主体 = 切换勾选
      card.addEventListener('click', e => {
        if (e.target.closest('a') || e.target.closest('.btn-delete-card') || e.target.tagName === 'INPUT') return;
        if (f.type === 'image' && !e.target.closest('.inbox-checkbox')) {
          openLightbox(`/inbox/${f.name}`);
          return;
        }
        chk.checked = !chk.checked;
        chk.dispatchEvent(new Event('change'));
      });

      // 删除按钮（管理员）
      if (state.isAdmin) {
        card.querySelector('.btn-delete-card').addEventListener('click', async e => {
          e.stopPropagation();
          if (!confirm(`确定删除「${f.displayName}」？`)) return;
          try {
            await api('DELETE', `/api/inbox/files/${f.name}`);
            this._selected.delete(f.name);
            await this.render();
          } catch (err) { alert(err.message); }
        });
      }

      grid.appendChild(card);
    });
  },

  // 全选 / 反选 / 取消
  async selectAll() {
    const cards = document.querySelectorAll('#inboxGrid .inbox-file-card');
    cards.forEach(card => {
      const name = card.dataset.name;
      const chk  = card.querySelector('input[type=checkbox]');
      this._selected.add(name);
      chk.checked = true;
      card.classList.add('inbox-selected');
    });
    this._updateBatchBar();
  },
  async invertSelect() {
    const cards = document.querySelectorAll('#inboxGrid .inbox-file-card');
    cards.forEach(card => {
      const name = card.dataset.name;
      const chk  = card.querySelector('input[type=checkbox]');
      if (this._selected.has(name)) { this._selected.delete(name); chk.checked = false; card.classList.remove('inbox-selected'); }
      else                           { this._selected.add(name);    chk.checked = true;  card.classList.add('inbox-selected'); }
    });
    this._updateBatchBar();
  },
  clearSelect() {
    this._selected.clear();
    document.querySelectorAll('#inboxGrid .inbox-file-card').forEach(card => {
      card.querySelector('input[type=checkbox]').checked = false;
      card.classList.remove('inbox-selected');
    });
    this._updateBatchBar();
  },

  async _updateBatchBar() {
    const bar = document.getElementById('inboxBatchBar');
    if (!bar) return;
    const n = this._selected.size;
    document.getElementById('inboxSelCount').textContent = `已选 ${n} 个`;
    const count2 = document.getElementById('inboxSelCount2');
    if (count2) count2.textContent = `已选 ${n} 个文件`;
    const wasHidden = bar.classList.contains('hidden');
    bar.classList.toggle('hidden', n === 0);
    // 首次展开时加载项目列表
    if (wasHidden && n > 0) {
      try {
        const projects = await api('GET', '/api/projects');
        const sel = document.getElementById('inboxBatchProject');
        sel.innerHTML = '<option value="">选择项目</option>' +
          projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        document.getElementById('inboxBatchCategory').innerHTML = '<option value="">先选择项目</option>';
        document.getElementById('inboxBatchCategory').disabled = true;
      } catch { /* ignore */ }
    }
  },

  // 批量归类
  async batchClassify() {
    const projectId  = document.getElementById('inboxBatchProject').value;
    const categoryId = document.getElementById('inboxBatchCategory').value;
    if (!projectId || !categoryId) { alert('请先选择项目和分类'); return; }
    const names = [...this._selected];
    const btn = document.getElementById('inboxBatchConfirm');
    btn.disabled = true; btn.textContent = '归类中…';
    let failed = 0;
    for (const filename of names) {
      try { await api('POST', '/api/inbox/classify', { filename, projectId, categoryId }); }
      catch { failed++; }
    }
    btn.disabled = false; btn.textContent = '确认归类';
    if (failed > 0) alert(`${failed} 个文件归类失败`);
    this._selected.clear();
    // 重置下拉框
    document.getElementById('inboxBatchProject').value = '';
    document.getElementById('inboxBatchCategory').innerHTML = '<option value="">先选择项目</option>';
    document.getElementById('inboxBatchCategory').disabled = true;
    await this.render();
  },

  // 批量删除
  async batchDelete() {
    const names = [...this._selected];
    if (!confirm(`确定删除选中的 ${names.length} 个文件？`)) return;
    for (const filename of names) {
      try { await api('DELETE', `/api/inbox/files/${filename}`); } catch {}
    }
    this._selected.clear();
    await this.render();
  },

  // 上传到 inbox
  uploadFiles(fileList) {
    const files = Array.from(fileList).filter(f => f.size > 0);
    if (!files.length) return;
    files.forEach(f => {
      uq.items.push({
        id: ++uq._idSeq, file: f, url: '/api/inbox/upload',
        status: 'waiting', progress: 0, name: f.name,
        destProject: '__inbox__', destCategory: '__inbox__',
      });
    });
    uq._render();
    uq._pump();
    const checkDone = setInterval(async () => {
      const pending = uq.items.filter(i => i.destProject === '__inbox__' && (i.status === 'waiting' || i.status === 'uploading'));
      if (pending.length === 0) { clearInterval(checkDone); await inbox.render(); }
    }, 500);
  }
};

// ── inbox 事件绑定 ────────────────────────────────────────────────
function initInbox() {
  // 打开 / 关闭面板
  document.getElementById('btnInbox').addEventListener('click', () => inbox.open());
  document.getElementById('inboxClose').addEventListener('click', () => inbox.close());

  // 面板内上传区
  const zone  = document.getElementById('inboxUploadZone');
  const input = document.getElementById('inboxFileInput');
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { inbox.uploadFiles(input.files); input.value = ''; });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); inbox.uploadFiles(e.dataTransfer.files); });

  // 批量操作栏按钮
  document.getElementById('inboxSelAll').addEventListener('click',    () => inbox.selectAll());
  document.getElementById('inboxSelInvert').addEventListener('click', () => inbox.invertSelect());
  document.getElementById('inboxSelClear').addEventListener('click',  () => inbox.clearSelect());
  document.getElementById('inboxBatchConfirm').addEventListener('click', () => inbox.batchClassify());
  if (state.isAdmin) {
    document.getElementById('inboxBatchDelete').addEventListener('click', () => inbox.batchDelete());
  }

  // 批量归类：项目变化时加载分类
  document.getElementById('inboxBatchProject').addEventListener('change', async e => {
    const pid    = e.target.value;
    const catSel = document.getElementById('inboxBatchCategory');
    if (!pid) { catSel.innerHTML = '<option value="">先选择项目</option>'; catSel.disabled = true; return; }
    try {
      const { categories } = await api('GET', `/api/projects/${pid}/categories`);
      catSel.innerHTML = '<option value="">选择分类</option>' +
        categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      catSel.disabled = false;
    } catch { catSel.disabled = true; }
  });

  // FAB 悬浮按钮 → 弹自由空间二维码
  const fab = document.getElementById('fabInboxUpload');
  fab.addEventListener('click', () => {
    const url = `${location.origin}/upload.html?inbox=1`;
    document.getElementById('inboxQrContainer').innerHTML =
      `<img src="/api/qr?data=${encodeURIComponent(url)}" width="240" height="240" alt="二维码" style="border-radius:8px">`;
    document.getElementById('inboxQrModal').classList.remove('hidden');
  });
  document.getElementById('inboxQrClose').addEventListener('click', () => {
    document.getElementById('inboxQrModal').classList.add('hidden');
  });
  document.getElementById('inboxQrModal').addEventListener('click', e => {
    if (e.target === document.getElementById('inboxQrModal'))
      document.getElementById('inboxQrModal').classList.add('hidden');
  });

  // 首页横幅
  document.getElementById('inboxBannerBtn').addEventListener('click', () => inbox.open());

  // 初始刷新横幅
  inbox.refreshBadge();
}
