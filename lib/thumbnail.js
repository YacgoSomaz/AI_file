/**
 * lib/thumbnail.js
 * 缩略图生成逻辑（从 server.js 提取，便于独立测试）
 */
import path from 'node:path';
import fs   from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_THUMBS_DIR = path.join(__dirname, '..', 'uploads', '.thumbs');
import ffmpeg from 'fluent-ffmpeg';

try {
  const installer = await import('@ffmpeg-installer/ffmpeg');
  ffmpeg.setFfmpegPath(installer.default.path);
} catch { /* ffmpeg 不可用时跳过视频缩略图 */ }

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO_EXTS = new Set(['.mp4', '.mov']);

/**
 * 生成缩略图，已存在则直接返回文件名，失败返回 null。
 * @param {string} filePath   源文件绝对路径
 * @param {string} storedName 存储文件名（含时间戳前缀）
 * @param {string} thumbsDir  缩略图目录绝对路径
 * @returns {Promise<string|null>} 缩略图文件名，或 null
 */
export async function makeThumbnail(filePath, storedName, thumbsDir = DEFAULT_THUMBS_DIR) {
  if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });
  const ext       = path.extname(storedName).toLowerCase();
  const thumbName = storedName.replace(/\.[^.]+$/, '.jpg');
  const thumbPath = path.join(thumbsDir, thumbName);

  if (fs.existsSync(thumbPath)) return thumbName;

  try {
    if (IMAGE_EXTS.has(ext)) {
      await sharp(filePath)
        .resize(400, null)
        .jpeg({ quality: 72 })
        .toFile(thumbPath);
      return thumbName;
    }

    if (VIDEO_EXTS.has(ext)) {
      await new Promise((resolve, reject) => {
        ffmpeg(filePath)
          .screenshots({ timestamps: [1], filename: thumbName, folder: thumbsDir, size: '400x?' })
          .on('end', resolve)
          .on('error', reject);
      });
      return thumbName;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[thumbnail] 生成失败:', storedName, e.message);
  }
  return null;
}

export const IMAGE_EXTENSIONS = IMAGE_EXTS;
