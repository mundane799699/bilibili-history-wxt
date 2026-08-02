# 收藏夹列表单文件夹手动同步方案（评审稿）

> 状态：已实现，待手工验收
> 涉及入口：`pages/Favorites.tsx` 左侧收藏夹列表
> 参考实现：`pages/History.tsx`、`components/HistorySyncModal.tsx`

## 1. 结论

在 `Favorites.tsx` 当前约第 107 行的每个收藏夹列表项内增加“同步”按钮。点击按钮后打开该收藏夹专属的同步弹窗，用户必须在“增量同步”和“全量同步”之间选择，确认后仅同步被点击收藏夹的资源。

本次不直接在页面调用 B 站接口。页面通过新的、带 `folderId` 和 `isFullSync` 的后台消息触发同步，后台复用现有收藏夹请求、入库及全量清理逻辑，但把资源遍历范围收窄到指定收藏夹。

## 2. 当前实现与必要改动

当前收藏夹同步能力不能直接满足需求：

- `Favorites.tsx` 仅从 IndexedDB 读取收藏夹与资源，没有同步入口。
- `background.ts` 的 `syncFavorites(isFullSync)` 固定获取并遍历全部收藏夹。
- 现有 `syncFavorites` 消息处理器不读取 `folderId`，也不尊重调用方选择的 `isFullSync`：它只根据全局 `HAS_FULL_FAV_SYNC` 决定模式。
- `IS_SYNCING_FAV` 是收藏资源同步任务共用的互斥状态，适合继续用于防止手动同步和首次初始化同步并发执行。

因此需要新增“单收藏夹同步”消息入口，而不是改变原有 `syncFavorites` 的全量收藏夹语义，避免影响首次安装和潜在旧调用方。

## 3. 用户交互

### 3.1 收藏夹列表按钮

每个收藏夹列表项调整为“信息区 + 同步按钮”布局：

```text
┌────────────────────────┐
│ 收藏夹名称      [同步] │
│ 123 个内容             │
└────────────────────────┘
```

- 按钮使用 `type="button"`，图标建议使用 `CloudDownload`，并保留文字“同步”，避免与“选择收藏夹”混淆。
- `title` 和 `aria-label` 包含收藏夹名称，例如“同步收藏夹：稍后再看”。
- 点击同步按钮必须调用 `event.stopPropagation()`，不能触发外层列表项的 `onClick`，因此同步未选中的收藏夹时不会切换右侧当前内容。
- 收藏夹列表项继续保留原来的点击选中行为和选中态颜色。
- 列表宽度仅为 `w-64`，名称容器使用 `min-w-0 flex-1` 和 `truncate`，同步按钮使用 `shrink-0`，避免长标题挤掉按钮。

### 3.2 弹窗默认态

弹窗标题明确包含目标收藏夹名称：

```text
┌─────────────────────────────────────┐
│ 同步收藏夹                       ×  │
│ 「稍后再看」                         │
│                                     │
│ ● 增量同步          ○ 全量同步       │
│   同步到本地边界       遍历全部内容   │
│                                     │
│                       [取消] [确认同步]│
└─────────────────────────────────────┘
```

- 每次打开默认选择“增量同步”，与当前收藏夹定时同步的默认行为一致。
- 使用两个 radio 选项卡，而不是容易产生歧义的单个“全量同步”复选框。
- 增量同步说明：从最新一页开始向后翻页，检测到当前页首尾资源均已存在于该收藏夹本地数据时停止；不会清理本地旧记录。
- 全量同步说明：遍历该收藏夹全部分页，并在成功获取全部线上数据后清理该收藏夹中已取消收藏的本地记录，耗时较长。
- 弹窗交互、明暗主题、焦点进入/还原、Tab 焦点约束和 Escape 关闭行为参考 `HistorySyncModal`。

### 3.3 同步中与结果态

确认后：

- 弹窗进入 `syncing` 状态并显示“正在增量同步「收藏夹名」...”或“正在全量同步「收藏夹名」...”。
- 禁用模式选项、确认按钮、关闭按钮、取消按钮和遮罩关闭，防止重复提交，也避免让用户误以为关闭弹窗会取消后台任务。
- 当前后台没有取消协议，本次不增加中止同步功能。

成功后：

- 展示后台返回的成功消息，例如“「稍后再看」增量同步成功”。
- 重新读取收藏夹列表，使 `media_count` 等线上元数据可更新。
- 仅当同步目标正好是右侧当前选中的收藏夹时，重新读取该收藏夹资源；同步其他收藏夹时不切换当前选中项，也不刷新无关资源列表。
- 刷新目标资源时保留关键词和搜索类型，并回到第 1 页，行为与历史页同步后回到首屏一致。
- 若后台同步成功但页面刷新失败，仍显示同步成功，同时附加“数据已同步，但页面刷新失败，请手动刷新”的提示。

