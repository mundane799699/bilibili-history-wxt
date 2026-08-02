# 历史记录页手动同步设计方案（评审稿）

> 状态：Implemented，待手工验收
> 目标版本：待定
> 本文同时作为实现说明与验收依据。

## 1. 结论

在 `pages/History.tsx` 顶部操作区新增“同步历史记录”按钮。点击后打开模态框，用户可选择是否执行全量同步；同步期间在弹窗内展示进行中状态，完成后展示后台返回结果，并自动刷新历史列表和总记录数。

本次继续复用原 Popup 的后台消息协议：

```ts
browser.runtime.sendMessage({
  action: "syncHistory",
  isFullSync,
});
```

不在历史页面直接调用 B 站接口，也不复制 `background.ts` 中的同步逻辑。

## 2. 背景与现状

Git 工作区中原 `entrypoints/popup/App.tsx` 已被删除，但可以从 `HEAD` 读取到原行为：

- 默认选择增量同步，允许勾选“全量同步”。
- 点击后向 background 发送 `syncHistory` 消息。
- 同步期间禁用操作并显示“同步中...”。
- 根据后台响应展示成功消息或错误原因。
- 页面初始化时读取 `lastSync`，展示上次同步时间或“尚未同步过历史记录”。

当前 `pages/History.tsx` 已有：

- 顶部固定工具栏及刷新按钮。
- `reload()`：根据分页/下拉加载模式重新读取历史列表。
- `getTotalCount()`：重新读取 IndexedDB 中的历史总数。
- 明暗主题样式基础。

当前 background 已支持并发保护与同步模式判断：

- `IS_SYNCING=true` 时拒绝新的手动同步。
- `isFullSync=true` 时强制全量同步。
- 未勾选全量同步时，已完成初始化的用户执行增量同步；从未全量同步过的用户自动执行初始化全量同步。
- 成功响应为“全量同步成功”“增量同步成功”或“全量同步初始化成功”。
- 失败响应通过 `error` 返回原因。
- `syncHistory()` 成功后写入现有 `lastSync` 时间戳。

## 3. 目标与非目标

### 3.1 目标

- Popup 删除后，用户仍可从历史记录页主动同步。
- 用户可以明确选择是否强制全量同步。
- 同步过程中避免重复提交和误关闭。
- 同步成功或失败后，在弹窗内给出明确结果。
- 成功后自动刷新列表与总数，使新数据立即可见。
- 适配现有明暗主题和窄屏布局。

### 3.2 非目标

- 不修改 B 站历史接口的游标、停止条件或数据模型。
- 不新增取消同步能力；现有后台同步没有中止协议。
- 不实现逐页同步进度条；现有历史同步没有可供页面消费的进度数据。
- 不展示“新增 N 条”之类的精确增量；现有后台响应没有该字段。
- 不恢复已删除的 Popup 入口。

## 4. 交互方案

### 4.1 顶部入口

在 `History.tsx` 顶部工具栏右侧操作区，放在日期选择器之前新增带图标的文字按钮：

```text
[ ↻ 同步历史记录 ] [日期] [列数] [刷新]
```

- 图标使用现有 `lucide-react`，建议 `CloudDownload` 或 `RefreshCw`。
- 使用文字按钮，避免与右侧仅刷新本地数据的圆形“刷新”按钮含义混淆。
- `title` 与 `aria-label` 均使用“同步历史记录”。
- 小屏时允许随顶部工具栏现有布局换行，不使用固定定位。

两个操作的语义必须保持清晰：

| 操作         | 行为                                      |
| ------------ | ----------------------------------------- |
| 同步历史记录 | 从 B 站拉取数据并写入本地 IndexedDB       |
| 刷新         | 只重新读取本地 IndexedDB，不发起 B 站同步 |

### 4.2 弹窗默认态

点击“同步历史记录”后打开居中模态框：

```text
┌────────────────────────────────────┐
│ 同步历史记录                    ×  │
│ 从 B 站拉取观看历史到本地。        │
│                                    │
│ □ 全量同步                         │
│   从最新记录开始遍历全部历史，      │
│   耗时更长；未勾选时优先增量同步。  │
│                                    │
│ 上次同步：2026/8/2 12:30:00        │
│                    [取消] [开始同步]│
└────────────────────────────────────┘
```

- `isFullSync` 每次打开默认 `false`，避免用户无意反复触发耗时较长的全量同步。
- 读取现有 `lastSync`；无记录时显示“尚未同步过历史记录”。
- 全量同步说明必须明确“更耗时”，但不暗示会清空本地数据。
- 点击遮罩、关闭按钮或“取消”关闭弹窗。
- 使用原生 `<input type="checkbox">`，或先补齐 `components/Checkbox.tsx` 的 `disabled` 能力后复用它；不能仅在视觉上禁用。

### 4.3 同步中

