# 同步所有收藏夹 HTTP 412 与跨收藏夹断点续传修复方案

> 状态：已实现，待真实账号手工验收
> 前置基础：`docs/favorite-folder-412-resume-fix-plan.md` 已实现
> 主要文件：`entrypoints/background.ts`、`components/AllFavoriteFoldersSyncModal.tsx`、`pages/Favorites.tsx`、`utils/types/index.ts`

## 1. 结论

“同步所有收藏夹”应复用单收藏夹已经实现的请求错误分类、页级 checkpoint、阶梯冷却和保守页间隔，但不能直接复用单收藏夹的单任务进度结构。全量入口还必须持久化当前收藏夹的位置，并保证“收藏夹位置”和“收藏夹内页码”一起推进。

本次修复采用以下原则：

1. 第一次遇到 HTTP 412、HTTP 429 或业务码 `-412` 时，立即停止整个批次，不再请求后续收藏夹。
2. 将任务标记为 `paused`，同时保留当前收藏夹下标、ID、失败页以及已累计的线上资源 ID。
3. 冷却期内点击继续时，后台直接返回暂停信息，不发出用户信息、收藏夹目录或收藏夹分页请求。
4. 冷却结束后由用户手动继续，从同一收藏夹的同一失败页恢复；已经完成的收藏夹不再重复同步。
5. 只有全部收藏夹真正完成后才写入 `success`。暂停、普通错误和后台中断都不得执行成功收尾或清空当前文件夹的分页 checkpoint。
6. “同步所有”也使用 1.5～3 秒随机页间隔，并在收藏夹之间增加短暂随机间隔，降低连续请求触发风控的概率。

本方案保证的是“及时停止、完整保存、安全恢复”，不能保证 B 站不再返回 412。

## 2. 当前实现的问题

底层 `fetchFavoriteFolderPage` 已经能够识别 HTTP 412、HTTP 429 和 JSON `code = -412`，并且不会对风控错误立即重试。`syncFavoriteFolderResources` 也已支持传入页级 checkpoint。因此问题主要位于 `handleSyncAllFavoriteFolders` 的跨收藏夹编排和全部收藏夹弹窗。

### 2.1 失败页断点会被统一收尾覆盖

当前代码在某个收藏夹失败时，先写入包含 `nextPage` 和 `onlineResourceIds` 的错误进度并 `break`，但离开循环后又无条件写入一次最终进度：

```text
currentFolderTitle = ""
currentPage = 0
nextPage = 1
processedItems = 0
onlineResourceIds = []
```

因此真正有用的失败页 checkpoint 只短暂存在，随即被覆盖。再次点击同步时只能从该收藏夹第 1 页开始。

### 2.2 第一收藏夹第一页失败不会被识别为 checkpoint

`isSameAllFoldersCheckpoint` 当前要求：

```ts
progress.completedCount > 0 || progress.nextPage > 1;
```

如果第一个收藏夹第 1 页触发 412，两个条件都不满足。暂停原因、重复风控次数以及同一任务身份都会丢失。

### 2.3 恢复位置依赖 `failedFolders` 和 `completedCount` 猜测

当前代码通过第一个失败收藏夹反推循环起点，再使用 `index === checkpoint.completedCount` 判断是否应用页级 checkpoint。这两个字段的职责不同，状态一旦在异常收尾或旧数据中不一致，就可能出现以下问题：

- 找到了正确收藏夹，但没有把 `nextPage` 传给它。
- 把某个收藏夹的 `onlineResourceIds` 应用到另一个收藏夹。
- 重复同步已经完成的收藏夹。
- 跳过尚未完成的收藏夹。

进度中缺少明确的 `currentFolderIndex` 和 `currentFolderId`，仅靠标题也无法校验，因为标题可能重复或被修改。

### 2.4 412 被展示为普通失败

`AllFavoriteFoldersSyncProgress.status` 只有 `syncing | success | error`：

- 后台无法表达“断点安全、等待冷却”的 `paused`。
- 没有 `retryAfter`，后台也无法阻止冷却期内再次发请求。
- 没有 `errorKind` 和 `rateLimitCount`，不能复用单收藏夹的阶梯冷却。
- 后台被回收时只能转成普通 `error`，前端无法区分中断和接口失败。

