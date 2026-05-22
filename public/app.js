// ── state ─────────────────────────────────────────────────────────
const state = {
  isAdmin: false,
  currentProject: null,   // { id, name }
  currentCategory: null,  // { id, name }
  searchTimer: null
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
async function loadHome() {
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
  state.currentCategory = { id: categoryId, name: categoryName };
  setHeader(`${state.currentProject.name}  /  ${categoryName}`, true);
  showView('viewFiles');
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
    card.className = 'card file-card';

    const thumbHtml = f.thumb
      ? `<img class="file-thumb" src="${f.thumb}" alt="${f.displayName}" loading="lazy">`
      : f.type === 'image' || f.type === 'video'
        ? `<div class="file-thumb-placeholder">${fileIcon(f.type)}</div>`
        : `<div class="file-thumb-placeholder">${fileIcon('.' + f.displayName.split('.').pop().toLowerCase())}</div>`;

    card.innerHTML = `
      ${state.isAdmin ? `<button class="btn-delete-card" data-name="${f.name}">删除</button>` : ''}
      ${thumbHtml}
      <div class="file-info">
        <div class="file-name">${f.displayName}</div>
        <div class="file-meta">${formatSize(f.size)} · ${formatDate(f.uploadedAt)}</div>
        <div class="file-actions">
          ${typeBadge(f.type, f.displayName)}
          <a class="btn-ghost" style="font-size:12px;padding:3px 8px;text-decoration:none"
             href="/api/download/${projectId}/${categoryId}/${f.name}" download>下载</a>
        </div>
      </div>
    `;

    // image click → lightbox
    if (f.type === 'image') {
      card.querySelector(f.thumb ? '.file-thumb' : '.file-thumb-placeholder').style.cursor = 'zoom-in';
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

// ── upload ────────────────────────────────────────────────────────
async function handleFiles(fileList) {
  if (!state.currentProject || !state.currentCategory) return;
  const { id: projectId }  = state.currentProject;
  const { id: categoryId } = state.currentCategory;

  const files    = Array.from(fileList);
  const progress = document.getElementById('uploadProgress');
  const fill     = document.getElementById('progressFill');
  const text     = document.getElementById('progressText');
  progress.classList.remove('hidden');

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    text.textContent = `上传中 ${i + 1}/${files.length}：${f.name}`;
    try {
      await uploadFile(`/api/upload/${projectId}/${categoryId}`, f, pct => {
        fill.style.width = pct + '%';
      });
    } catch (e) {
      alert(`「${f.name}」上传失败：${e.message}`);
    }
  }

  progress.classList.add('hidden');
  fill.style.width = '0%';
  await renderFiles();
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

  // lightbox close
  document.getElementById('lightboxClose').addEventListener('click', () => document.getElementById('lightbox').classList.add('hidden'));
  document.getElementById('lightbox').addEventListener('click', e => {
    if (e.target === document.getElementById('lightbox')) document.getElementById('lightbox').classList.add('hidden');
  });

  loadHome();
}

function updateAdminBtn() {
  const btn = document.getElementById('btnAdmin');
  btn.textContent = state.isAdmin ? '🔓' : '🔒';
  btn.classList.toggle('active', state.isAdmin);
  btn.title = state.isAdmin ? '退出管理员' : '管理员登录';
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
