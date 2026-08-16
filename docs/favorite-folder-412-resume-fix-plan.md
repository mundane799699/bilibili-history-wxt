# 单收藏夹同步 HTTP 412 与断点续传修复方案

> 状态：已实现，待真实账号手工验收
> 第一阶段范围：收藏夹列表中单个收藏夹的“同步”入口
> 延期范围：“同步所有收藏夹”、自动分批恢复、跨收藏夹任务调度
> 主要文件：`entrypoints/background.ts`、`components/FavoriteFolderSyncModal.tsx`、`utils/types/index.ts`

## 1. 结论

第一阶段只修复 `syncFavoriteFolder`，不修改 `syncAllFavoriteFolders`。

单收藏夹同步已经具备基础分页 checkpoint：每页成功入库后会保存 `nextPage`，同步失败时也不会主动清空进度。因此本阶段不需要重写同步框架，重点补齐以下行为：

1. 正确识别 HTTP 412 和接口业务码 `-412`。
2. 遇到风控后立即停止请求，不再等待 2 秒后重试。
3. 保留失败页 checkpoint，并进入带冷却时间的 `paused` 状态。
4. 冷却结束后，用户点击“继续同步”时从失败页继续。
5. 页面关闭、扩展后台被回收或浏览器重启后，仍可读取并继续该断点。

这个范围可以直接解决“大收藏夹同步到第 89 页被风控，稍后继续时不再从第 1 页开始”的问题，同时避免引入多收藏夹下标、失败列表和跨收藏夹恢复状态机。

## 2. 范围

### 2.1 本阶段包含

- `syncFavoriteFolder` 消息处理器。
- `FavoriteFolderSyncProgress` 的暂停、错误和恢复语义。
- `fetchFavoriteFolderPage` 对单收藏夹调用所需的错误分类。
- `FavoriteFolderSyncModal` 的暂停提示、倒计时和继续按钮。
- 单收藏夹增量同步、全量同步的断点恢复。
- 后台进程中断后的手动恢复。

### 2.2 本阶段不包含

- 不修复 `syncAllFavoriteFolders` 当前会覆盖失败页断点的问题。
- 不修改 `AllFavoriteFoldersSyncProgress` 和 `AllFavoriteFoldersSyncModal`。
- 不增加“每同步 N 页自动停一批”的调度器。
- 不使用 `browser.alarms` 自动恢复，冷却结束后由用户手动继续。
- 不实现取消正在执行的请求。
- 不保证完全避免 B 站风控，只保证停止请求、保留进度和安全恢复。

因此，用户需要从收藏夹列表点击目标收藏夹旁的“同步”按钮，而不是使用“同步所有”。界面文案应在适当位置说明这一点，避免误以为两个入口都已支持断点恢复。

## 3. 当前实现评估

### 3.1 已经可复用的能力

当前单收藏夹路径已有以下正确基础：

- `isSameFolderCheckpoint` 会校验收藏夹 ID 和同步模式。
- `syncFavoriteFolderResources` 使用 `checkpoint.nextPage` 作为起始页。
- 每页资源先写入 IndexedDB，再把 `nextPage` 推进到下一页。
- 请求失败后，`handleSyncFavoriteFolder` 会基于当前进度写入 `status = "error"`，不会重置页码。
- 全量同步只有完整拉取后才会清理本地已取消收藏的记录。
- `getFavoriteFolderSyncProgress` 能把失去内存任务的 `syncing` 进度识别为中断。

例如，第 88 页成功后 checkpoint 为 `nextPage = 89`。第 89 页请求失败时没有新的进度提交，因此错误状态仍保留 `nextPage = 89`，再次使用同一收藏夹和同一模式同步时可以从第 89 页开始。

### 3.2 需要修复的问题

1. 当前所有请求错误都执行一次“2 秒后重试”，HTTP 412 也不例外。
2. 只根据 `response.ok` 和普通 `Error` 传递错误，无法区分风控、认证、网络和服务端错误。
3. B 站可能通过 HTTP 412，也可能通过 JSON `code = -412` 表示风控，当前没有统一识别。
4. 进度状态只有 `syncing | success | error`，界面无法表达“进度安全、等待冷却后继续”。
5. 当前 checkpoint 有效性要求 `nextPage > 1`。第一页触发 412 时虽然从第 1 页重试不会漏数据，但会丢失暂停状态的连续性，不利于执行冷却限制。
6. 页面收到失败响应后只显示普通错误，没有明确告诉用户将从哪一页继续。
7. 页间固定等待 500ms，对于上百页的大收藏夹仍然属于持续高频请求。