### 2.5 任务响应可能与持久化结果矛盾

当前每个收藏夹的异常在任务内部被捕获，任务最终正常 resolve。外层随后返回 `{ success: true }`，即使 storage 中最终状态是 `error`。前端只能依赖 storage change 修正显示，容易出现短暂错误状态和调用方误判。

### 2.6 全部收藏夹路径仍使用高频页间隔

`syncFavoriteFolderResources` 只有 `useConservativePageDelay = true` 时才使用 1.5～3 秒随机间隔。单收藏夹入口已经传入 `true`，当前全部收藏夹入口没有传入，仍然按固定 500ms 连续翻页，而且收藏夹切换之间没有额外间隔。

## 3. 目标状态机

```text
idle ──开始──> syncing ──全部收藏夹完成──> success
                  │
                  ├── 412/429/-412 ──> paused ──冷却结束并点击继续──> syncing
                  │
                  ├──普通错误────────> error ──点击重试──────────> syncing
                  │
                  └──后台中断────────> interrupted ──点击继续────> syncing
```

本阶段延续当前“遇到一个错误就停止批次”的策略。普通错误保存同一 checkpoint，用户重试成功后再进入后续收藏夹；不在本次修复中重新设计“跳过错误并汇总多个失败收藏夹”的策略。

### 3.1 进度不变量

非终态进度必须同时满足：

- `completedCount === currentFolderIndex`。
- `currentFolderId === folderIds[currentFolderIndex]`。
- `0 <= currentFolderIndex < totalFolders`。
- `nextPage >= 1`。
- `currentPage`、`nextPage`、`processedItems` 和 `onlineResourceIds` 只属于 `currentFolderId`。

例如 15 个收藏夹中，前 4 个已完成，第 5 个收藏夹第 89 页触发 412：

```text
status = paused
completedCount = 4
currentFolderIndex = 4
currentFolderId = 第 5 个收藏夹 ID
currentPage = 88
nextPage = 89
```

第 5 个收藏夹完成后，先原子提交为：

```text
status = syncing
completedCount = 5
currentFolderIndex = 5
currentFolderId = 第 6 个收藏夹 ID
currentPage = 0
nextPage = 1
```

只有最后一个收藏夹完成后，才允许写入 `status = success`、`completedCount = totalFolders`。

## 4. 数据与消息契约

### 4.1 扩展全部收藏夹进度

复用已有的 `FavoriteFolderSyncErrorKind`，新增独立状态类型：

```ts
export type AllFavoriteFoldersSyncProgressStatus =
  "syncing" | "paused" | "interrupted" | "success" | "error";

export interface AllFavoriteFoldersSyncProgress {
  status: AllFavoriteFoldersSyncProgressStatus;
  mode: "full" | "incremental";
  folderIds: number[];
  totalFolders: number;
  completedCount: number;

  currentFolderIndex: number;
  currentFolderId: number | null;
  currentFolderTitle: string;

  currentPage: number;
  nextPage: number;
  processedItems: number;
  totalItems: number;
  onlineResourceIds: number[];

  failedFolders: { id: number; title: string; error: string }[];
  startedAt: number;
  updatedAt: number;
  message?: string;
  errorKind?: FavoriteFolderSyncErrorKind;
  retryAfter?: number;
  rateLimitCount?: number;
}
```

`currentFolderIndex` 和 `currentFolderId` 是本次必须增加的字段。`failedFolders` 暂时保留以兼容现有 UI 和旧进度，但不能再用它推导恢复位置。

`rateLimitCount` 按整个“同步所有”任务累计，而不是按收藏夹分别计数。因为风控通常由一段时间内的整体请求密度触发，即使恢复后已经进入另一个收藏夹，也应继续使用更保守的冷却级别。任务全部成功或启动不兼容的新任务后再清零。

### 4.2 增加明确的响应类型

```ts
export type SyncAllFavoriteFoldersResponse =
  | {
      success: true;
      message: string;
      mode: "full" | "incremental";
    }
  | {
      success: false;
      error: string;
      status?: "paused" | "interrupted" | "error";
      currentFolderIndex?: number;
      currentFolderId?: number | null;
      nextPage?: number;
      retryAfter?: number;
    };
```

