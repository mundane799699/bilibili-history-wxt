# 历史记录数量异常问题修复方案（评审稿）

> 状态：Draft，已根据评审意见修正  
> 目标版本：待定  
> 核心原则：不修改 `history` 的主键和数据语义  
> 本文只描述修改方案，不代表相关实现已经完成。

## 1. 结论

`history` 继续使用 B 站 `history.oid` 作为主键，同一视频再次观看时更新原记录的 `view_at`、进度等状态。

```text
5 月观看 oid=123  → id=123, view_at=5月
7 月再次观看      → id=123, view_at=7月
```

这个更新会让记录从 5 月筛选结果移动到 7 月，但 IndexedDB 总记录数保持不变。因此：

- `oid + put()` 符合产品语义，不是总数从几千条下降到一千多条的原因。
- 本次不引入观看事件 ID。
- 不修改 `history.keyPath = "id"`。
- 不修改现有 JSON、WebDAV 和云同步的主键语义。

真正需要修复的是：

1. 哪些路径可以物理删除本地历史。
2. Edge 清理或重建 IndexedDB 后如何检测。
3. 数据库丢失后，为什么现有同步可能补不完整。
4. 如何区分“数据真的少了”和“数据仍在但没有进入 `view_at` 索引”。
5. 如何保证本地异常时不会覆盖唯一备份。

## 2. 当前代码判断

### 2.1 不会减少已有记录的行为

以下行为不会让 `history.count()` 下降：

- 相同 `oid` 调用 `put()`：只更新原记录。
- 增量同步提前停止：可能漏掉新记录，但不会删除旧记录。
- 游标翻页错误：可能造成数据从未同步进来，但不会删除本地数据。
- WebDAV `smartMergeHistory()`：只写入或跳过，不删除本地记录。
- 历史页面分页：只影响展示数量，不改变数据库总数。
- 当前 v6 升级逻辑：没有清空或重建已经存在的 `history`。

### 2.2 能让总数下降的路径

现有代码中，能够减少 `history` 记录的路径主要有：

1. 设置页恢复出厂设置调用 `clearHistory()`。
2. 用户在插件历史页面删除记录。
3. 插件捕获 B 站网页历史删除请求后调用 `deleteHistoryItem()`。
4. Edge 清理扩展数据、扩展卸载重装、扩展 ID 或浏览器配置文件变化、IndexedDB 损坏等情况导致数据库被整体重建。
5. 用户通过 DevTools 或其他外部工具清除 IndexedDB。

其中最需要优先保护的是第 3 项。当前“B 站 → 插件同步删除”在没有设置值时默认开启，并且收到消息后直接执行物理删除。如果 B 站页面产生大量 `archive_*` 删除请求，插件可能同步删除大量视频历史。

### 2.3 看起来丢失但数据可能仍存在

历史列表使用 `view_at` 索引读取。IndexedDB 中缺少合法 `view_at` 的记录不会出现在该索引中。

因此需要区分：

```text
history objectStore 原始数量
view_at index 可见数量
当前筛选条件下的页面数量
```

如果原始数量没有下降，只是索引数量或月份筛选数量下降，就不是 IndexedDB 物理删除。

## 3. 修复目标

- 保持“一个 `oid` 一条最近观看记录”的现有语义。
- 正常同步只允许新增或更新，不能减少对象仓库总数。
- 默认不再把 B 站网页删除操作直接同步成不可恢复的本地物理删除。
- 开启同步删除后，必须校验完整业务类型和目标 ID。
- 删除操作可审计，批量删除可恢复。
- 修复混合业务历史的游标翻页和增量同步提前停止问题。
- 检测 IndexedDB 总数异常下降和 `view_at` 索引异常。
- 降低 Edge/Chromium 因配额或存储压力清理数据的风险。
- 本地数据异常时不覆盖唯一的 WebDAV 备份。

## 4. P0：堵住不可恢复的删除路径

### 4.1 默认关闭“B 站 → 插件同步删除”

以下两处默认值由 `true` 改为 `false`：

```ts
getStorageValue(IS_SYNC_DELETE_FROM_BILIBILI, false);
```

涉及：

- 后台删除处理。
- 设置页初始化。

兼容规则：

- 用户曾明确保存为 `true`：继续保持开启。
- 用户曾明确保存为 `false`：继续保持关闭。
- 没有保存过该设置：升级后默认为关闭。

设置文案需要明确说明：开启后，在 B 站网页删除历史也会删除插件中的长期历史。

### 4.2 捕获完整删除目标

当前注入脚本只从 `kid=archive_123` 中提取数字 `123`。修改为使用 `URLSearchParams` 解析完整目标：

```ts
interface BilibiliHistoryDeleteMessage {
  action: "deleteHistoryItem";
  source: "bilibili-page";
  business: "archive" | "pgc" | "live" | "article" | "article-list" | "cheese";
  kid: number;
}
```