## 4. 目标行为

```text
idle ──开始同步──> syncing ──全部完成──> success
                       │
                       ├── 412/-412 ──> paused ──冷却结束并点击继续──> syncing
                       │
                       ├──普通错误───> error ──点击重试──────────> syncing
                       │
                       └──后台中断───> interrupted ──点击继续────> syncing
```

`paused`、`error` 和 `interrupted` 都保留 `nextPage`。只有 `success` 或用户明确选择“放弃进度并重新开始”时才清除 checkpoint。

## 5. 数据与消息契约

### 5.1 扩展单收藏夹进度

只修改 `FavoriteFolderSyncProgress`，不修改全部收藏夹进度类型：

```ts
export type FavoriteFolderSyncProgressStatus =
  "syncing" | "paused" | "interrupted" | "success" | "error";

export type FavoriteFolderSyncErrorKind =
  "rate_limited" | "auth" | "network" | "server" | "data" | "unknown";

export interface FavoriteFolderSyncProgress {
  folderId: number;
  folderTitle: string;
  mode: "incremental" | "full";
  status: FavoriteFolderSyncProgressStatus;
  currentPage: number;
  nextPage: number;
  processedItems: number;
  totalItems: number;
  onlineResourceIds: number[];
  startedAt: number;
  updatedAt: number;
  message?: string;
  errorKind?: FavoriteFolderSyncErrorKind;
  retryAfter?: number;
  rateLimitCount?: number;
}
```

新增字段全部可选，旧版本保存的进度无需数据迁移。读取旧进度时，缺失字段按普通 `error` 处理。

### 5.2 扩展单收藏夹响应

```ts
export type SyncFavoriteFolderResponse =
  | {
      success: true;
      message: string;
      folderId: number;
      mode: "incremental" | "full";
    }
  | {
      success: false;
      error: string;
      status?: "paused" | "interrupted" | "error";
      nextPage?: number;
      retryAfter?: number;
    };
```

可选字段保证旧调用方兼容。前端仍以持久化 progress 为权威来源，响应字段用于减少消息返回和 storage change 之间的短暂 UI 闪烁。

## 6. 后台修复

### 6.1 增加可分类请求错误

在 `background.ts` 内增加轻量错误类型，不引入新的依赖：

```ts
class FavoriteFolderRequestError extends Error {
  constructor(
    message: string,
    readonly kind: FavoriteFolderSyncErrorKind,
    readonly status?: number,
  ) {
    super(message);
  }
}
```

`fetchFavoriteFolderPage` 按以下顺序分类：

| 条件                                 | `kind`         | 处理方式               |
| ------------------------------------ | -------------- | ---------------------- |
| HTTP 412、429                        | `rate_limited` | 立即抛出，不做页内重试 |
| JSON `code === -412`                 | `rate_limited` | 立即抛出，不做页内重试 |
| HTTP 401、403                        | `auth`         | 立即抛出，提示重新登录 |
| HTTP 5xx                             | `server`       | 有上限地退避重试       |
| `AbortError`、`TypeError` 等网络失败 | `network`      | 有上限地退避重试       |
| 响应数据结构非法                     | `data`         | 不自动重试             |
| 其他错误                             | `unknown`      | 保留原始错误消息       |

普通网络错误和 5xx 最多尝试 3 次，建议等待 `2s -> 5s` 并加少量随机抖动。412/-412 不进入这个循环，避免立即重复撞击风控。

### 6.2 进入暂停状态

`handleSyncFavoriteFolder` 捕获 `rate_limited` 后：

1. 重新读取最新 progress。
2. 保留 `currentPage`、`nextPage`、`processedItems` 和 `onlineResourceIds`。
3. 写入 `status = "paused"`、`errorKind = "rate_limited"`。
4. 写入 `retryAfter`。
5. 返回带 `status = "paused"` 的失败响应。

