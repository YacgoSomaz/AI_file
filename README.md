# 公司内部文件管理系统

公司内部使用的文件管理平台，用于管理项目现场照片、视频、设计海报及文档资料。

## 功能

- 按项目 → 分类 → 文件三层结构组织
- 支持图片（JPG/PNG/WebP）、视频（MP4/MOV）、文档（PDF/DOCX/XLSX/PPTX）
- 图片缩略图、视频首帧预览
- 拖拽上传，显示进度
- 按文件名搜索、按日期筛选
- 管理员卡密登录后可删除文件

## 技术栈

- 后端：Node.js + Express
- 前端：原生 HTML/CSS/JS
- 实时通信：Socket.io
- 缩略图：sharp（图片）+ ffmpeg（视频）

## 本地启动

```bash
npm install
node server.js
```

访问 http://localhost:3000

## 目录结构

```
filehost/
├── server.js          # 后端主文件
├── public/            # 前端静态文件
│   ├── index.html
│   ├── app.js
│   └── style.css
├── uploads/           # 上传文件存储（不纳入 git）
│   └── {项目}/{分类}/
└── data/              # 项目元数据
```