要求：

- 解析并携带 `business + kid`。
- 兼容一个请求包含多个删除目标。
- 无法识别的格式不得退化成只按数字删除。
- 无法识别时跳过本地删除并记录日志。

### 4.3 删除前核对业务类型

保持 `id=oid` 不变。后台收到删除消息后：

1. 先按可确定的本地 ID 读取记录。
2. 核对 `record.business === message.business`。
3. 只有业务类型和目标映射都能确认时才允许删除。
4. `kid` 与 `oid` 关系不明确的业务不猜测、不删除，只记录跳过原因。

这个保护避免不同业务使用相同数字 ID 时误删视频。

### 4.4 回收站代替立即物理删除

推荐增加辅助对象仓库 `historyTrash`，但不修改现有 `history` 结构：

```text
history
  keyPath: id       // 保持不变，id 仍然是 oid

historyTrash
  keyPath: trashId
  indexes:
    originalId
    deletedAt
    source
```

回收站记录包装完整原记录：

```ts
interface TrashedHistoryItem {
  trashId: string;
  originalId: number;
  deletedAt: number;
  source: "extension-ui" | "bilibili-page";
  business: string;
  kid?: number;
  record: HistoryItem;
}
```

删除操作必须在一个事务中完成：

1. 写入 `historyTrash`。
2. 从 `history` 删除。
3. 任一步失败则回滚。

默认保留 30 天，支持恢复和手动永久删除。恢复相同 `oid` 时比较 `view_at`，保留最近一次观看状态。

### 4.5 删除审计和批量保护

保存最近 500 条或 30 天的删除日志：

```ts
interface HistoryDeletionAudit {
  timestamp: number;
  source: "extension-ui" | "bilibili-page" | "factory-reset" | "trash-cleanup";
  business?: string;
  kid?: number;
  oid?: number;
  result: "trashed" | "deleted" | "skipped" | "failed";
  errorName?: string;
}
```

日志不保存标题、UP 主等内容。

如果 10 秒内检测到超过 100 条 B 站删除事件：

- 数据只进入回收站，不永久删除。
- 在设置页显示批量删除提示。
- 提供一键恢复本批记录。

## 5. P0：修复历史同步不完整

这些问题不会删除已经存在的数据，但数据库一旦被清空或重建，可能导致插件只能补回一部分历史。

### 5.1 传递完整游标

B 站混合历史游标由以下字段共同组成：

```ts
interface HistoryCursor {
  max: number;
  view_at: number;
  business: string;
}
```

下一页必须同时传递：

```text
max=<cursor.max>
view_at=<cursor.view_at>
business=<cursor.business>
type=all
ps=30
```

当前代码只更新 `max` 和 `view_at`，需要新增 `business` 状态并传入请求。

### 5.2 删除首尾 ID 停止条件

移除以下逻辑：

```ts
if (firstItemExists && lastItemExists) {
  hasMore = false;
}
```

第一页首尾 `oid` 已存在，不代表后续页面不存在未同步记录。

### 5.3 使用成功同步时间水位

增量同步改为：

1. 读取 `lastSuccessfulSyncViewAt`。
2. 从最新页开始翻页。
3. 一直处理到当前页最旧的 `view_at <= lastSuccessfulSyncViewAt`。
4. 额外重叠拉取 24 小时，避免同秒排序或边界遗漏。
5. 重叠记录继续以 `oid` 执行 `put()`，不会产生重复记录。
6. 只有所有网络请求和 IndexedDB 事务成功后才更新时间水位。

以下情况强制执行全量同步：

- 本地历史为空。
- 不存在成功同步水位。
- 检测到 IndexedDB 数量异常下降。
- 用户主动要求全量同步。

全量同步只能新增或更新，不得在开始前清空本地历史。

### 5.4 游标和响应保护

- 下一页游标与上一页完全相同时停止并报告“游标停滞”。
- 连续返回相同页面时停止，避免无限循环。
- 响应缺失 `data.list` 或 `data.cursor` 时视为失败。
- HTTP、JSON、IndexedDB 任一环节失败都不能更新成功水位。

## 6. P1：Edge/Chromium 存储保护

### 6.1 申请无限存储权限

在 manifest 增加：

```ts
permissions: ["unlimitedStorage", "storage", "tabs", "cookies", "alarms", "declarativeNetRequest"];
```

这不会改变 `history` 数据结构，只降低扩展 IndexedDB 受配额和存储压力驱逐的风险。

### 6.2 请求持久化并展示容量

扩展页面启动时执行：

```ts
const persisted = await navigator.storage.persisted();
const persistGranted = persisted || (await navigator.storage.persist());
const { usage, quota } = await navigator.storage.estimate();
```

