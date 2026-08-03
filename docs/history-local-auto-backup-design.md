# 历史记录本地目录自动备份设计方案（评审稿）

> 状态：已实现，待手工验收
>
> 目标版本：待定
>
> 影响范围：`pages/Settings.tsx`、`entrypoints/background.ts`、`utils/constants.ts`、新增本地备份工具模块
>
> 第一版范围：仅备份历史记录，不备份音乐、收藏夹、订阅合集等其他数据

## 1. 结论

第一版新增“自动备份到本地目录”功能。用户在扩展设置页通过系统目录选择器授权一个目录后，扩展在浏览器运行期间使用 `browser.alarms` 定时读取本地 IndexedDB 中的全部历史记录，并将其写入该目录中的 JSON 文件。

核心设计如下：

- 仅 Chrome、Edge 等支持 File System Access API 的 Chromium 浏览器启用该功能。
- Firefox 和不支持 `showDirectoryPicker()` 的浏览器不展示可操作的自动本地备份入口，继续使用手动导出或 WebDAV。
- 第一版只备份 `history` 数据，不备份 `likedMusic`、收藏夹、收藏内容、订阅合集及合集视频。
- 备份 JSON 保持现有 `HistoryItem[]` 顶层数组格式，可以通过现有历史记录 JSON 导入功能恢复。
- `FileSystemDirectoryHandle` 保存到独立 IndexedDB；开关、周期、目录显示名、最近结果等普通配置和状态保存到 `browser.storage.local`。
- 后台 Service Worker 直接使用目录句柄写文件，不引入 Offscreen Document。
- 默认每 24 小时备份一次，默认保留最近 30 份；设置页允许用户调整周期和保留份数。
- 权限失效时后台不尝试弹出授权框，只记录“需要重新授权”，等待用户在设置页主动操作。
- 自动备份是尽力执行：浏览器关闭或设备休眠时不会准点执行，浏览器恢复运行后再补做。

该功能用于降低扩展本地 IndexedDB 数据被清理、损坏或误操作后无法恢复的风险。它不能替代异地备份：如果备份目录与浏览器数据位于同一块磁盘，设备或磁盘损坏仍可能同时丢失两者，WebDAV 仍需保留。

## 2. 背景与现状

当前项目已经具备以下能力：

- 历史记录保存在 `bilibiliHistory` IndexedDB 的 `history` store 中。
- `getAllHistory()` 可以读取全部历史记录。
- `exportHistoryToJSON()` 可以将全部历史记录导出为 `HistoryItem[]` JSON 文件。
- 设置页支持手动导出和导入历史记录 JSON。
- 数据备份提醒每 7 天提示用户手动导出历史记录。
- background 已使用 `browser.alarms` 调度历史同步和 WebDAV 自动同步。

当前手动导出的不足是：

- 依赖用户主动点击，提醒不等于实际完成备份。
- 浏览器下载通常进入默认下载目录，不能持续覆盖或轮换用户指定目录中的备份。
- 用户很难判断最近一次备份是否成功。

本方案在不安装本地辅助程序的前提下，为 Chromium 用户增加授权目录后的自动写入能力。

## 3. 目标与非目标

### 3.1 目标

- 用户只需通过系统选择器选择一次备份目录。
- 授权仍有效时，扩展可以在后台自动写入历史记录 JSON。
- 设置页明确展示目录名称、启用状态、最近成功时间、最近文件名、记录数和错误状态。
- 权限失效、目录不可用、写入失败时安全停止并提示重新授权，不产生虚假的成功状态。
- 自动备份文件可以直接被现有历史记录导入功能识别。
- 只清理扩展自己创建且符合严格命名规则的旧备份文件。
- Chrome/Edge 增加功能时不破坏 Firefox 的构建和现有功能。

### 3.2 非目标