失败后：

- 展示后台 `error`；消息通道异常时展示 `Error.message`，没有可用信息时回退为“未知错误”。
- 提供“重试”按钮，并保留当前目标收藏夹和同步模式。
- 不刷新本地列表。

## 4. 前端状态与组件划分

### 4.1 `pages/Favorites.tsx`

页面仅持有弹窗目标和负责成功后的数据刷新：

```ts
const [syncTargetFolder, setSyncTargetFolder] = useState<FavoriteFolder | null>(null);
```

列表按钮：

```tsx
<button
  type="button"
  onClick={(event) => {
    event.stopPropagation();
    setSyncTargetFolder(folder);
  }}
>
  同步
</button>
```

弹窗通过 `syncTargetFolder !== null` 判断是否打开，关闭后清空目标。同步成功回调建议为：

```ts
const handleFolderSyncSuccess = async (folderId: number) => {
  await loadFolders();
  if (selectedFolderId === folderId) {
    await loadResources(folderId, { resetSearch: false });
  }
};
```

`loadResources` 增加可选的刷新策略：正常切换收藏夹时维持现状，重置关键词和页码；同步成功刷新时保留关键词，只将页码重置为 1。

### 4.2 新增 `components/FavoriteFolderSyncModal.tsx`

不把完整弹窗继续堆入 `Favorites.tsx`，新增独立组件，并沿用 `HistorySyncModal` 的状态模型：

```ts
type SyncPhase = "idle" | "syncing" | "success" | "error";

interface FavoriteFolderSyncModalProps {
  folder: FavoriteFolder | null;
  onClose: () => void;
  onSyncSuccess: (folderId: number) => Promise<void>;
}
```

组件职责：

- 展示目标收藏夹和同步模式。
- 发送单收藏夹同步消息。
- 管理 `idle -> syncing -> success/error` 状态。
- 成功后调用父组件刷新本地数据。
- 每次目标收藏夹变化时重置为 `idle` 和默认增量同步，避免沿用上一次弹窗结果。

本次不展示“上次同步时间”，因为仓库当前只有历史记录的 `HISTORY_LAST_SYNC`，没有可靠的单收藏夹同步时间；不新增无法准确表达每个收藏夹状态的全局时间字段。

## 5. 消息契约

在 `utils/types/index.ts` 新增类型：

```ts
export interface SyncFavoriteFolderRequest {
  action: "syncFavoriteFolder";
  folderId: number;
  isFullSync: boolean;
}

export type SyncFavoriteFolderResponse =
  | {
      success: true;
      message: string;
      folderId: number;
      mode: "incremental" | "full";
    }
  | { success: false; error: string };
```

前端请求示例：

```ts
await browser.runtime.sendMessage({
  action: "syncFavoriteFolder",
  folderId: folder.id,
  isFullSync,
} satisfies SyncFavoriteFolderRequest);
```

使用独立的 `syncFavoriteFolder` action 有两个目的：

- 保留既有 `syncFavorites` 的“同步全部收藏夹”语义，首次安装以及潜在旧调用方无需迁移。
- 后台可以对单收藏夹请求强制校验 `folderId`，避免字段遗漏后意外同步所有收藏夹。

## 6. 后台实现

### 6.1 新增单收藏夹处理器

在 `entrypoints/background.ts` 增加 `handleSyncFavoriteFolder`，并在 `onMessage` 注册 `syncFavoriteFolder` 分支。

处理顺序：

1. 将 `message.folderId` 转为数字，并校验为有限正整数；无效时直接返回“收藏夹信息不完整”。
2. 校验 `message.isFullSync` 为布尔值，避免调用方省略模式后产生隐式行为。
3. 读取 `IS_SYNCING_FAV`；已有收藏同步任务时返回“收藏夹同步正在进行中，请稍后再试”。
4. 获取锁后执行指定文件夹同步，并在 `finally` 中释放锁。
5. 返回后台确认的 `folderId`、实际模式和成功消息。

锁释放必须使用局部 `syncStarted` 标志：只有当前请求真正写入过 `IS_SYNCING_FAV=true` 才能在 `finally` 中解锁。现有 `handleSyncFavorites` 在发现已有同步后提前返回，但仍会进入 `finally` 并清除其他任务的锁；实现本需求时应一并修正该竞态。

### 6.2 参数化底层同步范围

将现有 `syncFavorites` 的单文件夹资源处理部分提取为可复用函数，推荐结构：

```ts
async function syncFavoriteFolderResources(
  folder: FavoriteFolder,
  sessdata: string,
  isFullSync: boolean,
): Promise<void>;

async function syncFavoriteFolderById(
  folderId: number,
  isFullSync: boolean,
): Promise<FavoriteFolder>;

async function syncFavorites(isFullSync = false): Promise<void>;
```