点击“开始同步”后：

- 设置 `isSyncing=true`，清除上一次结果。
- 向 background 发送 `action: "syncHistory"` 和当前 `isFullSync`。
- 主按钮文案改为“正在同步...”，显示旋转图标。
- 禁用复选框和提交按钮，防止重复请求。
- 禁用关闭按钮、取消按钮和遮罩关闭，避免用户误以为关闭弹窗等于取消后台同步。
- 状态文案根据选项显示“正在全量同步，请耐心等待...”或“正在同步最新历史记录...”。

background 的 `IS_SYNCING` 仍是并发控制的唯一权威来源。即使页面状态因竞态未及时更新，后台也会拒绝第二个任务并返回“同步正在进行中，请稍后再试”。

### 4.4 同步完成

成功时在原弹窗中展示成功结果：

```text
✓ 增量同步成功
  完成时间：2026/8/2 12:35:12
  当前本地共 12,345 条记录
                              [完成]
```

处理顺序：

1. 接收 `response.success === true`。
2. 保存后台返回的 `response.message`，不在前端重新猜测实际同步模式。
3. 并行执行 `getTotalCount()` 与 `reload()`。
4. 读取并展示新的本地总数和完成时间。
5. 保持弹窗打开，直到用户点击“完成”或关闭按钮。

`reload()` 沿用当前行为：分页模式回到第 1 页，下拉加载模式重置列表；当前关键词、日期和分类筛选保持不变。因此同步后新增记录不符合当前筛选条件时，列表可以不变化，但总数会更新。

失败时展示错误结果：

```text
! 同步失败
  未找到 B 站登录信息，请先登录 B 站
                    [关闭] [重试]
```

- 优先展示后台 `response.error`。
- 消息通道异常或抛出异常时展示 `Error.message`，否则回退为“未知错误”。
- 失败后不自动刷新历史列表和总数。
- “重试”保留当前全量同步选项，再次发送请求。

## 5. 状态模型

建议使用明确的阶段字段，避免多个布尔值组合出矛盾状态：

```ts
type SyncPhase = "idle" | "syncing" | "success" | "error";

interface SyncResult {
  message: string;
  completedAt?: number;
  totalHistoryCount?: number;
}
```

功能新增状态（主要由 `HistorySyncModal` 持有，`isSyncModalOpen` 由 `History` 持有）：

```ts
const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
const [isFullSync, setIsFullSync] = useState(false);
const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
```

状态转换：

```text
关闭 ──点击顶部按钮──> idle
idle ──开始同步─────> syncing
syncing ──成功──────> success
syncing ──失败──────> error
error ──重试────────> syncing
idle/success/error ──关闭──> 关闭
```

每次从关闭态重新打开时，重置为 `idle`、取消全量勾选并重新读取上次同步时间，避免展示过期结果。

## 6. 消息与存储契约

为避免 `any` 扩散，建议在 `utils/types/index.ts` 增加页面与 background 共用的类型：

```ts
export interface SyncHistoryRequest {
  action: "syncHistory";
  isFullSync: boolean;
}

export type SyncHistoryResponse =
  { success: true; message: string } | { success: false; error: string };
```

存储键保持向后兼容：

```ts
export const HISTORY_LAST_SYNC = "lastSync";
```

- 在 `utils/constants.ts` 增加常量，但底层字符串仍为 `lastSync`，无需迁移旧数据。
- 页面通过 `getStorageValue<number | null>(HISTORY_LAST_SYNC, null)` 读取。
- `background.ts` 将现有直接调用 `browser.storage.local.set({ lastSync: ... })` 改为 `setStorageValue(HISTORY_LAST_SYNC, Date.now())`，符合仓库统一存储约定。

不改变既有 background 响应字段，避免影响其他潜在调用方。

## 7. 组件与文件改动

推荐把弹窗拆成组件，避免继续扩大已经较长的 `History.tsx`：

### 7.1 新增 `components/HistorySyncModal.tsx`

职责：

- 渲染弹窗、全量同步选择、同步中状态和结果状态。
- 发送 `syncHistory` 消息。
- 读取上次同步时间。
- 成功后调用父组件传入的 `onSyncSuccess`，由父组件刷新列表和总数。

建议 Props：

```ts
interface HistorySyncModalProps {
  open: boolean;
  onClose: () => void;
  onSyncSuccess: () => Promise<number>;
}
```

`onSyncSuccess()` 等待 `reload()` 和总数读取完成，并返回刷新后的总数，供结果区展示。为此，`History.tsx` 中的 `reload()` 需要把 `loadPage()` 或 `loadHistory()` 的 Promise 返回给调用方，不能只触发后立即返回。

### 7.2 修改 `pages/History.tsx`