- 第一版不备份喜欢的音乐、收藏夹、收藏内容、订阅合集或合集视频。
- 不生成 WebDAV 页使用的“完整备份包”。
- 不修改历史记录 JSON 的导入格式和合并逻辑。
- 不允许用户通过文本框输入任意绝对路径；目录必须由系统选择器授权。
- 不读取或展示目录的完整绝对路径。File System Access API 只提供目录句柄和目录名称。
- 不保证浏览器关闭、设备休眠或扩展未运行时仍能备份。
- 不保证在用户指定的某个准确时刻执行。
- 不引入 Native Messaging、本地守护进程、Node.js、Python、Electron 或其他安装程序。
- 不引入 Offscreen Document。
- 不把本地目录备份描述为异地备份或设备故障保护。

## 4. 平台与能力检测

### 4.1 支持范围

功能以实际能力检测为准：

```ts
const localDirectoryBackupSupported = "showDirectoryPicker" in window;
```

第一版预期：

| 平台                    | 行为                                         |
| ----------------------- | -------------------------------------------- |
| Chrome / Edge 桌面版    | 支持时展示完整的自动本地备份设置             |
| Firefox                 | 不启用，提示可使用手动 JSON 导出或 WebDAV    |
| 不支持 API 的其他浏览器 | 不启用，不调用不存在的文件系统 API           |
| 移动端                  | 第一版不作为支持目标，以实际能力检测结果为准 |

不得仅通过 User-Agent 判断浏览器，也不得因为项目可以构建 Firefox 就假设 Firefox 支持目录选择和持久写权限。

### 4.2 类型支持

当前 TypeScript 已包含文件和目录句柄的基础接口，但缺少目录选择器、权限方法和目录异步遍历声明。因此实现使用 `types/file-system-access.d.ts` 增加最小声明，不引入运行时依赖，也不在业务代码中使用 `any` 绕过类型检查。

## 5. 总体架构

```text
设置页：用户点击“选择备份目录”
        │
        v
showDirectoryPicker({ mode: "readwrite" })
        │
        ├─ 保存 FileSystemDirectoryHandle ──> 独立 IndexedDB
        │
        ├─ 保存目录名称、开关、周期等 ──────> browser.storage.local
        │
        └─ 验证新目录可写后再替换旧句柄

browser.alarms 定时触发
        │
        v
background Service Worker
        │
        ├─ 检查是否启用、是否到达周期
        ├─ 从独立 IndexedDB 读取目录句柄
        ├─ queryPermission({ mode: "readwrite" })
        │      ├─ granted ──> getAllHistory() ──> 写入 JSON
        │      └─ prompt / denied ──> 标记需要重新授权
        └─ 写入成功后更新状态并清理超出保留数量的旧文件
```

目录选择必须发生在有用户操作的设置页中。定时写入只在后台已经持有有效权限时执行。

## 6. 存储设计

### 6.1 为什么目录句柄不能存入 `browser.storage.local`

Chrome 扩展 Storage API 只保证保存可 JSON 序列化的数据。`FileSystemDirectoryHandle` 是带内部文件系统定位信息和方法的可结构化克隆对象，不是普通 JSON 对象。

因此禁止使用：

```ts
await setStorageValue("localBackupDirectoryHandle", directoryHandle);
```

这种写法可能保存失败，或者读取后只得到不包含 `getFileHandle()` 等能力的普通对象。

File System Access API 明确支持将文件和目录句柄保存到 IndexedDB，因此本方案使用 IndexedDB 保存句柄；`browser.storage.local` 仍负责保存普通配置和可展示状态。

### 6.2 独立句柄数据库

新增独立数据库，不修改现有 `bilibiliHistory` 的版本和 store：

```ts
const LOCAL_BACKUP_DB = {
  name: "bilibiliLocalBackup",
  version: 1,
  storeName: "handles",
  directoryHandleKey: "historyBackupDirectory",
};
```

建议提供以下封装：

```ts
saveLocalBackupDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void>;
getLocalBackupDirectoryHandle(): Promise<FileSystemDirectoryHandle | null>;
clearLocalBackupDirectoryHandle(): Promise<void>;
```

约束：

