import express        from 'express';
import session        from 'express-session';
import multer         from 'multer';
import path           from 'node:path';
import fs             from 'node:fs';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import { makeThumbnail, IMAGE_EXTENSIONS } from './lib/thumbnail.js';
import QRCode from 'qrcode';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app       = express();
const PORT      = 5000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const THUMBS_DIR  = path.join(UPLOADS_DIR, '.thumbs');
const INBOX_DIR   = path.join(__dirname, 'inbox');
const DATA_FILE   = path.join(__dirname, 'data', 'projects.json');
const ADMIN_CODE  = 'shashasha';
const MAX_SIZE    = 500 * 1024 * 1024;
const ALLOWED_EXT = /\.(jpg|jpeg|png|webp|mp4|mov|pdf|docx|xlsx|pptx)$/i;

// ── init dirs ─────────────────────────────────────────────────────────────────
[UPLOADS_DIR, THUMBS_DIR, INBOX_DIR, path.dirname(DATA_FILE)].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ projects: [] }, null, 2));
}

// ── data helpers ──────────────────────────────────────────────────────────────
function loadData() { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function saveData(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }

function fixName(raw) {
  try { return Buffer.from(raw, 'latin1').toString('utf8'); } catch { return raw; }
}

// ── middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'fm-internal-secret-x9k2',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/thumbs',  express.static(THUMBS_DIR));
app.use('/inbox',   express.static(INBOX_DIR));

function adminOnly(req, res, next) {
  if (!req.session.isAdmin) return res.status(403).json({ error: '需要管理员权限' });
  next();
}

// ── QR code ──────────────────────────────────────────────────────────────────
app.get('/api/qr', async (req, res) => {
  const data = req.query.data;
  if (!data) return res.status(400).json({ error: '缺少 data 参数' });
  try {
    const png = await QRCode.toBuffer(data, { width: 240, margin: 2 });
    res.set('Content-Type', 'image/png').send(png);
  } catch (e) {
    res.status(500).json({ error: '生成失败' });
  }
});

// ── auth ──────────────────────────────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  if (req.body.code === ADMIN_CODE) {
    req.session.isAdmin = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: '卡密错误' });
  }
});
app.post('/api/admin/logout', (req, res) => {
  req.session.isAdmin = false;
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => res.json({ isAdmin: !!req.session.isAdmin }));

// ── projects ──────────────────────────────────────────────────────────────────
app.get('/api/projects', (req, res) => {
  const data = loadData();
  const result = data.projects.map(p => {
    let fileCount = 0;
    p.categories.forEach(c => {
      const dir = path.join(UPLOADS_DIR, p.id, c.id);
      if (fs.existsSync(dir)) fileCount += fs.readdirSync(dir).length;
    });
    return { id: p.id, name: p.name, createdAt: p.createdAt, categoryCount: p.categories.length, fileCount };
  });
  res.json(result);
});

app.post('/api/projects', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: '项目名称不能为空' });
  const data    = loadData();
  const project = { id: uuidv4(), name, createdAt: new Date().toISOString(), categories: [] };
  data.projects.push(project);
  saveData(data);
  fs.mkdirSync(path.join(UPLOADS_DIR, project.id), { recursive: true });
  res.json(project);
});

app.delete('/api/projects/:id', adminOnly, (req, res) => {
  const data = loadData();
  const idx  = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '项目不存在' });
  const dir = path.join(UPLOADS_DIR, data.projects[idx].id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  data.projects.splice(idx, 1);
  saveData(data);
  res.json({ ok: true });
});

// ── categories ────────────────────────────────────────────────────────────────
app.get('/api/projects/:projectId/categories', (req, res) => {
  const data    = loadData();
  const project = data.projects.find(p => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: '项目不存在' });
  const cats = project.categories.map(c => {
    const dir = path.join(UPLOADS_DIR, project.id, c.id);
    const fileCount = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
    return { id: c.id, name: c.name, createdAt: c.createdAt, fileCount };
  });
  res.json({ project: { id: project.id, name: project.name }, categories: cats });
});

