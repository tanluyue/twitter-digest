# Chirp

Twitter/X 阅读伴侣 Chrome 扩展。静默追踪阅读行为，实时翻译英文推文，每日生成 AI 阅读复盘。

## 功能

- **实时翻译** — 英文推文自动翻译为中文，流式输出，翻译结果缓存
- **行为追踪** — 静默记录停留时长、点赞、收藏、点击详情等行为信号
- **每日 Digest** — AI 分析当天所有阅读内容，按话题聚类，给出跨话题洞察
- **Liked / Saved 回溯** — 侧边栏查看当天所有点赞和收藏的推文原文链接
- **翻译开关** — FAB 面板一键开关翻译

## 安装

```bash
# 安装依赖
npm install

# 构建
npm run build
```

1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `dist/` 目录

## 项目结构

```
src/
├── background/     # Service Worker（消息路由、Doubao API、Digest 生成）
├── content/        # Content Script（推文检测、行为追踪、翻译、FAB UI）
├── db/             # IndexedDB 数据层
├── shared/         # 共享常量、消息缓冲、评分算法
├── types/          # TypeScript 类型定义
├── sidepanel/      # 侧边栏（Digest / Liked / Saved）
└── popup/          # 扩展弹窗
```

## 技术栈

- Chrome Extension Manifest V3
- TypeScript + Vite + @crxjs/vite-plugin
- IndexedDB (via `idb`)
- Doubao API（豆包大模型）
- Shadow DOM（UI 样式隔离）

## 配置

API Key 默认内置。如需更换，在扩展弹窗中修改 Doubao API Key。