前端仍以 storage 中的完整 progress 为权威来源；响应字段用于让 `sendMessage` 返回后立即进入正确状态，避免等待 storage change 时出现闪烁。

### 4.3 旧进度兼容

读取旧版进度时允许做一次保守归一化：

- `currentFolderIndex` 缺失时使用合法的 `completedCount`。
- `currentFolderId` 缺失时使用 `folderIds[currentFolderIndex]`。
- `nextPage` 必须是大于等于 1 的安全整数。
- 已被旧版统一收尾覆盖成 `nextPage = 1` 的进度无法恢复原失败页，只能从对应收藏夹第 1 页重试。
- 任一身份字段矛盾时放弃旧 checkpoint，开启新任务，不能冒险把一个收藏夹的全量 `onlineResourceIds` 用到另一个收藏夹。

## 5. 后台修复

### 5.1 重写 checkpoint 校验

`isSameAllFoldersCheckpoint` 应校验：

1. 状态不是 `success`。
2. 同步模式相同。
3. `folderIds` 与本次请求的 ID 列表数量、顺序完全相同。
4. 当前收藏夹下标合法。
5. 当前收藏夹 ID 与 `folderIds[currentFolderIndex]` 一致。
6. `nextPage >= 1`。

不要再要求 `completedCount > 0 || nextPage > 1`，保证第一个收藏夹第一页触发风控也能保存和恢复。

本阶段对文件夹列表变化采用安全优先策略：新增、删除或调整顺序后，旧 checkpoint 与当前任务不兼容，重新开启一批同步。后续若要在列表变化时智能合并任务，需要单独设计任务快照与删除语义。

### 5.2 在任何 B 站请求前检查冷却

获得同一任务 checkpoint 后，先检查：

```ts
if (checkpoint.status === "paused" && checkpoint.retryAfter && Date.now() < checkpoint.retryAfter) {
  sendResponse({
    success: false,
    status: "paused",
    error: checkpoint.message || "全部收藏夹同步正在冷却",
    currentFolderIndex: checkpoint.currentFolderIndex,
    currentFolderId: checkpoint.currentFolderId,
    nextPage: checkpoint.nextPage,
    retryAfter: checkpoint.retryAfter,
  });
  return;
}
```

该判断必须位于 `startFavoriteSync` 和 `getFavoriteFoldersFromBilibili` 之前。冷却未结束时，不能创建任务 Promise，也不能请求 nav、收藏夹目录或任何资源页。

### 5.3 用显式游标驱动循环

循环起点只使用归一化后的 `checkpoint.currentFolderIndex`，不再扫描 `failedFolders`：

```ts
const startIndex = checkpoint?.currentFolderIndex ?? 0;

for (let index = startIndex; index < folders.length; index++) {
  const folder = folders[index];
  const resumeFolder =
    checkpoint?.currentFolderIndex === index && checkpoint.currentFolderId === folder.id
      ? checkpoint
      : null;

  // 先持久化当前收藏夹身份，再开始分页请求。
  // syncFavoriteFolderResources 成功后，再推进到下一个收藏夹。
}
```

每个收藏夹开始前先写入其 `index + id + title`。每页仍保持单收藏夹方案的提交顺序：请求成功、校验、IndexedDB 入库成功、推进 `nextPage`、持久化 progress。

跨收藏夹推进也必须遵循相同原则：只有当前收藏夹完整成功后才增加 `completedCount` 和 `currentFolderIndex`。如果后台恰好在收藏夹成功和游标推进之间被回收，恢复后最多重复该收藏夹的最后一页或末页探测，不会跳过数据。

### 5.4 让异常冒泡并集中写终态

移除循环内“捕获异常、写 error、break、再执行统一收尾”的控制流。建议将全部收藏夹遍历提取为一个会抛错的任务函数，外层处理器与单收藏夹入口保持一致：

- 任务函数只负责更新 `syncing` checkpoint 和在全部完成时返回。
- 任一异常向外抛出。
- 外层捕获后重新读取最新 progress，基于最新 checkpoint 写 `paused` 或 `error`。
- 只有任务函数遍历完全部收藏夹后才写 `success`。
- `sendResponse.success` 必须与最终 progress 一致。

