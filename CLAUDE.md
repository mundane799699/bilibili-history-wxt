# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Bilibili 无限历史记录 — 基于 [WXT](https://wxt.dev/) + React 19 + TailwindCSS 3 的浏览器扩展（Chrome / Edge / Firefox），用于不限量保存并管理 B 站观看历史、收藏夹与喜欢的音乐，并支持 WebDAV / 自建云端 双向同步与 AI 语义检索（阿里云百炼 DashScope）。

## 常用命令

```bash
pnpm install            # 安装依赖（postinstall 会自动跑 wxt prepare）
pnpm dev                # Chrome 开发模式（输出到 .output/chrome-mv3-dev）
pnpm dev:firefox        # Firefox 开发模式
pnpm build              # Chrome 生产构建
pnpm build:firefox      # Firefox 生产构建
pnpm zip                # 打包 Chrome 上架 zip
pnpm zip:firefox        # 打包 Firefox 上架 zip
pnpm compile            # tsc --noEmit 类型检查（无单测，用它做最终校验）
pnpm format             # Prettier 写入
pnpm format:check       # Prettier 校验
```

加载本地扩展：Chrome 打开 `chrome://extensions/` → 加载已解压扩展程序 → 选择 `.output/chrome-mv3-dev`。

仓库未配置任何测试框架；改动后请至少运行 `pnpm compile` + `pnpm format:check`。`web-ext.config.ts` 中 `disabled: true`，`pnpm dev` 不会自动启动浏览器。

## 顶层架构

WXT 按目录约定生成多入口 manifest，所有入口共享同一份 IndexedDB（`bilibiliHistory`）和 `browser.storage.local` 配置。

### Entrypoints（[entrypoints/](entrypoints/)）

| 入口                                                                           | 类型                                                | 作用                                                                                                                                                        |
| ------------------------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [background.ts](entrypoints/background.ts)                                     | service worker                                      | 全部同步逻辑：B 站历史/收藏夹增量+全量同步、`browser.alarms` 定时调度、WebDAV 自动双向同步、与 content script / 页面通过 `browser.runtime.sendMessage` 通信 |
| [content.ts](entrypoints/content.ts)                                           | content script (`*.bilibili.com`, `document_start`) | 注入 `injected.js`、转发 `window.postMessage` 到 background、为 history 页面提供 `deleteHistory` RPC（需要 `bili_jct` + `SESSDATA`）                        |
| [injected.ts](entrypoints/injected.ts)                                         | unlisted page script                                | 重写 `window.fetch` 拦截 `api.bilibili.com/x/v2/history/delete`，把删除事件 `postMessage` 给 content script，从而实现 "B 站网页端删除 → 同步删除插件历史"   |
| [my-history/](entrypoints/my-history/)                                         | extension page                                      | 主 UI（`my-history.html`），用 `HashRouter` 承载 [pages/](pages/) 下所有页面（详见下方路由表）                                                              |
| [popup/](entrypoints/popup/)                                                   | browser action popup                                | 触发同步、跳转主页面                                                                                                                                        |
| [about/](entrypoints/about/), [webdav-tutorial/](entrypoints/webdav-tutorial/) | extension page                                      | 独立的关于页 / WebDAV 教程页                                                                                                                                |

manifest 在 [wxt.config.ts](wxt.config.ts) 声明，关键权限：`storage / tabs / cookies / alarms / declarativeNetRequest`，并通过 `referrer.json` 的 DNR 规则改写 Referer 让图片资源（B 站防盗链）能在扩展页面里加载。

### Background 三大同步循环

`browser.alarms` 每分钟触发，但内部用 `*_TIME_REMAIN` 计数器实现"X 分钟跑一次"，避免 alarm 抖动：

1. `syncHistory` — 调 `x/web-interface/history/cursor` 游标分页；增量同步遇到首尾两条都已在 IDB 即停。`SYNC_INTERVAL` 单位分钟，状态写到 `IS_SYNCING` / `SYNC_PROGRESS_HISTORY`。
2. `syncFavorites` — 先取 `nav` 拿 mid，再取收藏夹列表，逐夹翻页。**全量**同步会用 `onlineResourceIds` 集合 diff 本地记录、删除已取消收藏的项；**增量**只拉每个夹第一页（`AbortController` 30s 超时 + 最多 2 次重试）。
3. `syncWebDav` — 当 `WEBDAV_AUTO_SYNC_ENABLED=true` 时按 `WEBDAV_LAST_SYNC` 间隔触发 `autoSyncWebDav`：**先 download → smartMerge\*（在 [utils/db.ts](utils/db.ts)）→ upload**，避免单向覆盖丢数据。