- `syncFavorites` 继续获取全部收藏夹、保存全部元数据并逐个调用资源同步函数；首次安装仍执行全量同步，旧的手动全目录消息仍可执行非全量同步。非全量同步的内部行为会由“固定一页”改为本节定义的“命中本地边界后停止”。
- `syncFavoriteFolderById` 仍先获取当前登录用户和线上收藏夹列表，用 `folderId` 精确查找目标，找不到时抛出“收藏夹不存在或无权访问”。
- 单收藏夹入口只保存匹配到的收藏夹元数据，并只调用一次 `syncFavoriteFolderResources`；不读取或写入其他收藏夹资源。
- 请求 B 站资源接口时固定使用校验后的目标 `folder.id`，不信任页面传入标题、数量等展示字段。

### 6.3 同步模式语义

单收藏夹手动同步严格尊重弹窗选择：

| 模式     | 请求范围                                                | 本地清理                                           |
| -------- | ------------------------------------------------------- | -------------------------------------------------- |
| 增量同步 | 从第 1 页开始逐页请求，命中本地同步边界或到达末页时停止 | 不清理旧记录                                       |
| 全量同步 | 请求目标收藏夹全部分页                                  | 完整拉取成功后，删除目标收藏夹内线上已不存在的记录 |

单收藏夹同步不读取、也不修改 `HAS_FULL_FAV_SYNC`：该键表示“全部收藏夹是否完成过初始化全量同步”，同步一个收藏夹不能改变它。

### 6.4 增量同步停止条件

增量同步参考 `syncHistory(false)` 当前的首尾命中逻辑，但存在性判断必须限定在目标收藏夹内：

1. 同步开始前通过 `getFavResources(folder.id)` 读取该收藏夹已有资源，并生成只读的 `existingResourceIds` 集合。
2. 从第 1 页开始请求，每页最多 20 条。
3. 对非空页取 `firstItem.id` 和 `lastItem.id`，使用同步开始前的 `existingResourceIds` 判断二者是否都已存在。
4. 无论是否命中边界，都先补齐 `folder_id`、全局 `index` 等字段并保存当前页，确保本地已有资源的元数据和顺序可以更新。
5. 如果首尾均已存在，保存当前页后停止翻页；否则根据接口 `has_more` 继续下一页。
6. 如果接口返回末页或空页，则正常结束。

伪代码：

```ts
const localResources = await getFavResources(folder.id);
const existingResourceIds = new Set(localResources.map((item) => item.id));

while (hasMore) {
  const pageData = await fetchFavoriteFolderPage(folder.id, page, sessdata);
  const medias = pageData.medias ?? [];

  if (medias.length === 0) break;

  const reachedLocalBoundary =
    !isFullSync &&
    existingResourceIds.has(medias[0].id) &&
    existingResourceIds.has(medias[medias.length - 1].id);

  await saveFavResources(normalizeResources(medias, folder.id, page));

  if (reachedLocalBoundary || !pageData.has_more) break;
  page += 1;
}
```

这里使用“同步开始前”的只读 ID 集合，不把本轮刚写入的资源加入边界集合，避免把本次新数据误判为历史同步边界。也不能仅调用全局的 `checkIsFavorited(id)`，因为相同视频可能涉及不同收藏夹，边界判断必须带有 `folderId` 语义。

边界规则带来的预期行为：

- 本地该收藏夹已有数据时，通常在覆盖新内容和一页重叠数据后停止。
- 距离上次同步新增超过 20 条时，会继续请求第 2 页及后续页面，不会漏掉第一页之外的新收藏。
- 本地该收藏夹为空时，任何页都不会命中边界，会一直同步到末页；这相当于完成该收藏夹的初始化数据拉取，但非全量模式仍不执行删除清理。
- 如果旧数据存在空洞，首尾同时命中仍可能跳过页中缺失项之后的更旧页面；这是与历史记录同步一致的启发式停止条件，不承诺修复任意历史空洞，需要补全时应选择全量同步。

### 6.5 全量同步的数据安全

现有实现遇到某一页请求失败时会 `break`，随后仍可能根据不完整的 `onlineResourceIds` 执行清理。单收藏夹全量同步必须避免这种情况：

- 任意分页请求超时、HTTP 失败、B 站业务码非 0 或响应结构异常时，整次同步返回失败。
- 只有明确获取到最后一页后才标记 `allPagesFetched=true`。
- 仅在 `isFullSync && allPagesFetched` 时执行本地差集删除。
- 空收藏夹只要接口成功返回空列表，视为完整结果，可以安全清理该目标收藏夹的本地残留。
- 清理查询使用 `getFavResources(folder.id)`，只构造该收藏夹范围内的待删除 ID。