412/429/-412 处理：

1. 使用 `normalizeFavoriteFolderRequestError` 得到 `kind = rate_limited`。
2. 不把当前收藏夹加入 `failedFolders`，因为它只是暂停而非失败。
3. 保留全部游标与页级字段。
4. 复用 `[10, 30, 60]` 分钟阶梯冷却。
5. 写入 `status = paused`、`errorKind`、`rateLimitCount` 和 `retryAfter`。
6. 返回 `success: false, status: paused`。

普通错误处理：

1. 将当前收藏夹加入或更新到 `failedFolders`。
2. 保留同一页 checkpoint。
3. 写入 `status = error` 和具体 `errorKind`。
4. 返回 `success: false, status: error`。
5. 重试成功后移除当前收藏夹的旧失败记录，再进入下一个收藏夹。

获取用户信息或收藏夹目录时发生的 412 也必须进入同一暂停分支。任务开始前应已持久化当前游标，因此即使资源分页尚未开始，也能安全地从当前收藏夹 `nextPage` 继续。

### 5.5 禁止错误路径统一清空页级状态

以下字段只允许在当前收藏夹成功、游标已推进到下一收藏夹时重置：

- `currentPage`
- `nextPage`
- `processedItems`
- `totalItems`
- `onlineResourceIds`

在 `paused`、`error` 和 `interrupted` 中一律原样保留。最终 `success` 可以把它们重置为初始值，因为成功状态不会再被识别为可恢复 checkpoint。

### 5.6 降低全批次请求频率

全部收藏夹入口调用 `syncFavoriteFolderResources` 时传入 `useConservativePageDelay = true`，复用单收藏夹的 1.5～3 秒随机页间隔。

另外增加收藏夹间隔，例如：

```ts
const FAVORITE_FOLDER_DELAY_MIN_MS = 2_000;
const FAVORITE_FOLDER_DELAY_MAX_MS = 5_000;
```

当前收藏夹成功且还有下一个收藏夹时等待该随机间隔。不要在失败、暂停或最后一个收藏夹后等待。

这些间隔是产品侧保守参数，不是 B 站官方限额。若真实验收仍频繁触发 412，再基于日志决定是否增加“每 N 页主动休息”的批次预算，不在 P0 中直接引入未经验证的固定阈值。

### 5.7 后台进程中断

`handleGetAllFavoriteFoldersSyncProgress` 发现 storage 为 `syncing`、但内存中没有对应 Promise 时，写入：

```ts
{
  ...progress,
  status: "interrupted",
  message: `同步任务已中断，可从「${progress.currentFolderTitle}」第 ${progress.nextPage} 页继续`,
  updatedAt: Date.now(),
}
```

不得重置收藏夹游标、页码或 `onlineResourceIds`。用户再次点击后沿用同一 checkpoint。

### 5.8 阻止目录刷新绕过冷却

收藏夹页面初始化时会调用 `refreshFavoriteFolders` 获取线上目录。如果全部收藏夹同步已进入冷却，页面重载不应通过该入口额外发出 B 站请求。

- `Favorites.tsx` 检测到单收藏夹或全部收藏夹处于 `syncing`、`paused`、`interrupted` 时，跳过初始化目录刷新。
- `handleRefreshFavoriteFolders` 在收藏夹同步执行中直接拒绝刷新。
- 单收藏夹或全部收藏夹仍在 `retryAfter` 冷却期时，后台直接拒绝刷新。

这样可以保证关闭弹窗、刷新页面或重新进入收藏夹页面时，不会绕过同步入口的冷却检查。

## 6. 前端修复

### 6.1 全部收藏夹弹窗增加暂停与中断态

`AllFavoriteFoldersSyncModal` 的本地阶段扩展为：

```ts
type SyncPhase = "idle" | "syncing" | "paused" | "interrupted" | "success" | "error" | "complete";
```

弹窗应以完整的 `AllFavoriteFoldersSyncProgress` 为展示依据，至少显示：

- 已完成收藏夹数 / 总收藏夹数。
- 当前收藏夹标题及其序号。
- 当前收藏夹已完成页和将恢复的页。
- 暂停原因或普通错误。
- 冷却剩余时间。