新增 alarm 类型时记得在 `onInstalled` 里 `alarms.create` 并在 `onAlarm` 里分支处理。

### 数据层（[utils/db.ts](utils/db.ts)）

单一文件管理整套 IndexedDB（DB `bilibiliHistory`，当前 `version: 5`）。共有 4 个 store：

- `history` (keyPath `id`，索引 `view_at`)
- `likedMusic` (keyPath `bvid`，索引 `added_at`)
- `favFolders` (keyPath `id`，索引 `mid`)
- `favResources` (keyPath `id`，索引 `folder_id` / `fav_time`)

**改 schema 必须 bump `DB_CONFIG.version` 并在 `onupgradeneeded` 里写迁移分支**。当前实现里有兜底 `if (!db.objectStoreNames.contains(...))` 用来修复历史版本里 else-if 互斥导致的 store 缺失，新加 store 时也要补到这段兜底里。`smartMerge*` 系列是 WebDAV 双向同步的合并基元，不要绕开它直接 `put` 远端数据。

### 配置 / 状态键（[utils/constants.ts](utils/constants.ts)）

所有 `browser.storage.local` 的 key 都集中在这里以字符串常量导出。`UPDATE_HISTORY` 也在此维护——**发版时要同步更新它和 [package.json](package.json) 的 `version`**，侧边栏角标读 `UPDATE_HISTORY[0].version`。

读写一律走 [utils/storage.ts](utils/storage.ts) 的 `getStorageValue<T>` / `setStorageValue<T>`，不要直接 `browser.storage.local.get/set`。

### 前端（[pages/](pages/) + [components/](components/)）

- 路由由 [entrypoints/my-history/App.tsx](entrypoints/my-history/App.tsx) 用 `HashRouter` 定义：`/`(History) `/welcome` `/about` `/settings` `/feedback` `/cloud-sync` `/webdav-sync` `/favorites` `/ai-search` `/music/search` `/music/liked`。`/welcome` 不显示侧边栏。
- 侧边栏菜单在 [components/Sidebar.tsx](components/Sidebar.tsx) 写死，可被 `HIDDEN_MENUS` 隐藏；新增页面要同时改 App.tsx 的 `<Route>` 和 Sidebar 的 `menuList`。
- 状态管理：用户身份用 zustand（[utils/store.ts](utils/store.ts)）；其余页面用本地 `useState` + `browser.storage.local` 持久化。
- 图标统一 `lucide-react`，路径别名 `@/` 指向项目根（见 [tsconfig.json](tsconfig.json) 继承的 `.wxt/tsconfig.json`）。

### 远端服务（[services/](services/) + [utils/apiClient.ts](utils/apiClient.ts)）

`apiClient` 是 `axios.create({ baseURL: import.meta.env.VITE_BASE_API })`，响应拦截器直接展平到 `data`。`VITE_BASE_API` 在 `.env.development` / `.env.production` 中配置，仅"云同步"页面用。B 站官方 API 调用一律直接 `fetch`（带 `SESSDATA`），不经 axios。

### AI 搜索

[pages/AISearch.tsx](pages/AISearch.tsx) 调阿里云百炼（DashScope）兼容 OpenAI 协议的流式接口，`apiKey` 存在 `DASHSCOPE_API_KEY`，搜索历史存在 `AI_SEARCH_HISTORY`。前端把最近 N 条历史拼进 prompt 让模型做语义匹配，不依赖 background。

## 风格约定

- Prettier 配置见 [.prettierrc](.prettierrc)：100 列、双引号、尾随逗号、`arrowParens: always`。
- TS 严格模式来自 `.wxt/tsconfig.json`，`pnpm compile` 是唯一类型守卫。
- 共享类型集中在 [utils/types/index.ts](utils/types/index.ts)。新加 IDB 字段务必同步更新对应 interface（`HistoryItem` / `FavoriteFolder` / `FavoriteResource` 等）。
- TailwindCSS 3 + PostCSS；`tailwind.config.js` 的 `content` 已覆盖 `assets/entrypoints/pages/components`，新建顶层目录要补进去否则样式不会被扫描。
