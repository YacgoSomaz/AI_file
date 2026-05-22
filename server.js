const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;
const BASE_DIR = path.join(__dirname, 'uploads');
const CHAT_FILE = path.join(__dirname, 'chat.json');
const CARDS_FILE = path.join(__dirname, 'cards.json');

const ADMIN = { username: '莫钦麟', password: '4genanhaiziM' };
const META_FILE = path.join(__dirname, 'metadata.json');

const ZONES = [
  { id: 'zone1', name: '第一组' },
  { id: 'zone2', name: '第二组' },
  { id: 'zone3', name: '第三组' },
  { id: 'zone4', name: '第四组' },
  { id: 'zone5', name: '第五组' },
];

// 初始化目录和数据文件
ZONES.forEach(z => {
  const dir = path.join(BASE_DIR, z.id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
if (!fs.existsSync(CHAT_FILE)) fs.writeFileSync(CHAT_FILE, '[]', 'utf8');
if (!fs.existsSync(CARDS_FILE)) fs.writeFileSync(CARDS_FILE, '[]', 'utf8');
if (!fs.existsSync(META_FILE)) fs.writeFileSync(META_FILE, '{}', 'utf8');

function loadMeta() { return JSON.parse(fs.readFileSync(META_FILE, 'utf8')); }
function saveMeta(m) { fs.writeFileSync(META_FILE, JSON.stringify(m), 'utf8'); }

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'filehost-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// 图片缩略图公开（供列表预览），完整下载需鉴权
app.use('/uploads', express.static(BASE_DIR));

function fixUtf8(str) {
  try { return Buffer.from(str, 'latin1').toString('utf8'); } catch { return str; }
}

const ALLOWED_EXT = /\.(png|jpg|jpeg|xlsx|xls|pptx|ppt)$/i;

function makeUpload(zoneId) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, path.join(BASE_DIR, zoneId)),
      filename: (req, file, cb) => {
        const original = fixUtf8(file.originalname);
        const ext = path.extname(original);
        const base = path.basename(original, ext).replace(/[<>:"/\\|?*]/g, '_');
        cb(null, `${Date.now()}_${base}${ext}`);
      }
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      ALLOWED_EXT.test(path.extname(fixUtf8(file.originalname))) ? cb(null, true) : cb(new Error('只支持 PNG、JPG、Excel、PPT'));
    }
  });
}

// ── 卡密工具 ──────────────────────────────────────────────
function loadCards() { return JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8')); }
function saveCards(cards) { fs.writeFileSync(CARDS_FILE, JSON.stringify(cards, null, 2), 'utf8'); }

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join('');
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

// ── 管理员登录 ────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN.username && password === ADMIN.password) {
    req.session.isAdmin = true;
    req.session.unlocked = true; // 管理员自动解锁下载
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: '用户名或密码错误' });
  }
});

app.post('/api/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });
app.get('/api/me', (req, res) => res.json({ isAdmin: !!req.session.isAdmin, unlocked: !!req.session.unlocked }));

// ── 卡密验证（普通用户解锁下载）─────────────────────────
app.post('/api/card/verify', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: '请输入卡密' });
  const cards = loadCards();
  const idx = cards.findIndex(c => c.code === code.toUpperCase().trim());
  if (idx === -1) return res.status(401).json({ error: '卡密无效或已失效' });
  const card = cards[idx];

  // 检查次数
  if (card.maxUses > 0 && card.usedCount >= card.maxUses) {
    return res.status(401).json({ error: '该卡密次数已用完' });
  }

  // 记录使用
  cards[idx].usedCount += 1;
  cards[idx].lastUsed = new Date().toISOString();
  saveCards(cards);

  req.session.unlocked = true;
  req.session.unlockedBy = code.toUpperCase().trim();
  res.json({ ok: true, label: card.label });
});

// ── 卡密管理（管理员）────────────────────────────────────
function adminOnly(req, res, next) {
  if (!req.session.isAdmin) return res.status(403).json({ error: '需要管理员权限' });
  next();
}

// 查看所有卡密
app.get('/api/cards', adminOnly, (req, res) => res.json(loadCards()));

// 生成卡密
app.post('/api/cards', adminOnly, (req, res) => {
  const { label = '未命名', maxUses = 0, customCode } = req.body;
  const cards = loadCards();

  let code;
  if (customCode && customCode.trim()) {
    code = customCode.trim().toUpperCase();
    if (!/^[A-Z0-9\-]{1,24}$/.test(code)) return res.status(400).json({ error: '卡密只能包含字母、数字和短横线，最长24位' });
    if (cards.find(c => c.code === code)) return res.status(400).json({ error: '该卡密已存在' });
  } else {
    code = genCode();
  }

  const card = {
    code,
    label: String(label).slice(0, 30),
    maxUses: Number(maxUses) || 0,
    usedCount: 0,
    createdAt: new Date().toISOString(),
    lastUsed: null
  };
  cards.push(card);
  saveCards(cards);
  res.json(card);
});