暂停态示例：

```text
触发 B 站访问风控，已暂停全部收藏夹同步
已完成 4 / 15 个收藏夹
当前「稍后再看」，进度已保存，将从第 89 页继续

[关闭] [继续同步（09:42）]
```

- 冷却期间禁用继续按钮并显示倒计时。
- 倒计时结束后按钮变为“从第 5 个收藏夹第 89 页继续”。
- 关闭暂停或错误弹窗不能删除 storage checkpoint。
- 普通错误显示“从当前收藏夹第 N 页重试”。
- 中断状态显示“从当前收藏夹第 N 页继续”。

### 6.2 发起同步时不要先清零恢复进度

当前 `handleSync` 会立即把 `completedCount` 和失败列表清零。新实现中，如果 storage 中存在兼容 checkpoint，点击继续时应保留当前展示，直到后台发出新的 `syncing` progress；只有明确开启不兼容的新任务时才显示 0 / N。

响应为 `paused`、`interrupted` 或 `error` 时，直接应用响应状态，并继续由 storage change 同步完整数据。响应为 `success` 只能表示全部收藏夹实际完成。

### 6.3 成功后的清理

保留现有成功后刷新页面数据的行为，但仅在 `status = success` 时执行 `onSyncComplete` 和移除 `ALL_FAVORITE_FOLDERS_SYNC_PROGRESS`。

`paused`、`error`、`interrupted` 或关闭弹窗都不能清除断点。若以后增加“放弃本次进度并重新开始”，必须单独提供带确认的操作，不能复用普通关闭按钮。

### 6.4 收藏夹页面的后台状态提示

`pages/Favorites.tsx` 当前只在侧栏显示 `syncing`。应补充 `paused` 和 `interrupted` 的紧凑提示，让用户关闭弹窗后仍知道任务未完成，并可通过“同步所有”按钮重新打开进度弹窗。

storage change 的页面刷新条件保持保守：

- `success`：刷新收藏夹目录和当前资源。
- `error`：可刷新已成功入库的当前页，但不要当作整批完成。
- `paused`、`interrupted`：不做整批完成处理。

## 7. 全量模式的数据安全

全部收藏夹的全量同步恢复时，`onlineResourceIds` 只属于当前收藏夹，并且必须包含该收藏夹恢复前所有成功页面累计的 ID。

只有满足以下条件才允许调用 `deleteFavResources` 清理已取消收藏的本地记录：

1. checkpoint 的 `currentFolderId` 与正在恢复的收藏夹一致。
2. 从 `nextPage` 恢复后明确到达该收藏夹线上末页。
3. 所有页面响应和本地写入均成功。
4. `onlineResourceIds` 包含恢复前与恢复后的完整集合。

在 412、普通错误或后台中断时，`syncFavoriteFolderResources` 会在到达全量清理逻辑前抛出，因此不得删除本地旧数据。身份校验失败时必须丢弃 checkpoint 并从第 1 页重新同步，不能复用可疑的 ID 集合。

## 8. 实施顺序

### P0：恢复正确性

1. 扩展 `AllFavoriteFoldersSyncProgress` 和全部同步响应类型。
2. 增加旧进度归一化与严格 checkpoint 校验。
3. 用 `currentFolderIndex + currentFolderId` 驱动跨收藏夹循环。
4. 移除失败后的统一重置和“错误任务返回成功”行为。
5. 412 时停止整批、进入阶梯冷却并保留页级状态。
6. 后台失活转为 `interrupted` 并保留断点。
7. 弹窗增加暂停、倒计时、失败页和继续按钮。
8. 侧栏补充暂停和中断提示。

### P1：降低风控概率与代码清理

1. 全部收藏夹分页启用 1.5～3 秒随机间隔。
2. 收藏夹之间增加 2～5 秒随机间隔。
3. 阻止页面目录刷新绕过活动任务和 412 冷却。
4. 增加不包含 Cookie 的结构化调试日志。

### 延期任务