app.post('/api/projects/:projectId/categories', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: '分类名称不能为空' });
  const data    = loadData();
  const project = data.projects.find(p => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: '项目不存在' });
  const category = { id: uuidv4(), name, createdAt: new Date().toISOString() };
  project.categories.push(category);
  saveData(data);
  fs.mkdirSync(path.join(UPLOADS_DIR, project.id, category.id), { recursive: true });
  res.json(category);
});

app.delete('/api/projects/:projectId/categories/:categoryId', adminOnly, (req, res) => {
  const data    = loadData();
  const project = data.projects.find(p => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: '项目不存在' });
  const idx = project.categories.findIndex(c => c.id === req.params.categoryId);
  if (idx === -1) return res.status(404).json({ error: '分类不存在' });
  const dir = path.join(UPLOADS_DIR, project.id, req.params.categoryId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  project.categories.splice(idx, 1);
  saveData(data);
  res.json({ ok: true });
});

// ── files ─────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOADS_DIR, req.params.projectId, req.params.categoryId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const name = fixName(file.originalname);
    const ext  = path.extname(name);
    const base = path.basename(name, ext).replace(/[<>:"/\\|?*\s]/g, '_');
    cb(null, `${Date.now()}_${base}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    const name = fixName(file.originalname);
    ALLOWED_EXT.test(path.extname(name)) ? cb(null, true) : cb(new Error('不支持的文件格式'));
  }
});

app.post('/api/upload/:projectId/:categoryId', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  const data     = loadData();
  const project  = data.projects.find(p => p.id === req.params.projectId);
  const category = project && project.categories.find(c => c.id === req.params.categoryId);
  if (!project || !category) return res.status(404).json({ error: '项目或分类不存在' });

  const ext = path.extname(req.file.filename).toLowerCase();
  let thumb = null;

  if (IMAGE_EXTENSIONS.has(ext)) {
    // 图片同步生成缩略图（sharp ~200ms），响应前缩略图已就绪，前端刷新后立即显示
    const thumbName = await makeThumbnail(req.file.path, req.file.filename, THUMBS_DIR);
    thumb = thumbName ? `/thumbs/${thumbName}` : null;
  } else {
    // 视频/文档异步生成，不阻塞响应
    makeThumbnail(req.file.path, req.file.filename, THUMBS_DIR).catch(() => {});
  }

  res.json({
    filename: req.file.filename,
    originalname: fixName(req.file.originalname),
    size: req.file.size,
    thumb,
  });
});

app.get('/api/projects/:projectId/categories/:categoryId/files', (req, res) => {
  const data     = loadData();
  const project  = data.projects.find(p => p.id === req.params.projectId);
  const category = project && project.categories.find(c => c.id === req.params.categoryId);
  if (!project || !category) return res.status(404).json({ error: '项目或分类不存在' });

  const dir   = path.join(UPLOADS_DIR, req.params.projectId, req.params.categoryId);
  const empty = { project: { id: project.id, name: project.name }, category: { id: category.id, name: category.name }, files: [] };
  if (!fs.existsSync(dir)) return res.json(empty);

  const { search, dateFrom, dateTo } = req.query;
  let files = fs.readdirSync(dir).map(name => {
    const stat      = fs.statSync(path.join(dir, name));
    const ext       = path.extname(name).toLowerCase();
    const thumbName = name.replace(/\.[^.]+$/, '.jpg');
    let type = 'doc';
    if (IMAGE_EXTENSIONS.has(ext)) type = 'image';
    else if (['.mp4', '.mov'].includes(ext)) type = 'video';
    return {
      name,
      displayName: name.replace(/^\d+_/, ''),
      size: stat.size,
      uploadedAt: stat.mtime.toISOString(),
      type,
      thumb: fs.existsSync(path.join(THUMBS_DIR, thumbName)) ? `/thumbs/${thumbName}` : null
    };
  });

  if (search) {
    const q = search.toLowerCase();
    files = files.filter(f => f.displayName.toLowerCase().includes(q));
  }
  if (dateFrom) files = files.filter(f => new Date(f.uploadedAt) >= new Date(dateFrom));
  if (dateTo)   files = files.filter(f => new Date(f.uploadedAt) <= new Date(dateTo + 'T23:59:59'));
  files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

  res.json({ project: { id: project.id, name: project.name }, category: { id: category.id, name: category.name }, files });
});

app.delete('/api/projects/:projectId/categories/:categoryId/files/:filename', adminOnly, (req, res) => {
  const safe     = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, req.params.projectId, req.params.categoryId, safe);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });
  fs.unlinkSync(filePath);
  const thumbPath = path.join(THUMBS_DIR, safe.replace(/\.[^.]+$/, '.jpg'));
  if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  res.json({ ok: true });
});

app.get('/api/download/:projectId/:categoryId/:filename', (req, res) => {
  const safe     = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, req.params.projectId, req.params.categoryId, safe);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.download(filePath, safe.replace(/^\d+_/, ''));
});

// ── inbox（自由空间）────────────────────────────────────────────────────────────
const inboxUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, INBOX_DIR),
    filename: (_req, file, cb) => {
      const name = fixName(file.originalname);
      const ext  = path.extname(name);
      const base = path.basename(name, ext).replace(/[<>:"/\\|?*\s]/g, '_');
      cb(null, `${Date.now()}_${base}${ext}`);
    }
  }),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    const name = fixName(file.originalname);
    ALLOWED_EXT.test(path.extname(name)) ? cb(null, true) : cb(new Error('不支持的文件格式'));
  }
});

// 上传到自由空间（无需登录）
app.post('/api/inbox/upload', inboxUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  const ext = path.extname(req.file.filename).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) {
    makeThumbnail(req.file.path, req.file.filename, THUMBS_DIR).catch(() => {});
  }
  res.json({ filename: req.file.filename, originalname: fixName(req.file.originalname) });
});

// 列出自由空间文件（无需登录）
app.get('/api/inbox/files', (_req, res) => {
  const files = fs.readdirSync(INBOX_DIR).map(name => {
    const stat    = fs.statSync(path.join(INBOX_DIR, name));
    const ext     = path.extname(name).toLowerCase();
    const thumbName = name.replace(/\.[^.]+$/, '.jpg');
    let type = 'doc';
    if (IMAGE_EXTENSIONS.has(ext)) type = 'image';
    else if (['.mp4', '.mov'].includes(ext)) type = 'video';
    return {
      name,
      displayName: name.replace(/^\d+_/, ''),
      size: stat.size,
      uploadedAt: stat.mtime.toISOString(),
      type,
      thumb: fs.existsSync(path.join(THUMBS_DIR, thumbName)) ? `/thumbs/${thumbName}` : null
    };
  }).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  res.json(files);
});

// 归类：将自由空间文件移动到指定项目/分类（仅管理员）
app.post('/api/inbox/classify', adminOnly, (req, res) => {
  const { filename, projectId, categoryId } = req.body;
  if (!filename || !projectId || !categoryId) return res.status(400).json({ error: '缺少参数' });
  const safe = path.basename(filename);
  const src  = path.join(INBOX_DIR, safe);
  if (!fs.existsSync(src)) return res.status(404).json({ error: '文件不存在' });
  const data     = loadData();
  const project  = data.projects.find(p => p.id === projectId);
  const category = project && project.categories.find(c => c.id === categoryId);
  if (!project || !category) return res.status(404).json({ error: '目标项目或分类不存在' });
  const destDir = path.join(UPLOADS_DIR, projectId, categoryId);
  fs.mkdirSync(destDir, { recursive: true });
  fs.renameSync(src, path.join(destDir, safe));
  res.json({ ok: true });
});

// 删除自由空间文件（仅管理员）
app.delete('/api/inbox/files/:filename', adminOnly, (req, res) => {
  const safe = path.basename(req.params.filename);
  const fp   = path.join(INBOX_DIR, safe);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: '文件不存在' });
  fs.unlinkSync(fp);
  const thumbPath = path.join(THUMBS_DIR, safe.replace(/\.[^.]+$/, '.jpg'));
  if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  res.json({ ok: true });
});

// 自由空间文件下载
app.get('/api/inbox/download/:filename', (req, res) => {
  const safe = path.basename(req.params.filename);
  const fp   = path.join(INBOX_DIR, safe);
  if (!fs.existsSync(fp)) return res.status(404).end();
  res.download(fp, safe.replace(/^\d+_/, ''));
});

// ── error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => res.status(400).json({ error: err.message }));

app.listen(PORT, () => console.log(`文件管理系统运行在 http://0.0.0.0:${PORT}`));