- 页面和 background 必须复用同一封装，不各自实现一套 IndexedDB 读写。
- 读取结果必须检查 `kind === "directory"` 以及所需方法是否存在。
- 句柄数据库读取失败时按“目录不可用”处理，不得继续报告为已启用且正常。
- 恢复出厂设置时必须同时删除目录句柄，不能只清空 `browser.storage.local` 后遗留授权引用。

### 6.3 `browser.storage.local` 状态键

所有键继续集中定义在 `utils/constants.ts`，读写继续通过 `utils/storage.ts`：

```ts
export const LOCAL_HISTORY_BACKUP_ENABLED = "localHistoryBackupEnabled";
export const LOCAL_HISTORY_BACKUP_INTERVAL_HOURS = "localHistoryBackupIntervalHours";
export const LOCAL_HISTORY_BACKUP_RETENTION_COUNT = "localHistoryBackupRetentionCount";
export const LOCAL_HISTORY_BACKUP_DIRECTORY_NAME = "localHistoryBackupDirectoryName";
export const LOCAL_HISTORY_BACKUP_LAST_ATTEMPT_AT = "localHistoryBackupLastAttemptAt";
export const LOCAL_HISTORY_BACKUP_LAST_SUCCESS_AT = "localHistoryBackupLastSuccessAt";
export const LOCAL_HISTORY_BACKUP_LAST_FILE_NAME = "localHistoryBackupLastFileName";
export const LOCAL_HISTORY_BACKUP_LAST_RECORD_COUNT = "localHistoryBackupLastRecordCount";
export const LOCAL_HISTORY_BACKUP_LAST_ERROR = "localHistoryBackupLastError";
export const LOCAL_HISTORY_BACKUP_LAST_CLEANUP_WARNING = "localHistoryBackupLastCleanupWarning";
export const LOCAL_HISTORY_BACKUP_NEEDS_PERMISSION = "localHistoryBackupNeedsPermission";
```

默认值：

| 状态                                    | 默认值 |
| --------------------------------------- | ------ |
| `LOCAL_HISTORY_BACKUP_ENABLED`          | false  |
| `LOCAL_HISTORY_BACKUP_INTERVAL_HOURS`   | 24     |
| `LOCAL_HISTORY_BACKUP_RETENTION_COUNT`  | 30     |
| `LOCAL_HISTORY_BACKUP_NEEDS_PERMISSION` | false  |

目录名称仅用于界面展示，不能用于重新构造目录句柄，也不能被描述为完整路径。

### 6.4 状态一致性

保存目录成功后按以下顺序更新状态：

1. 对系统选择器返回的新句柄检查读写权限。
2. 在新目录中创建、写入并删除一个唯一命名的临时测试文件。
3. 测试成功后才将新句柄写入独立 IndexedDB，替换旧句柄。
4. 从 IndexedDB 重新读取句柄并确认类型正确。
5. 保存目录名称，清空错误和重新授权标记。
6. 最后才允许开启自动备份。

测试文件使用不会匹配正式备份清理规则的名称，例如：

```text
bilibili-history-backup-access-test-<timestamp>.tmp
```

测试写入完成后立即调用 `removeEntry()` 删除。测试文件删除失败视为目录验证失败，并提示用户手动检查该临时文件；不得在这种情况下替换原有可用句柄。

删除目录配置时：

1. 先将 `LOCAL_HISTORY_BACKUP_ENABLED` 设为 `false`。
2. 删除 IndexedDB 中的目录句柄。
3. 清除目录名称、错误和重新授权状态。
4. 保留最近成功备份的时间、文件名和记录数作为历史信息，除非执行恢复出厂设置。

## 7. 目录授权与重新授权

### 7.1 首次选择目录

系统目录选择器必须由用户点击直接触发：

```ts
const handle = await window.showDirectoryPicker({
  mode: "readwrite",
});
```

处理结果：

- 用户选择并授权：先验证新目录可写，成功后保存句柄。
- 用户取消：保持原配置不变，不显示错误 toast。
- API 不可用：显示当前浏览器不支持自动本地目录备份。
- 其他错误：保留原句柄和原启用状态，展示可理解的错误信息。