为保持行为一致，提取后的公共资源同步函数会让“同步全部收藏夹”的全量路径也获得同样的数据安全修正。

## 7. 文件改动清单

| 文件                                     | 改动                                                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pages/Favorites.tsx`                    | 每个收藏夹列表项增加同步按钮；维护同步目标；成功后按需刷新收藏夹和当前资源                                                  |
| `components/FavoriteFolderSyncModal.tsx` | 新增模式选择、同步状态、结果反馈和无障碍交互弹窗                                                                            |
| `utils/types/index.ts`                   | 新增单收藏夹同步请求/响应类型                                                                                               |
| `utils/db.ts`                            | 增加原子替换 `favFolders` 目录表的方法                                                                                      |
| `entrypoints/background.ts`              | 注册新 action；校验参数；复用收藏夹锁；提取单文件夹资源同步函数；为非全量同步增加本地边界停止逻辑；确保全量分页完整后才清理 |

不需要修改 IndexedDB schema，也不新增 storage key。收藏夹定时自动同步入口及其设置项已移除，收藏夹内容改为按文件夹手动同步。

## 8. 验收用例

### 8.1 列表与弹窗

- 每个收藏夹都显示同步按钮，长标题不会遮挡按钮。
- 点击收藏夹空白区域仍会切换右侧内容。
- 点击未选中收藏夹的同步按钮只打开对应弹窗，不改变 `selectedFolderId`。
- 弹窗中显示正确收藏夹名称，默认选中增量同步，可切换到全量同步。
- 同步期间无法重复提交或关闭弹窗；完成后可关闭。
- 深色模式、窄屏和键盘 Tab/Escape 操作正常。

### 8.2 增量同步

- 请求消息包含正确的 `folderId` 和 `isFullSync=false`。
- 后台只请求目标收藏夹资源接口，不请求其他收藏夹资源页。
- 后台从第 1 页开始逐页同步；未命中本地边界时会继续请求后续页。
- 当前页首尾资源均存在于目标收藏夹的同步前本地集合时，保存该页后停止，不再请求下一页。
- 只有首条或只有末条存在时不能提前停止。
- 本地目标收藏夹为空时同步到线上末页。
- 增量同步不删除本地旧记录。
- 同步当前选中收藏夹后，右侧内容刷新且关键词仍保留。
- 同步未选中收藏夹后，右侧当前内容和选中态不变化。

### 8.3 全量同步

- 请求消息包含正确的 `folderId` 和 `isFullSync=true`。
- 后台只遍历目标收藏夹的全部分页。
- 完整成功后只清理目标收藏夹中线上已不存在的资源，不影响其他收藏夹。
- 任意中间页失败时返回失败，且不执行差集删除。
- 线上空收藏夹完整返回后，本地该收藏夹残留可被清理。

### 8.4 并发与错误

- 首次初始化同步或另一收藏夹手动同步正在执行时，新请求被拒绝并保留原任务的锁。
- 未登录 B 站、收藏夹不存在、参数非法、接口失败和页面刷新失败均有明确反馈。
- 单收藏夹全量成功不会写入 `HAS_FULL_FAV_SYNC=true`。
- 首次安装初始化仍为全量同步；旧的全收藏夹手动同步消息在非全量模式下会按本地边界连续翻页，不再固定只请求第一页。

## 9. 实施顺序

1. 增加消息类型和后台单收藏夹同步入口。
2. 提取并验证公共的单收藏夹资源同步函数，实现非全量同步的本地边界停止逻辑，并补齐完整分页后才清理的保护。
3. 新增 `FavoriteFolderSyncModal`。
4. 在 `Favorites.tsx` 列表项接入按钮、弹窗和成功刷新。
5. 执行 `npm run compile`、`npm run format:check`，再按上述验收用例手工验证增量、全量和并发场景。

## 10. 进入页面时刷新收藏夹目录

进入 `Favorites` 页面时自动执行一次目录刷新：

1. 先读取 IndexedDB 的 `favFolders`，让已有目录可以立即显示。
2. 页面发送 `refreshFavoriteFolders` 消息。
3. 后台只请求 B 站用户信息与用户创建的收藏夹目录，不请求任何收藏夹资源分页。
4. 使用线上完整目录原子替换 IndexedDB 的 `favFolders`，确保线上已删除的目录不会继续残留。
5. 页面重新读取 `favFolders`；若原选中目录已不存在则选择新的第一个目录，线上目录为空时清空当前选择和右侧资源展示。
6. 网络请求失败时不替换目录，继续使用进入页面时读取到的本地数据。

该刷新不读写 `favResources`，不使用 `IS_SYNCING_FAV` 资源同步锁，也不会触发任何收藏夹内容同步。