// 删除卡密
app.delete('/api/cards/:code', adminOnly, (req, res) => {
  const cards = loadCards().filter(c => c.code !== req.params.code);
  saveCards(cards);
  res.json({ ok: true });
});

// ── 受保护的文件下载端点 ──────────────────────────────────
app.get('/api/download/:zoneId/:name', (req, res) => {
  if (!req.session.unlocked && !req.session.isAdmin) {
    return res.status(403).json({ error: '请先使用卡密解锁' });
  }
  const zone = ZONES.find(z => z.id === req.params.zoneId);
  if (!zone) return res.status(404).end();
  const name = path.basename(req.params.name);
  const filePath = path.join(BASE_DIR, zone.id, name);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.download(filePath, name.replace(/^\d+_/, ''));
});

// ── 分区 ──────────────────────────────────────────────────
app.get('/api/zones', (req, res) => res.json(ZONES));

// ── 上传（无需鉴权）──────────────────────────────────────
ZONES.forEach(zone => {
  app.post(`/api/upload/${zone.id}`, (req, res) => {
    makeUpload(zone.id).single('file')(req, res, err => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: '未收到文件' });
      if (req.session.isAdmin) {
        const meta = loadMeta();
        meta[req.file.filename] = { featured: true };
        saveMeta(meta);
      }
      res.json({ filename: req.file.filename, originalname: fixUtf8(req.file.originalname) });
    });
  });
});

// ── 文件列表 ──────────────────────────────────────────────
app.get('/api/files/:zoneId', (req, res) => {
  const zone = ZONES.find(z => z.id === req.params.zoneId);
  if (!zone) return res.status(404).json({ error: '分区不存在' });
  const dir = path.join(BASE_DIR, zone.id);
  const meta = loadMeta();
  const files = fs.readdirSync(dir).map(name => {
    const stat = fs.statSync(path.join(dir, name));
    const ext = path.extname(name).toLowerCase();
    return {
      name,
      displayName: name.replace(/^\d+_/, ''),
      size: stat.size,
      mtime: stat.mtime,
      type: ['.png', '.jpg', '.jpeg'].includes(ext) ? 'image' : ['.pptx', '.ppt'].includes(ext) ? 'ppt' : 'excel',
      featured: !!(meta[name] && meta[name].featured)
    };
  }).sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
  res.json(files);
});

// ── 删除（仅管理员）──────────────────────────────────────
app.delete('/api/files/:zoneId/:name', adminOnly, (req, res) => {
  const zone = ZONES.find(z => z.id === req.params.zoneId);
  if (!zone) return res.status(404).json({ error: '分区不存在' });
  const name = path.basename(req.params.name);
  const filePath = path.join(BASE_DIR, zone.id, name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });
  fs.unlinkSync(filePath);
  const meta = loadMeta();
  delete meta[name];
  saveMeta(meta);
  res.json({ ok: true });
});

// ── 聊天 ──────────────────────────────────────────────────
app.get('/api/chat/history', (req, res) => {
  const msgs = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'));
  res.json(msgs.slice(-200));
});

function loadMsgs() { return JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8')); }
function saveMsgs(msgs) { fs.writeFileSync(CHAT_FILE, JSON.stringify(msgs), 'utf8'); }

io.on('connection', socket => {
  socket.on('chat:send', ({ nickname, text }) => {
    if (!nickname || !text || typeof text !== 'string') return;
    const clean = text.trim().slice(0, 500);
    const nick = String(nickname).trim().slice(0, 20) || '匿名';
    if (!clean) return;
    const msg = { id: Date.now(), nickname: nick, text: clean, time: new Date().toISOString() };
    const msgs = loadMsgs();
    msgs.push(msg);
    if (msgs.length > 500) msgs.splice(0, msgs.length - 500);
    saveMsgs(msgs);
    io.emit('chat:message', msg);
  });

  socket.on('chat:delete', ({ id, adminPassword }) => {
    if (adminPassword !== ADMIN.password) return;
    saveMsgs(loadMsgs().filter(m => m.id !== id));
    io.emit('chat:deleted', { id });
  });
});

app.use((err, req, res, next) => res.status(400).json({ error: err.message }));

server.listen(PORT, () => console.log(`莫钦麟专属站运行在 http://0.0.0.0:${PORT}`));