用户重新选择目录时，在新句柄验证成功之前不得覆盖旧句柄，避免一次失败选择破坏仍可用的备份配置。

### 7.2 权限检查

后台定时任务只调用：

```ts
await handle.queryPermission({ mode: "readwrite" });
```

结果处理：

| 权限结果 | 后台行为                                       |
| -------- | ---------------------------------------------- |
| granted  | 继续备份                                       |
| prompt   | 不调用 `requestPermission()`，标记需要重新授权 |
| denied   | 不写文件，标记需要重新授权                     |

`requestPermission()` 需要瞬时用户操作，不能依赖 alarm 在 Service Worker 中弹出授权框。

### 7.3 重新授权

设置页在存在已保存句柄但权限不是 `granted` 时显示“重新授权”按钮。

用户点击后：

1. 从 IndexedDB 读取原句柄。
2. 调用 `requestPermission({ mode: "readwrite" })`。
3. 获得授权后执行一次测试写入并删除测试文件。
4. 成功后清除 `LOCAL_HISTORY_BACKUP_NEEDS_PERMISSION` 和最近权限错误。
5. 如果原句柄已经不可恢复，则引导用户重新选择目录。

## 8. 备份数据与文件格式

### 8.1 数据范围

第一版只调用：

```ts
const history = await getAllHistory();
```

明确不调用：

- `getAllLikedMusic()`
- `getAllFavFolders()`
- `getAllFavResources()`
- `getAllSubscribedCollections()`
- `getAllSubscribedCollectionResources()`

### 8.2 JSON 格式

自动备份必须与当前 `exportHistoryToJSON()` 保持相同的数据格式：

```ts
const json = JSON.stringify(history, null, 2);
```

顶层必须是 `HistoryItem[]`，不增加元数据包装对象：

```json
[
  {
    "id": 123,
    "title": "示例视频",
    "view_at": 1785720000
  }
]
```

备份时间、记录数、最近文件名等元数据保存在 `browser.storage.local`，不改变文件内容。这样自动备份文件可以直接通过现有“历史记录 + JSON”导入入口恢复。

建议把“读取数据并序列化”提取为无 DOM 的共享函数，手动下载和自动写目录共同复用，避免两处格式漂移：

```ts
buildHistoryBackupJson(): Promise<{
  json: string;
  recordCount: number;
}>;
```

### 8.3 文件名

文件名使用本地时间并包含秒，避免同一天多次备份覆盖：

```text
bilibili-history-YYYY-MM-DD-HHmmss.json
```

例如：

```text
bilibili-history-2026-08-03-083015.json
```

用于识别可清理文件的严格规则：

```regex
^bilibili-history-\d{4}-\d{2}-\d{2}-\d{6}\.json$
```

旧的手动导出文件 `bilibili-history-YYYY-MM-DD.json` 不在自动清理范围内。

### 8.4 写入流程

```ts
const fileHandle = await directoryHandle.getFileHandle(fileName, {
  create: true,
});
const writable = await fileHandle.createWritable();

try {
  await writable.write(json);
  await writable.close();
} catch (error) {
  await writable.abort();
  throw error;
}
```

只有 `close()` 成功后才能：

- 写入最近成功时间。
- 写入最近文件名和记录数。
- 清空最近错误。
- 开始清理旧文件。
- 向手动触发入口报告成功。

如果写入或关闭失败，不得更新成功状态，也不得清理任何旧备份。

### 8.5 空数据保护

空数组对首次安装且尚未同步历史的用户可能是合法状态，但也可能表示本地数据异常。

第一版采用保守规则：

- 从未成功备份过且当前记录数为 0：允许生成首个空备份，但设置页明确显示“0 条记录”。
- 最近一次成功备份记录数大于 0，而当前记录数变为 0：停止自动写入和旧文件清理，记录异常并提示用户检查本地数据。
- 用户通过设置页明确点击“立即备份”时，如果触发上述异常，展示确认提示；第一版不在后台自动覆盖该保护。
- 用户确认生成空备份时，本次不清理任何旧备份，并在状态中记录跳过清理的原因。

