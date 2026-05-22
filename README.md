# 档案库 · Archive

> 面向团队内部使用的文件档案管理系统。支持图片、视频、文档的上传、预览与下载，以项目 → 分类 → 文件三级结构组织内容。

---

## 功能特性

### 文件管理
- **三级目录**：项目 → 分类 → 文件，结构清晰，适合多项目并行管理
- **支持格式**：JPG / PNG / WebP / MP4 / MOV / PDF / DOCX / XLSX / PPTX，单文件最大 500 MB
- **自动缩略图**：图片上传后同步生成缩略图（sharp），视频异步提取首帧（ffmpeg）
- **图片灯箱**：点击图片全屏预览

### 上传方式
- **拖拽上传**：直接把文件拖进页面
- **点击上传**：工具栏「上传文件」按钮，支持多选
- **扫码上传**：点击「扫码上传」生成二维码，手机扫码后进入专属上传页，适合现场拍照直传

上传过程在右下角浮动队列面板实时显示，最多同时并发 3 个，完成后自动收起。

### 搜索与筛选
- 实时文件名搜索（300 ms 防抖）
- 日期范围筛选（上传日期）
- 一键清除全部筛选条件

### 管理员模式
点击右上角 🔒 图标，输入管理员卡密进入管理员模式。管理员可：
- 删除单个文件
- 批量选择并删除文件
- 删除分类或整个项目（含所有文件，不可恢复）

---

## 目录结构

```
filehost-v3/
├── server.js              # Express 服务端，所有 API 路由
├── package.json
├── lib/
│   ├── thumbnail.js       # 缩略图生成（sharp + ffmpeg，纯函数）
│   └── card-render.js     # 文件卡片 HTML 构建（纯函数，便于测试）
├── public/
│   ├── index.html         # 主页面（SPA 外壳）
│   ├── app.js             # 前端逻辑（原生 JS，无框架依赖）
│   ├── style.css          # 样式（含内嵌字体）
│   └── upload.html        # 手机扫码上传专用页
├── data/
│   └── projects.json      # 项目与分类元数据
├── uploads/               # 上传文件（按 projectId/categoryId UUID 分目录）
│   └── .thumbs/           # 缩略图缓存
└── logs/
```

---

## 快速启动

### 环境要求
- Node.js 18+
- （可选）ffmpeg：用于视频缩略图，缺失时跳过，不影响其他功能

### 安装与运行

```bash
npm install
npm start
```

服务默认运行在 `http://0.0.0.0:5000`。

### 使用 PM2 守护进程（推荐生产环境）

```bash
npm install -g pm2
pm2 start server.js --name filehost
pm2 save
```

---

## API 接口

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/admin/login` | 管理员登录，body: `{ code }` |
| `POST` | `/api/admin/logout` | 退出登录 |
| `GET`  | `/api/me` | 获取当前登录状态 |

### 项目

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| `GET`    | `/api/projects` | 公开 | 获取所有项目列表 |
| `POST`   | `/api/projects` | 公开 | 新建项目，body: `{ name }` |
| `DELETE` | `/api/projects/:id` | 管理员 | 删除项目（含所有文件） |

### 分类

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| `GET`    | `/api/projects/:projectId/categories` | 公开 | 获取项目下所有分类 |
| `POST`   | `/api/projects/:projectId/categories` | 公开 | 新建分类，body: `{ name }` |
| `DELETE` | `/api/projects/:projectId/categories/:categoryId` | 管理员 | 删除分类 |

### 文件

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| `POST`   | `/api/upload/:projectId/:categoryId` | 公开 | 上传文件（multipart/form-data，字段名 `file`） |
| `GET`    | `/api/projects/:projectId/categories/:categoryId/files` | 公开 | 文件列表，支持 `?search=&dateFrom=&dateTo=` |
| `DELETE` | `/api/projects/:projectId/categories/:categoryId/files/:filename` | 管理员 | 删除单文件 |
| `GET`    | `/api/download/:projectId/:categoryId/:filename` | 公开 | 下载文件 |
| `GET`    | `/api/qr?data=<url>` | 公开 | 生成二维码图片（PNG） |

---

## 技术栈

| 层 | 技术 |
|----|------|
| 服务端 | Node.js (ES Modules) · Express · express-session · multer · uuid |
| 图像处理 | sharp（缩略图）· fluent-ffmpeg + @ffmpeg-installer/ffmpeg（视频帧） |
| 二维码 | qrcode |
| 前端 | 原生 HTML / CSS / JavaScript，无框架依赖 |
| 字体 | Instrument Serif · Manrope · JetBrains Mono · Noto Sans SC（woff2 内嵌） |

---

## 配置说明

核心配置直接写在 `server.js` 顶部：

```js
const PORT       = 5000;               // 监听端口
const MAX_SIZE   = 500 * 1024 * 1024;  // 单文件最大体积
const ADMIN_CODE = 'shashasha';        // 管理员卡密
const ALLOWED_EXT = /\.(jpg|jpeg|png|webp|mp4|mov|pdf|docx|xlsx|pptx)$/i;
```

---

## 数据存储

所有元数据保存在 `data/projects.json`，格式如下：

```json
{
  "projects": [
    {
      "id": "uuid-v4",
      "name": "项目名称",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "categories": [
        {
          "id": "uuid-v4",
          "name": "分类名称",
          "createdAt": "2025-01-01T00:00:00.000Z"
        }
      ]
    }
  ]
}
```

文件存储路径：`uploads/<projectId>/<categoryId>/<timestamp>_<filename>`

---

## 注意事项

- `uploads/` 目录不应纳入版本控制，已在 `.gitignore` 中排除
- 管理员卡密以明文存储在 `server.js`，生产环境建议改为环境变量
- 并发上传默认最多 3 个，可修改 `app.js` 中的 `MAX_CONCURRENT`
