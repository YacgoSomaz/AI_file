/**
 * 缩略图生成测试
 *
 * 测试目标：
 *   1. 图片上传后，缩略图必须在上传响应返回前已生成
 *   2. 文件列表接口立即返回 thumb URL（不需要刷新）
 *   3. 视频缩略图生成是异步的（不阻塞响应）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THUMBS_DIR = path.join(__dirname, '..', 'uploads', '.thumbs');

// ── 直接测试 makeThumbnail 函数 ───────────────────────────────────
test('图片缩略图：sharp 生成后文件存在于 .thumbs 目录', async () => {
  // 动态 import server 模块中导出的 makeThumbnail
  // （server.js 需要 export makeThumbnail 才能被测试，见 fix 计划）
  const { makeThumbnail } = await import('../lib/thumbnail.js');

  const testImg  = path.join(__dirname, 'fixtures', 'test.png');
  const thumbName = 'test.jpg';
  const thumbPath = path.join(THUMBS_DIR, thumbName);

  // 清理旧缩略图
  if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);

  // Act
  const result = await makeThumbnail(testImg, 'test.png');

  // Assert: 返回了缩略图文件名
  assert.equal(result, thumbName, '应返回缩略图文件名');

  // Assert: 文件真实存在
  assert.ok(fs.existsSync(thumbPath), '缩略图文件应存在于 .thumbs 目录');

  // Assert: 文件大小合理（至少 1KB，不超过 100KB for 400px）
  const stat = fs.statSync(thumbPath);
  assert.ok(stat.size > 1000,   '缩略图应大于 1KB');
  assert.ok(stat.size < 102400, '缩略图应小于 100KB');
});

test('视频文件：makeThumbnail 失败时静默返回 null（不崩溃）', async () => {
  const { makeThumbnail } = await import('../lib/thumbnail.js');

  // 传一个不存在的文件
  const result = await makeThumbnail('/nonexistent/fake.mp4', 'fake.mp4');

  assert.equal(result, null, '失败时应返回 null 而不是 throw');
});

test('已存在的缩略图：再次调用直接返回，不重新生成', async () => {
  const { makeThumbnail } = await import('../lib/thumbnail.js');

  const testImg  = path.join(__dirname, 'fixtures', 'test.png');
  const thumbPath = path.join(THUMBS_DIR, 'test.jpg');

  // 确保缩略图已存在
  if (!fs.existsSync(thumbPath)) {
    await makeThumbnail(testImg, 'test.png');
  }
  const mtimeBefore = fs.statSync(thumbPath).mtimeMs;

  // 再次调用
  await makeThumbnail(testImg, 'test.png');
  const mtimeAfter = fs.statSync(thumbPath).mtimeMs;

  assert.equal(mtimeBefore, mtimeAfter, '已存在时不应重新写入文件');
});