第一版暂不使用百分比下降阈值判断异常，避免合法的数据变化被误判。后续如需增加数量骤降保护，应单独设计。

## 9. 定时调度

### 9.1 Alarm

新增独立 alarm：

```ts
const LOCAL_HISTORY_BACKUP_ALARM = "localHistoryBackup";
```

alarm 每分钟唤醒一次，实际是否执行根据最近成功时间和用户选择的周期判断：

```text
alarm 触发
  ├─ 未启用 ───────────────────> 返回
  ├─ 没有目录句柄 ─────────────> 标记需要配置目录
  ├─ 距上次成功未达到周期 ─────> 返回
  └─ 已到周期 ─────────────────> 执行备份
```

建议的周期选项：

- 每 1 分钟，仅用于测试自动备份
- 每 6 小时
- 每 12 小时
- 每 24 小时，默认
- 每 3 天
- 每 7 天

### 9.2 Alarm 初始化可靠性

现有 alarm 主要在 `runtime.onInstalled` 中创建。新增本地备份 alarm 时必须同时增加启动检查：

```ts
async function ensureLocalHistoryBackupAlarm(): Promise<void> {
  const alarm = await browser.alarms.get(LOCAL_HISTORY_BACKUP_ALARM);
  if (!alarm) {
    await browser.alarms.create(LOCAL_HISTORY_BACKUP_ALARM, {
      periodInMinutes: 1,
    });
  }
}
```

background 初始化时调用该函数，不能只依赖 `onInstalled`。这样可以覆盖浏览器重启、扩展重新加载或浏览器没有持久保留 alarm 的情况。

### 9.3 延迟语义

- alarm 不会唤醒处于休眠状态的设备。
- 浏览器关闭时不会执行扩展任务。
- 设备或浏览器恢复后，下一次 alarm 检查发现周期已到，应执行一次补备份。
- 重复 alarm 不补做多份错过的备份，只生成当前的一份。
- 界面文案使用“约每 24 小时自动备份”，不使用“每天固定时间”或“保证准时”。

### 9.4 并发控制

后台使用单例 Promise 避免 alarm 和手动“立即备份”同时写文件：

```ts
let localHistoryBackupPromise: Promise<LocalBackupResult> | null = null;
```

- 已有任务进行时，新的自动触发复用或跳过当前任务。
- 手动触发时返回“已有备份正在进行”，不启动第二个写入流。
- `onAlarm` 分支必须 `await` 备份 Promise，使 Service Worker 在任务完成前保持存活。
- 备份结束后在 `finally` 中清除单例 Promise。

历史同步和本地备份可能同时读取数据库。第一版允许并发读取，单个 IndexedDB 事务提交前不会暴露未提交记录；备份代表读取完成时可见的历史快照，不承诺与正在进行的远端同步属于同一批次。

## 10. 旧文件保留与清理

### 10.1 保留策略

默认保留最近 30 份，建议可选：

- 7 份
- 14 份
- 30 份，默认
- 60 份

清理流程只能在新文件成功关闭后执行：

1. 枚举用户授权目录中的条目。
2. 只保留 `kind === "file"` 且文件名匹配自动备份严格正则的条目。
3. 按文件名降序排序；时间格式保证文件名字典序与创建时间顺序一致。
4. 删除超出保留数量的旧文件。

### 10.2 删除安全边界

- 不删除任何不匹配命名规则的文件。
- 不删除旧的手动导出文件。
- 不递归进入子目录。
- 新备份失败时不执行清理。
- 当前历史从非空异常变为空时不执行清理。
- 单个旧文件删除失败不回滚已经成功写入的新备份。
- 清理失败应记录警告，但最近一次备份仍可显示为成功，并附带“旧文件清理失败”的次要状态。

## 11. 设置页交互

### 11.1 自动本地备份卡片

在设置页“数据管理”相关区域新增卡片：

