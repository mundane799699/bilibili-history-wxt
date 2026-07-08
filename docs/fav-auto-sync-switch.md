# 设计文档：收藏夹自动同步开关

## 需求

在设置页「同步删除：B站 -> 插件」卡片下方新增「自动同步收藏夹」开关：

- 开关开启时，background 才会按 `FAV_SYNC_INTERVAL` 定时自动同步收藏夹。
- 默认关闭。
- 不影响手动触发的收藏夹同步（`syncFavorites` 消息）和首次安装时的初始化全量同步。

## 方案

沿用现有 `WEBDAV_AUTO_SYNC_ENABLED` 的开关模式，最小化改动：

### 1. utils/constants.ts

新增存储键：

```ts
export const FAV_AUTO_SYNC_ENABLED = "favAutoSyncEnabled"; // 默认 false
```

### 2. entrypoints/background.ts

在 `onAlarm` 的 `syncFavorites` 分支里，在「收藏夹功能已隐藏」检查之后增加开关检查：

```ts
const autoSyncEnabled = await getStorageValue(FAV_AUTO_SYNC_ENABLED, false);
if (!autoSyncEnabled) return;
```

未开启时直接跳过，不消耗 `FAV_SYNC_TIME_REMAIN` 计数。

### 3. pages/Settings.tsx

在「同步删除：B站 -> 插件」卡片后新增同样式的开关卡片：

- 标题：自动同步收藏夹
- 描述：开启后按设定间隔自动同步收藏夹
- state：`isFavAutoSync`，从 `getStorageValue(FAV_AUTO_SYNC_ENABLED, false)` 加载，切换时 `setStorageValue` 持久化。

## 影响面

- 仅新增一个 storage key 与一处 alarm 分支判断，不改动 `syncFavorites` 本身、手动同步消息、WebDAV 同步逻辑。
- 存量用户升级后开关为关闭状态（默认 false），收藏夹自动同步将停止，需手动开启。
