/**
 * 文件卡片 HTML 结构测试
 *
 * 测试目标：
 *   1. .type-badge 必须是 .file-card 的直接子元素（不能在 .file-info 内）
 *   2. .file-actions 必须是 .file-card 的直接子元素（不能在 .file-info 内）
 *   3. .file-thumb 是 .file-card 的直接子元素，包含 img 或 placeholder
 *   4. .file-info 只包含 file-name 和 file-meta（不包含 badge/actions）
 *   5. 有 thumb 时 img src 指向 /thumbs/ 路径
 *   6. 无 thumb 时展示 file-thumb-placeholder（不是空白）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFileCardHtml } from '../lib/card-render.js';

const BASE_FILE = {
  name:        '1234567890_施工现场.jpg',
  displayName: '施工现场.jpg',
  size:        4200000,
  uploadedAt:  '2026-05-22T07:00:00.000Z',
  type:        'image',
  thumb:       '/thumbs/1234567890_施工现场.jpg',
};

const PROJECT_ID  = 'proj-001';
const CATEGORY_ID = 'cat-001';

// ── 结构测试 ──────────────────────────────────────────────────────
test('type-badge 是 file-card 直接子元素，不在 file-info 内', () => {
  const html = buildFileCardHtml(BASE_FILE, PROJECT_ID, CATEGORY_ID, false);

  // file-info 内不能有 type-badge
  const fileInfoBlock = html.match(/<div class="file-info">([\s\S]*?)<\/div>\s*$/)?.[1] ?? '';
  assert.ok(
    !fileInfoBlock.includes('type-badge'),
    'type-badge 不应出现在 .file-info 内部'
  );

  // 卡片 HTML 中存在 type-badge
  assert.ok(html.includes('type-badge'), '卡片 HTML 中应存在 type-badge');
});

test('file-actions 是 file-card 直接子元素，不在 file-info 内', () => {
  const html = buildFileCardHtml(BASE_FILE, PROJECT_ID, CATEGORY_ID, false);

  const fileInfoBlock = html.match(/<div class="file-info">([\s\S]*?)<\/div>\s*$/)?.[1] ?? '';
  assert.ok(
    !fileInfoBlock.includes('file-actions'),
    'file-actions 不应出现在 .file-info 内部'
  );
  assert.ok(html.includes('file-actions'), '卡片 HTML 中应存在 file-actions');
});

test('file-info 只包含 file-name 和 file-meta', () => {
  const html = buildFileCardHtml(BASE_FILE, PROJECT_ID, CATEGORY_ID, false);

  const m = html.match(/<div class="file-info">([\s\S]*?)<\/div>(?=\s*$)/);
  const inner = m?.[1] ?? html; // fallback 让断言失败
  assert.ok(inner.includes('file-name'), 'file-info 应包含 file-name');
  assert.ok(inner.includes('file-meta'), 'file-info 应包含 file-meta');
  assert.ok(!inner.includes('type-badge'), 'file-info 不应包含 type-badge');
  assert.ok(!inner.includes('file-actions'), 'file-info 不应包含 file-actions');
});

test('有 thumb 时：img src 指向 /thumbs/ 路径', () => {
  const html = buildFileCardHtml(BASE_FILE, PROJECT_ID, CATEGORY_ID, false);
  assert.ok(
    html.includes('src="/thumbs/'),
    'thumb 存在时 img src 应指向 /thumbs/'
  );
});

test('无 thumb 时：展示 file-thumb-placeholder，不是空 div', () => {
  const fileNoThumb = { ...BASE_FILE, thumb: null };
  const html = buildFileCardHtml(fileNoThumb, PROJECT_ID, CATEGORY_ID, false);
  assert.ok(
    html.includes('file-thumb-placeholder'),
    '无 thumb 时应展示 file-thumb-placeholder'
  );
  assert.ok(
    !html.includes('<img'),
    '无 thumb 时不应有 img 标签'
  );
});

// ── 管理员模式 ────────────────────────────────────────────────────
test('管理员模式：btn-delete-card 存在于 file-actions 内', () => {
  const html = buildFileCardHtml(BASE_FILE, PROJECT_ID, CATEGORY_ID, true);
  assert.ok(html.includes('btn-delete-card'), '管理员模式应包含删除按钮');

  // 删除按钮应在 file-actions 内，通过顺序判断
  const actionsIdx = html.indexOf('file-actions');
  const deleteIdx  = html.indexOf('btn-delete-card');
  assert.ok(deleteIdx > actionsIdx, 'btn-delete-card 应在 file-actions 之后（即其内部）');
});

test('非管理员模式：不含 btn-delete-card', () => {
  const html = buildFileCardHtml(BASE_FILE, PROJECT_ID, CATEGORY_ID, false);
  assert.ok(!html.includes('btn-delete-card'), '非管理员不应有删除按钮');
});

// ── 下载链接 ──────────────────────────────────────────────────────
test('下载链接指向正确的 API 路径', () => {
  const html = buildFileCardHtml(BASE_FILE, PROJECT_ID, CATEGORY_ID, false);
  const expected = `/api/download/${PROJECT_ID}/${CATEGORY_ID}/${BASE_FILE.name}`;
  assert.ok(html.includes(expected), `下载链接应包含 ${expected}`);
});