```text
┌────────────────────────────────────────┐
│ 自动备份历史记录到本地目录             │
│                                        │
│ 备份目录：BilibiliBackup               │
│ [选择目录] [重新授权] [立即备份]        │
│                                        │
│ 自动备份                         [开关] │
│ 备份周期：[每 24 小时 ▼]               │
│ 保留份数：[30 份 ▼]                    │
│                                        │
│ 最近成功：2026/8/3 08:30               │
│ 文件：bilibili-history-...json         │
│ 共 12,345 条历史记录                   │
└────────────────────────────────────────┘
```

未选择目录时：

- 自动备份开关不可开启。
- 显示“请先选择备份目录”。
- 不展示虚假的默认路径。

已选择但权限失效时：

- 显示明确的黄色或红色状态提示。
- 显示“重新授权”按钮。
- 自动备份开关可以保留为开启，但状态显示“等待重新授权”；获得授权后无需用户再次开启。

### 11.2 开启行为

开启自动备份时：

1. 确认存在目录句柄。
2. 确认写权限为 `granted`；必要时必须在当前点击事件中请求权限。
3. 保存启用状态。
4. 如果从未成功备份，立即执行一次备份，不等待第一个周期。

关闭自动备份只停止定时写入，不删除目录句柄，也不删除已生成的文件。用户仍可使用“立即备份”。

### 11.3 立即备份

- 必须复用 background 的同一备份函数，不在 React 页面复制写文件逻辑。
- 页面通过 `browser.runtime.sendMessage()` 请求 background 执行。
- 执行中禁用相关按钮并显示“备份中...”。
- 成功后刷新最近成功时间、文件名和记录数。
- 权限失效时提示用户重新授权。
- 数据异常时展示明确说明，不静默覆盖。

### 11.4 不支持浏览器

不支持 `showDirectoryPicker()` 时显示只读说明：

> 当前浏览器暂不支持自动写入本地目录。你仍可以使用历史记录 JSON 手动导出或 WebDAV 自动备份。

不得展示点击后必然报错的目录选择按钮。

## 12. 后台结果与错误模型

建议统一返回结构：

```ts
type LocalHistoryBackupErrorCode =
  | "NOT_ENABLED"
  | "NO_DIRECTORY"
  | "PERMISSION_REQUIRED"
  | "EMPTY_HISTORY_ANOMALY"
  | "READ_FAILED"
  | "WRITE_FAILED";

interface LocalHistoryBackupResult {
  success: boolean;
  fileName?: string;
  recordCount?: number;
  completedAt?: number;
  cleanupWarning?: string;
  errorCode?: LocalHistoryBackupErrorCode;
  error?: string;
}
```

状态写入规则：

- 每次真正尝试备份时更新 `LAST_ATTEMPT_AT`。
- 只有文件 `close()` 成功才更新 `LAST_SUCCESS_AT`、文件名和记录数。
- 失败时更新 `LAST_ERROR`，但保留上一次成功信息。
- 权限问题同时设置 `NEEDS_PERMISSION=true`。
- 新的成功备份清空 `LAST_ERROR` 和 `NEEDS_PERMISSION`。
- 周期未到或功能未启用属于正常跳过，不覆盖最近错误和最近尝试时间。

日志不得输出目录句柄内部信息、用户目录完整路径或备份数据正文。

## 13. 与现有功能的关系

### 13.1 手动 JSON 导出

现有设置页和 7 天提醒中的手动导出继续保留：

- 支持自动本地备份的用户仍可临时手动下载。
- Firefox 用户继续依赖手动导出或 WebDAV。
- 自动备份成功不改变现有 7 天提醒周期；是否以后抑制提醒应另行评审。

### 13.2 JSON 导入

不修改导入逻辑。自动备份文件保持 `HistoryItem[]` 格式，因此使用现有“历史记录 + JSON”入口导入。

第一版不增加“从已授权目录自动恢复”功能。恢复仍由用户主动选择具体 JSON 文件，避免误恢复或覆盖。