第一阶段建议采用保守但简单的阶梯冷却：

```ts
const RATE_LIMIT_COOLDOWNS = [10, 30, 60] as const; // 分钟
```

- 第一次 412：10 分钟。
- 同一断点再次 412：30 分钟。
- 后续再次 412：60 分钟。
- 成功完成同步后清零计数。

这些时间是产品默认值，不是 B 站官方限额。后续可根据实际验收调整。

### 6.3 开始同步前检查冷却

读取 progress 后，先判断是否为同一收藏夹和同一模式，再检查 `paused`：

```ts
const isSameTask = previousProgress?.folderId === folderId && previousProgress.mode === mode;

if (
  isSameTask &&
  previousProgress.status === "paused" &&
  previousProgress.retryAfter &&
  Date.now() < previousProgress.retryAfter
) {
  sendResponse({
    success: false,
    status: "paused",
    error: previousProgress.message || "收藏夹同步正在冷却",
    nextPage: previousProgress.nextPage,
    retryAfter: previousProgress.retryAfter,
  });
  return;
}
```

冷却未结束时不能创建同步 Promise，也不能发出任何 B 站请求。

checkpoint 校验调整为：

- 状态不是 `success`。
- 收藏夹 ID 和同步模式一致。
- `nextPage >= 1`。

移除当前 `nextPage > 1` 限制，使第一页触发风控时也能保留同一任务的暂停信息。

### 6.4 每页提交顺序保持不变

继续沿用以下安全顺序：

1. 请求 `nextPage`。
2. 校验响应。
3. 将本页写入 IndexedDB。
4. IndexedDB 写入完成后更新 `currentPage` 和 `nextPage`。
5. 持久化 progress。
6. 等待页间隔后进入下一页。

如果进程在步骤 3 和步骤 5 之间被回收，恢复后会重复请求同一页。资源保存使用覆盖语义，因此这是安全的“至少一次”处理；不能在写入成功前提前推进 `nextPage`，否则可能永久漏页。

### 6.5 降低请求频率

第一阶段不实现复杂的自动分批调度，只把固定 500ms 页间隔改为 1.5～3 秒随机间隔：

```ts
const FAVORITE_PAGE_DELAY_MIN_MS = 1_500;
const FAVORITE_PAGE_DELAY_MAX_MS = 3_000;
```

这样不需要 alarm 或新的批次状态，同时可以避免长时间使用完全固定、高频的请求节奏。该调整不能保证不再出现 412，因此断点和暂停仍是必要能力。

### 6.6 后台进程中断

`handleGetFavoriteFolderSyncProgress` 发现存储状态为 `syncing`，但内存中没有对应 Promise 时，将状态写为 `interrupted`，而不是普通 `error`：

```ts
{
  ...progress,
  status: "interrupted",
  message: `同步任务已中断，可从第 ${progress.nextPage} 页继续`,
  updatedAt: Date.now(),
}
```

继续时复用相同 checkpoint，不自动回到第 1 页。

## 7. 前端修复

`FavoriteFolderSyncModal` 增加 `paused` 和 `interrupted` 的展示，不修改全部收藏夹弹窗。

### 7.1 暂停态

展示信息：

```text
触发 B 站访问风控，已暂停同步
进度已保存，将从第 89 页继续
建议等待 09:42 后再继续

[关闭] [继续同步（09:42）]
```

- 冷却期间禁用“继续同步”按钮并显示倒计时。
- 倒计时只负责界面刷新；后台仍必须校验 `retryAfter`，不能信任前端。
- 允许关闭弹窗，关闭不能清除 checkpoint。
- 冷却结束后按钮文案变为“从第 N 页继续”。

### 7.2 普通错误与中断态

- 普通错误：显示“从第 N 页重试”。
- 后台中断：显示“从第 N 页继续”。
- 点击后保留当前同步模式并再次发送同一 `syncFavoriteFolder` 请求。
- `handleSync` 开始时可以清空 React 本地的 `progress`，但不能删除 storage 中的 checkpoint。

### 7.3 成功与放弃进度

- 同步成功并关闭结果弹窗时，可以清除该单收藏夹 checkpoint。
- 本阶段可以暂不增加“放弃进度”按钮；用户切换同步模式时会开启一个新任务并覆盖旧 checkpoint。
- 如果后续增加“放弃进度”，必须要求用户明确确认，避免误删全量同步积累的 `onlineResourceIds`。