- 使用 `browser.alarms` 在冷却结束后自动恢复。
- 每 N 页主动暂停的请求预算和自适应节流。
- 用户主动取消正在执行的 fetch。
- 收藏夹列表变化时合并旧任务快照。
- 跳过普通错误并继续后续收藏夹的多失败汇总策略。
- 将超大收藏夹的 `onlineResourceIds` 迁移到 IndexedDB 临时表。

## 9. 测试与验收

### 9.1 checkpoint 与 412

1. **第一个收藏夹第 1 页 HTTP 412**：状态为 `paused`，下标为 0，`nextPage = 1`，不请求第二个收藏夹。
2. **第 5 个收藏夹第 89 页 HTTP 412**：前 4 个保持完成；当前 ID、下标、页码和线上 ID 集合完整保留。
3. **JSON `code = -412`**：行为与 HTTP 412 一致。
4. **HTTP 429**：行为与 HTTP 412 一致。
5. **目录接口触发 412**：资源分页请求数为 0，仍保存当前收藏夹 checkpoint。
6. **冷却期内连续点击继续**：不得产生 nav、目录或分页请求。
7. **冷却结束继续**：第一个资源分页请求必须是原收藏夹原失败页。
8. **恢复后再次 412**：冷却从 10 分钟升级为 30 分钟，再次触发升级为 60 分钟。

### 9.2 跨收藏夹游标

1. **某收藏夹完成后中断**：恢复时从下一收藏夹第 1 页开始。
2. **页入库后、checkpoint 保存前中断**：恢复后允许重复该页，但不能漏页或产生重复记录。
3. **当前收藏夹完成后、游标推进前中断**：允许重做末页探测，不能跳过下一收藏夹。
4. **同名收藏夹**：必须按 ID 和下标恢复，不能按标题恢复。
5. **收藏夹顺序变化**：旧 checkpoint 判定为不兼容，开启新任务。
6. **同步模式变化**：全量 checkpoint 不能用于增量同步，反之亦然。
7. **旧进度缺少新字段**：合法时保守归一化；矛盾时从新任务开始且不复用 `onlineResourceIds`。

### 9.3 全量同步安全

1. **全量模式中途 412**：当前收藏夹不得清理任何本地旧记录。
2. **全量模式中断并恢复**：恢复前后的 `onlineResourceIds` 合并后才能清理。
3. **checkpoint 身份不匹配**：不得把旧 ID 集合用于当前收藏夹。
4. **全部成功**：才写 `success`，`completedCount === totalFolders`。

### 9.4 前端与响应一致性

1. 暂停时弹窗显示当前收藏夹、完成数量、恢复页和倒计时。
2. 关闭再打开弹窗后，暂停信息保持不变。
3. 浏览器重启或扩展后台被回收后，状态转为 `interrupted` 并可继续。
4. 后台 progress 为 `paused/error` 时，消息响应不能返回 `success: true`。
5. 成功前不得调用 `onSyncComplete` 或删除 storage progress。
6. 转入后台后，侧栏能显示同步中、暂停或中断状态。

### 9.5 构建检查

仓库当前没有自动化测试框架。实现后至少执行：

```bash
pnpm compile
pnpm build
```

手工验收建议在开发环境对 `fetchFavoriteFolderPage` 做临时故障注入，并记录不含 Cookie 的日志：

```ts
console.info("[all-favorite-folders-sync] checkpoint", {
  status,
  currentFolderIndex,
  currentFolderId,
  nextPage,
  completedCount,
  rateLimitCount,
});
```

重点核对网络面板中 412 后是否立即停止、恢复后的第一个请求页码、`browser.storage.local` 中的游标一致性，以及全量暂停时 IndexedDB 是否发生错误删除。

## 10. 完成标准

满足以下条件后可认为“同步所有收藏夹”的 412 修复完成：

- 任意收藏夹任意页触发 412 后，只产生一次该失败请求并立即停止整批。
- 进度能跨弹窗关闭、页面刷新、后台回收和浏览器重启保存。
- 冷却期内后台不会发出任何 B 站请求。
- 冷却后能从同一收藏夹同一页继续，已完成收藏夹不会重做。
- 全量模式在未到达末页前绝不清理本地资源。
- 前端状态、消息响应和持久化 progress 三者一致。
- TypeScript 编译与生产构建通过，并完成至少一次真实账号的多收藏夹手工验收。