### 13.3 WebDAV

- WebDAV 手动备份、恢复、双向同步和自动同步保持不变。
- 本地目录备份与 WebDAV 可以同时启用。
- 两者使用独立的启用状态、周期、最近成功时间和错误状态。
- 本地目录备份只读历史记录，不参与 WebDAV 合并逻辑。

### 13.4 恢复出厂设置

当前恢复出厂设置会清空历史记录和 `browser.storage.local`。接入本功能后还必须：

- 删除独立 IndexedDB 中保存的目录句柄。
- 不删除用户目录中已经生成的 JSON 文件。
- 不尝试撤销浏览器层面的站点权限；句柄删除后扩展不再持有访问引用。

## 14. 建议代码结构

### 14.1 新增文件

```text
utils/localBackupHandle.ts
  ├─ 打开独立 IndexedDB
  ├─ 保存目录句柄
  ├─ 读取目录句柄
  └─ 删除目录句柄

utils/localHistoryBackup.ts
  ├─ 构建历史记录 JSON
  ├─ 检查目录权限
  ├─ 生成安全文件名
  ├─ 写入文件
  ├─ 清理旧文件
  └─ 返回统一结果

types/file-system-access.d.ts
  └─ 补充项目所需的 File System Access API 最小类型声明
```

如果页面和 Service Worker 共享模块时出现构建上下文问题，可以进一步拆分：

```text
utils/historyBackupData.ts       // 纯数据读取和序列化
utils/localBackupHandle.ts       // IndexedDB 句柄存取
utils/localHistoryBackup.ts      // Worker 可执行的目录写入
```

### 14.2 修改文件

| 文件                            | 改动                                                        |
| ------------------------------- | ----------------------------------------------------------- |
| `utils/constants.ts`            | 新增本地历史备份配置和状态键                                |
| `utils/export.ts`               | 提取可复用的历史 JSON 构建函数，保持手动导出行为不变        |
| `entrypoints/background.ts`     | 确保 alarm、处理定时备份、处理立即备份消息、维护单任务锁    |
| `pages/Settings.tsx`            | 新增目录选择、授权、开关、周期、保留份数、立即备份和状态 UI |
| `types/file-system-access.d.ts` | 增加目录选择、权限和目录遍历的最小类型声明                  |

第一版不需要修改：

- `utils/db.ts` 的数据库版本和 store。
- WebDAV 数据格式和同步逻辑。
- 历史记录 JSON 导入格式。
- `wxt.config.ts` 的扩展权限；File System Access API 依靠用户目录选择授权，不增加可访问整个文件系统的扩展权限。

## 15. 异常场景

| 场景                       | 预期行为                                       |
| -------------------------- | ---------------------------------------------- |
| 用户取消目录选择           | 保留原配置，不报错，不改变启用状态             |
| 目录权限失效               | 停止写入，标记需要重新授权，保留上一次成功信息 |
| 目录被移动或删除           | 记录目录不可用，提示重新选择目录               |
| 磁盘空间不足               | 写入失败，不更新成功时间，不清理旧文件         |
| JSON 序列化失败            | 不创建成功状态，不清理旧文件                   |
| 新文件写入失败             | 尝试 `abort()`，记录失败                       |
| 新文件成功、旧文件清理失败 | 保留新文件，报告备份成功并记录清理警告         |
| 当前历史从非空变为空       | 自动任务停止写入和清理，提示检查数据           |
| 浏览器关闭或设备休眠       | 不执行；恢复运行后下次检查补做一份             |
| alarm 丢失                 | background 初始化时检查并补建                  |
| alarm 与立即备份同时触发   | 通过单例 Promise 避免并发写入                  |
| Firefox 构建               | 编译通过；界面降级，不调用 Chromium 专有选择器 |
| 恢复出厂设置               | 清除历史、配置和句柄，但不删除备份目录中的文件 |

## 16. 验收标准

### 16.1 首次配置

