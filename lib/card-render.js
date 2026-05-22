/**
 * lib/card-render.js
 * 文件卡片 HTML 生成（纯函数，便于单元测试）
 *
 * 结构规范（匹配 CSS position:absolute 布局）：
 *   .file-card
 *     ├── .file-thumb     ← 封面图或占位符
 *     ├── .type-badge     ← 直接子元素，position:absolute 左上角
 *     ├── .file-actions   ← 直接子元素，position:absolute 右上角
 *     └── .file-info      ← 底部信息区，仅含 name / meta
 */

function typeBadge(type, name) {
  if (type === 'image') return '<span class="type-badge type-image">图片</span>';
  if (type === 'video') return '<span class="type-badge type-video">视频</span>';
  const ext = name.split('.').pop().toUpperCase();
  return `<span class="type-badge type-doc">${ext}</span>`;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function thumbIcon(type) {
  if (type === 'image') return '🖼️';
  if (type === 'video') return '🎬';
  return '📄';
}

/**
 * 生成文件卡片的内层 HTML（不含外层 .file-card div）。
 * .type-badge 和 .file-actions 是 .file-card 的直接子元素，
 * 可被 CSS position:absolute 覆盖在缩略图上方。
 *
 * @param {object}  file        文件对象 { name, displayName, size, uploadedAt, type, thumb }
 * @param {string}  projectId   项目 ID
 * @param {string}  categoryId  分类 ID
 * @param {boolean} isAdmin     是否管理员模式
 * @returns {string} 卡片内层 HTML
 */
export function buildFileCardHtml(file, projectId, categoryId, isAdmin) {
  const thumbContent = file.thumb
    ? `<img src="${file.thumb}" loading="lazy" alt="${file.displayName}">`
    : `<div class="file-thumb-placeholder">${thumbIcon(file.type)}</div>`;

  const deleteBtn = isAdmin
    ? `<button class="btn-delete-card" data-name="${file.name}" aria-label="删除">删除</button>`
    : '';

  const downloadUrl = `/api/download/${projectId}/${categoryId}/${file.name}`;

  return (
    `<div class="file-thumb">${thumbContent}</div>` +
    `${typeBadge(file.type, file.displayName)}` +
    `<div class="file-actions"><a href="${downloadUrl}" download>↓ 下载</a>${deleteBtn}</div>` +
    `<div class="file-info"><div class="file-name">${file.displayName}</div>` +
    `<div class="file-meta">${formatSize(file.size)} · ${formatDate(file.uploadedAt)}</div></div>`
  );
}