要求：

- 以 manifest 中的 `unlimitedStorage` 权限作为扩展存储保护的主要状态。
- `navigator.storage.persisted()` 只作为辅助状态；当 `unlimitedStorage` 已生效时，即使
  `persist()` 返回 `false` 也不得显示为“未获得授权”，并明确提示用户无需手动授权。
- 展示当前使用量和估算配额。
- 捕获 `QuotaExceededError`、`AbortError`、`UnknownError`。
- 写事务失败时不更新同步成功状态或时间水位。
- 存储异常时提示用户立即导出 JSON 或检查 WebDAV。

`unlimitedStorage` 和持久化请求只能降低风险，不能代替备份。

## 7. P1：数量和索引健康检查

### 7.1 区分三种数量

新增 `inspectHistoryDatabase()`：

```ts
interface HistoryDatabaseDiagnostics {
  totalStoreCount: number;
  indexedViewAtCount: number;
  invalidViewAtCount: number;
  countsByBusiness: Record<string, number>;
  countsByMonth: Record<string, number>;
  oldestViewAt?: number;
  newestViewAt?: number;
  storageUsage?: number;
  storageQuota?: number;
  storagePersisted?: boolean;
}
```

检查：

```ts
historyStore.count();
historyStore.index("view_at").count();
```

如果两者不一致，遍历对象仓库统计：

- 缺失 `view_at`。
- `view_at` 不是有效数字。
- `view_at <= 0`。
- 数字字符串等可以安全转换的情况。

可安全转换的值允许自动修复；无法转换的记录保留并提供导出，不直接删除。

### 7.2 保存最近正常数量

每次成功同步、导入或 WebDAV 合并后，在 `browser.storage.local` 保存：

```ts
interface HistoryCountSnapshot {
  timestamp: number;
  total: number;
  indexed: number;
  byBusiness: Record<string, number>;
  oldestViewAt?: number;
  newestViewAt?: number;
  reason: "full-sync" | "incremental-sync" | "import" | "webdav-merge";
}
```

只保留最近 30–50 个快照。

如果上一次正常记录为 5000 条，本次启动只有 1200 条：

- 标记为严重异常。
- 保留异常前后的数量快照。
- 提示用户先导出当前数据和诊断报告。
- 不静默认为一次正常同步结果。
- 暂停会覆盖远端备份的上传操作。

如果 IndexedDB 和 storage.local 同时被清除，本机没有状态可以判断此前数量，只能依靠 WebDAV 或 JSON 备份。

### 7.3 同步前后数量保护

每次同步记录：

```text
countBefore
countAfter
pagesFetched
itemsFetched
recordsInserted
recordsUpdated
stopReason
lastCursor
errorName
```

同步本身只执行 `put()`，因此只要不是并发删除，`countAfter` 就不应小于 `countBefore`。出现下降时显示严重异常并保留现场。

## 8. P1：增强备份

### 8.1 保留现有 WebDAV 合并语义

- 继续使用现有 `history.json`。
- 继续按 `oid/id` 合并，同一内容保留较新的 `view_at`。
- 不新增 `history-v2.json`。
- 下载和合并完成后再上传。
- 远端解析失败时停止，不用空数组覆盖远端文件。

### 8.2 增加版本化快照

除当前 `history.json` 外，可增加按日期保存的只读快照，例如：

```text
snapshots/history-2026-08-02T120000.json
```

建议：

- 每天最多生成一个历史快照。
- 保留最近 7–14 个版本。
- 快照生成前校验当前数量没有异常下降。
- 当前数量异常时暂停覆盖 `history.json`，保留远端最后正常版本。
- 设置页支持查看快照时间、数量并选择恢复。

### 8.3 JSON 导出

- 保持现有格式兼容。
- 增加“立即导出历史备份”入口。
- 数据库数量异常时优先提示导出。
- 诊断报告与完整历史导出分开，诊断报告不包含标题等隐私内容。

## 9. 已丢失数据的恢复

代码修改只能防止继续丢失，无法凭空恢复已经不在任何存储中的记录。

恢复前先：

1. 导出当前历史 JSON。
2. 保存当前 WebDAV 文件副本。
3. 导出数据库诊断报告。

恢复顺序：

1. 从回收站恢复。
2. 从丢失前的 JSON 或 WebDAV 快照导入。
3. 执行 B 站全量同步，补回服务端当前仍保留的历史。

对比旧备份时：

- 相同 `id` 当前仍存在，但 `view_at` 更新：属于正常重看，不是总数丢失。
- 旧备份中大量 `id` 当前完全不存在：说明发生过删除、数据库重建或旧记录从未同步成功。
- `history.count()` 大于 `view_at` 索引数量：数据可能仍在，只是索引不可见。

没有备份且 B 站服务端已不再返回的记录无法恢复。