- 在顶部右侧区域增加同步按钮。
- 管理 `isSyncModalOpen`。
- 渲染 `HistorySyncModal`。
- 将总数刷新逻辑改为返回最新 count，供弹窗展示；保留现有刷新按钮行为。

### 7.3 修改 `utils/constants.ts`

- 新增 `HISTORY_LAST_SYNC = "lastSync"`。

### 7.4 修改 `utils/types/index.ts`

- 新增同步请求和响应类型。

### 7.5 修改 `entrypoints/background.ts`

- 使用共用的请求/响应类型收窄 `handleSyncHistory` 的 `any`。
- 使用 `HISTORY_LAST_SYNC` 与 `setStorageValue` 写入完成时间。
- 不改动 `syncHistory()` 的同步算法和现有返回文案。

## 8. 样式与可访问性

- 弹窗视觉沿用 `UpdateNoticeModal`：`fixed inset-0 z-50`、半透明遮罩、`max-w-md`、明暗主题边框和背景。
- 弹窗容器使用 `role="dialog"`、`aria-modal="true"`，标题通过 `aria-labelledby` 关联。
- 打开后把焦点放到弹窗标题或第一个可操作控件。
- 非同步状态下支持 `Escape` 关闭；同步中拦截关闭。
- 成功/错误结果区使用 `aria-live="polite"`；同步状态可使用 `role="status"`。
- 所有图标按钮必须包含可读的 `aria-label`。
- 成功与失败不能只靠颜色区分，同时展示图标和文字。

本次不引入新的 CSS 文件，使用 TailwindCSS 与现有 `animate-in` 类完成样式。

## 9. 异常与边界处理

| 场景                         | 预期行为                                                             |
| ---------------------------- | -------------------------------------------------------------------- |
| 用户未登录 B 站              | 展示后台返回的登录错误，允许关闭或重试                               |
| 定时同步正在运行             | 展示“同步正在进行中，请稍后再试”，不刷新列表                         |
| 快速重复点击开始同步         | 页面按钮禁用；后台 `IS_SYNCING` 再做一次保护                         |
| 全量同步耗时较长             | 弹窗保持同步中，禁止关闭，不承诺伪进度                               |
| `sendMessage` 抛错或无响应   | 进入 error 状态并显示可读的兜底错误                                  |
| 同步成功但列表刷新失败       | 同步结果仍标记成功，同时提示“数据已同步，但页面刷新失败，请手动刷新” |
| 当前筛选不包含新数据         | 保持筛选；总数更新，结果说明本地总数，不宣称当前列表新增             |
| 页面在同步时被浏览器直接关闭 | 后台任务继续；重新打开后可从 `lastSync` 判断上次成功时间             |

## 10. 验收标准

### 10.1 功能

- [ ] 历史页顶部存在明确的“同步历史记录”按钮，且与本地刷新按钮容易区分。
- [ ] 点击按钮打开弹窗，默认不勾选全量同步。
- [ ] 勾选全量同步后发送的消息包含 `isFullSync: true`；未勾选时为 `false`。
- [ ] 同步期间不能重复提交、切换选项或通过弹窗控件关闭。
- [ ] 成功时展示 background 返回的原始成功文案、完成时间和刷新后的本地总数。
- [ ] 成功后历史列表和顶部总数自动刷新。
- [ ] 失败时展示具体错误，不刷新列表，并允许使用原选项重试。
- [ ] 弹窗打开时可看到上次成功同步时间；从未成功同步时显示对应空状态。
- [ ] 分页和下拉加载两种模式下，同步成功后的刷新行为正确。

### 10.2 兼容与质量

- [ ] 明暗主题下弹窗、按钮、禁用态和结果态均清晰可读。
- [ ] 窄屏下顶部操作区和弹窗没有横向溢出。
- [ ] 键盘可操作，非同步状态可用 `Escape` 关闭，焦点不会落到遮罩后的页面。
- [ ] 现有 `lastSync` 数据无需迁移即可继续显示。
- [ ] `pnpm compile` 通过。
- [ ] `pnpm format:check` 通过。

## 11. 实施顺序

1. 增加存储常量与消息类型，不改变运行行为。
2. 新增 `HistorySyncModal`，实现 idle/syncing/success/error 状态。
3. 在 `History.tsx` 接入顶部按钮和成功后的数据刷新。
4. 收窄 background 类型并统一 `lastSync` 存储写法。
5. 执行类型检查、格式检查，并手动覆盖增量、全量、未登录、同步冲突和刷新失败场景。

## 12. 评审关注点

请重点确认以下产品取舍：

1. 同步中禁止关闭弹窗，因为当前没有真正的取消同步能力。
2. 全量同步每次打开弹窗都默认关闭，不持久化用户上次选择。
3. 成功后保留当前筛选条件，但列表回到第 1 页/顶部。
4. 本期只展示后台已有的结果文案与本地总数，不扩展后台去统计精确新增、更新条数。