- 支持浏览器中可以从设置页打开系统目录选择器。
- 用户取消选择时不改变原状态。
- 选择目录后只展示目录名称，不展示或猜测完整路径。
- 目录句柄能在关闭并重新打开扩展页面后从 IndexedDB 读取。
- `browser.storage.local` 中没有目录句柄对象，只包含普通配置和状态。
- 首次开启自动备份后立即生成一份历史记录 JSON。

### 16.2 文件与恢复

- 文件名符合 `bilibili-history-YYYY-MM-DD-HHmmss.json`。
- 文件内容顶层是数组，与现有手动历史 JSON 导出结构一致。
- 文件可以通过现有历史记录 JSON 导入入口成功恢复。
- 自动备份只包含历史记录，不包含音乐、收藏夹或订阅合集字段。
- 同一天多次立即备份不会覆盖已有文件。

### 16.3 定时与保留

- 未达到周期时 alarm 不生成文件。
- 达到周期后生成一份文件并更新成功状态。
- 浏览器恢复运行且周期已过时补做一份，不为每个错过周期生成多份。
- 超出保留份数后只删除符合严格自动备份命名规则的最旧文件。
- 新备份失败时不删除任何旧文件。
- 用户目录中的其他文件、子目录、手动导出文件不受影响。

### 16.4 权限与错误

- 权限为 `prompt` 或 `denied` 时后台不调用 `requestPermission()`。
- 设置页展示需要重新授权状态，并允许用户点击恢复授权。
- 写入失败后保留上一次成功时间、文件名和记录数。
- 文件成功关闭前不记录成功。
- 最近一次非空备份后当前数据变为空时，自动任务不生成新文件、不清理旧文件。

### 16.5 兼容性与回归

- `pnpm compile` 通过。
- `pnpm format:check` 通过。
- `pnpm build` 通过。
- `pnpm build:firefox` 通过。
- Chrome/Edge 手工验证目录选择、重新授权、立即备份、定时备份和文件轮换。
- Firefox 设置页不出现不可用的操作入口，现有手动导出和 WebDAV 不受影响。
- 现有 7 天备份提醒及“立即备份”下载行为不受影响。
- 恢复出厂设置后再次进入设置页显示为未配置目录且自动备份关闭。

## 17. 实施顺序

1. 增加 File System Access 类型支持和能力检测。
2. 新增独立 IndexedDB 目录句柄封装及其基本读写验证。
3. 从 `exportHistoryToJSON()` 提取历史 JSON 构建函数，确保手动导出结果不变。
4. 实现无 UI 的单次本地目录备份、状态写入和旧文件清理。
5. 在 background 中增加 alarm 初始化、定时分支、并发保护和消息处理。
6. 在设置页增加目录选择、重新授权、启用开关、周期、保留份数、立即备份和状态展示。
7. 将恢复出厂设置接入目录句柄清理。
8. 完成 Chromium 手工验证以及 Chrome、Firefox 构建回归。

## 18. 评审重点

请重点确认以下产品与技术决策：

1. 第一版是否确认只备份历史记录，并保持现有 `HistoryItem[]` 文件格式。
2. 是否接受目录句柄存独立 IndexedDB、普通配置与状态存 `browser.storage.local`。
3. 默认周期是否采用 24 小时，以及是否需要第一版就允许选择 6 小时至 7 天。
4. 默认保留是否采用 30 份，以及是否需要第一版就允许选择 7、14、30、60 份。
5. 最近一次非空备份后当前数据变为空时，是否确认自动停止写入和清理。
6. 自动备份成功是否继续不影响现有固定 7 天备份提醒。
7. Firefox 是否采用只读降级说明，并继续推荐手动导出或 WebDAV。

## 19. 参考资料

- [Chrome Extension Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [File System Access API：保存文件和目录句柄到 IndexedDB](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access#storing_file_handles_or_directory_handles_in_indexeddb)
- [Chrome File System Access 持久权限](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api)
- [Chrome Alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms)
- [MDN：Window.showDirectoryPicker()](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)
- [MDN：FileSystemHandle.requestPermission()](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/requestPermission)