## 10. 实施顺序

### P0：立即修复

1. 把“B 站 → 插件同步删除”的默认值改为关闭。
2. 删除消息携带完整 `business + kid`，删除前核对业务类型。
3. 增加回收站和删除审计，避免不可恢复的物理删除。
4. 历史游标补传 `cursor.business`。
5. 删除首页首尾 `oid` 存在即停止的逻辑。
6. 改用成功同步时间水位和重叠窗口。

### P1：可靠性保护

1. 增加 `unlimitedStorage`。
2. 请求持久化存储并展示使用量和配额。
3. 比较对象仓库总数与 `view_at` 索引数量。
4. 保存最近正常数量和按业务统计。
5. 数量异常时暂停覆盖远端备份。
6. 增加 WebDAV 版本化快照。

### P2：界面和恢复能力

1. 设置页增加数据库诊断。
2. 增加历史回收站页面。
3. 增加诊断报告导出。
4. 增加 WebDAV 快照查看和恢复。

## 11. 测试计划

建议引入 `vitest` 和 `fake-indexeddb`。

### 11.1 保持现有数据语义

- 同一 `oid` 在不同日期同步三次，最终仍只有一条记录。
- 最终 `view_at`、进度等字段为最近一次值。
- 更新相同 `oid` 前后 `history.count()` 不变。

### 11.2 删除安全

- 未设置同步删除开关时默认不删除本地记录。
- 用户明确开启后才处理 B 站删除消息。
- `archive:123` 消息不会删除业务类型不匹配的记录。
- 无法识别的 `kid` 被跳过并写入审计。
- 删除原子地进入回收站。
- 短时间大量删除后可以一键恢复。

### 11.3 同步正确性

- 混合 `archive`、`pgc`、`live` 页面时传递完整游标。
- 页尾为番剧或直播时仍能获取下一页。
- 首页首尾记录存在时仍会继续处理水位前的新页面。
- 游标停滞、页面重复、HTTP 错误和事务失败均不更新成功水位。
- 全量和增量同步前后记录数不会下降。

### 11.4 数据库与索引诊断

- `history.count()` 与 `view_at` 索引数量一致时报告健康。
- 非法 `view_at` 可以被识别但不会被删除。
- 数字字符串时间戳能够安全修复。
- 上次 5000 条、本次 1200 条时产生严重异常提示。
- storage.local 保留而 IndexedDB 被清空时能够检测数量下降。

### 11.5 Edge 和备份

- Chrome、Edge、Firefox 验证持久化状态和容量展示。
- 写事务失败时不更新同步成功状态。
- 数量异常时不会覆盖远端正常备份。
- 能够从 WebDAV 快照和回收站恢复。
- 旧 JSON、WebDAV 和云同步继续兼容。

最终运行：

```bash
pnpm compile
pnpm format:check
```

## 12. 验收标准

- `history` 继续使用 `id=oid`，不改变现有数据语义。
- 同一 `oid` 重复同步只更新记录，总数不变。
- 没有明确开启设置时，B 站网页删除不会物理删除本地历史。
- 每次删除都能找到来源，并在保留期内恢复。
- 混合历史使用完整游标，增量同步不再依赖首页首尾 ID。
- 能区分对象仓库原始数量、索引可见数量和页面筛选数量。
- Edge 存储状态可见，写入异常不会被标记为同步成功。
- 数量异常时不会覆盖唯一远端备份。
- 旧 IndexedDB、JSON、WebDAV 和云同步保持兼容。

## 13. 预计涉及文件

- `utils/db.ts`
- `utils/types/index.ts`
- `utils/constants.ts`
- `entrypoints/background.ts`
- `entrypoints/injected.ts`
- `entrypoints/content.ts`
- `pages/Settings.tsx`
- `pages/WebDavSync.tsx`
- `components/HistoryItem.tsx`
- `utils/export.ts`
- `wxt.config.ts`
- 新增删除审计、同步和 IndexedDB 测试文件

## 14. TODO

- [ ] 第 4 节：堵住不可恢复的删除路径
- [ ] 第 5 节：修复历史同步不完整
- [x] 第 6 节：Edge/Chromium 存储保护
  - [x] manifest 增加 `unlimitedStorage`
  - [x] 扩展主页面启动时请求持久化存储
  - [x] 设置页展示持久化状态、当前使用量和估算配额
  - [x] 修正授权状态判断，以 `unlimitedStorage` 为主要保护状态，避免 `persisted()` 误报
  - [x] 记录 `QuotaExceededError`、`AbortError`、`UnknownError` 等关键存储异常
  - [x] 存储未持久化或发生异常时提示用户检查 JSON/WebDAV 备份
- [ ] 第 7 节：数量和索引健康检查
- [ ] 第 8 节：增强备份