## 8. 全量同步安全

单收藏夹全量同步恢复时必须保留此前页面积累的 `onlineResourceIds`。只有满足以下条件才允许清理本地已取消收藏的数据：

- 已从 checkpoint 的 `nextPage` 继续并明确到达线上末页。
- 所有页面响应和本地写入均成功。
- `onlineResourceIds` 包含本次任务中恢复前和恢复后的完整线上 ID 集合。

在 412、网络错误、认证失败、数据异常或后台中断状态下，一律跳过删除。

现阶段继续把 `onlineResourceIds` 保存在 `browser.storage.local`，避免为第一阶段引入 IndexedDB schema 迁移。如果超大收藏夹出现明显的 storage 写入性能问题，再单独设计临时 ID 表。

## 9. 实施清单

### P0：单收藏夹可恢复

1. 扩展 `FavoriteFolderSyncProgressStatus` 和响应类型。
2. 增加请求错误分类，同时识别 HTTP 412 和业务码 `-412`。
3. 412 时立即停止，并保留失败页为 `paused`。
4. 开始任务前校验 `retryAfter`。
5. checkpoint 允许 `nextPage === 1`。
6. 后台失活状态改为 `interrupted`。
7. 弹窗显示失败页、暂停原因、倒计时和继续按钮。

### P1：降低风控概率

1. 页间隔调整为 1.5～3 秒随机等待。
2. 普通网络错误和 5xx 使用有上限的指数退避。
3. 同一断点重复 412 时逐级增加冷却时间。

### 延期任务

- “同步所有收藏夹”的失败页断点覆盖修复。
- 跨收藏夹的 `currentFolderIndex` 状态。
- 每 N 页自动分批暂停。
- 使用 `browser.alarms` 自动恢复。
- 大型全量同步的 IndexedDB 临时 ID 表。

## 10. 测试与验收

### 10.1 必测场景

1. **第 89 页 HTTP 412**：只请求一次第 89 页；progress 为 `paused`、`nextPage = 89`。
2. **JSON `code = -412`**：行为与 HTTP 412 一致。
3. **冷却期间点击继续**：不得产生任何网络请求。
4. **冷却结束继续**：第一个请求必须是原失败页第 89 页。
5. **第一页触发 412**：保留 `nextPage = 1` 和暂停状态，冷却后仍从第 1 页开始。
6. **关闭并重新打开弹窗**：暂停原因、页码和冷却时间仍然存在。
7. **重载扩展/后台失活**：原 `syncing` 状态转为 `interrupted`，继续时从保存页开始。
8. **普通网络错误**：按上限退避重试；最终失败后保留当前页。
9. **切换收藏夹**：A 收藏夹的断点不能用于 B 收藏夹。
10. **切换同步模式**：全量断点不能用于增量同步，反之亦然。
11. **全量同步暂停**：不得删除本地旧数据；继续到末页后才允许清理。
12. **重复页幂等**：模拟入库后、保存 checkpoint 前中断，恢复后不能产生重复记录。
13. **同步成功**：显示成功结果，关闭后清除单收藏夹 checkpoint。

### 10.2 验收日志

开发环境可以增加不含 Cookie 的结构化日志：

```ts
console.info("[favorite-folder-sync] request", {
  folderId,
  page,
  mode,
  attempt,
});
```

实现后执行：

```bash
pnpm compile
pnpm build
```

手工验收重点观察请求页码、storage checkpoint、IndexedDB 资源数量，以及全量同步暂停时是否错误删除本地资源。

## 11. 后续扩展到“同步所有”

单收藏夹方案稳定后，可以复用以下能力到“同步所有”：

- 请求错误分类。
- `paused`、`retryAfter` 和阶梯冷却。
- 页级 checkpoint 提交顺序。
- 暂停态 UI 文案和倒计时组件。

届时只需额外解决跨收藏夹位置 `currentFolderIndex`，以及当前失败后统一收尾会重置 `nextPage` 的问题。这样可以把复杂度集中在多收藏夹编排，而不再重复调试底层分页和 412 处理。
