# 数据备份提醒：7 天周期与直接导出设计方案（评审稿）

> 状态：已实现
>
> 影响范围：`entrypoints/my-history/App.tsx`、`components/DataBackupReminderModal.tsx`、`utils/constants.ts`
>
> 基线方案：[`data-backup-reminder-modal-design.md`](./data-backup-reminder-modal-design.md)

## 1. 结论

本次将数据备份提醒调整为固定的 7 天周期，并把“立即备份”从跳转设置页改为直接下载历史记录 JSON。

目标行为：

- 首次进入非欢迎页时显示提醒。
- 用户处理提醒后，7 天内不再自动显示；满 7 天后再次进入扩展时重新显示。
- “我已了解”、右上角关闭、点击遮罩、按 `Escape` 和成功执行“立即备份”都视为本轮提醒已处理，并共同开始下一个 7 天周期。
- 点击“立即备份”直接复用设置页的 `exportHistoryToJSON()`，下载同样的数据结构和同样命名规则的文件。
- 导出失败时保留弹窗，显示错误提示，不开始新的 7 天周期，用户可以重试或主动关闭。
- 继续保持版本更新弹窗优先、同一页面会话最多自动显示一次、欢迎页不显示等现有规则。

本方案按“每隔 7 天就弹出一次”的字面含义采用固定周期：近期 JSON 导出或 WebDAV 同步不再抑制提醒。主应用不再执行存储健康检查，弹窗统一使用常规备份文案。

## 2. 当前行为与目标行为

| 场景           | 当前行为                                        | 目标行为                          |
| -------------- | ----------------------------------------------- | --------------------------------- |
| 常规提醒周期   | 30 天                                           | 7 天                              |
| 近期已有备份   | 30 天内导出完整 JSON 或完成 WebDAV 同步时不显示 | 不影响固定 7 天提醒               |
| 点击“立即备份” | 关闭弹窗并跳转到 `/settings`                    | 在当前页面直接下载历史记录 JSON   |
| 导出内容       | 没有直接导出                                    | 与设置页“历史记录 + JSON”完全相同 |
| 导出失败       | 不适用                                          | 弹窗保持打开，可重试              |

## 3. 需求边界

### 3.1 本次目标

- 把弹窗提醒周期统一为 7 天。
- 用户无需离开当前页面即可导出历史记录 JSON。
- 复用现有导出函数，避免弹窗入口和设置页入口产生格式差异。
- 明确导出成功、导出失败、重复点击和状态写入失败时的交互。
- 保持现有弹窗视觉、无障碍和版本更新弹窗协调逻辑。

### 3.2 非目标

- 不修改设置页的导出交互。
- 不修改 `exportHistoryToJSON()` 的数据格式、文件名或 JSON 排版。
- 不导出喜欢的音乐、收藏夹、订阅合集等其他数据。
- 不把本按钮改为 WebDAV 备份或“导出所有数据”。
- 不修改导入格式和恢复逻辑。
- 不在本次改动中删除旧状态键；不再参与判断的键可以保留，避免无关迁移和兼容风险。

## 4. 提醒周期设计

### 4.1 唯一周期依据

继续复用现有状态键：

```ts
BACKUP_REMINDER_LAST_DISMISSED_AT = "backupReminderLastDismissedAt";
```

该值表示“最近一次处理备份提醒的时间”，虽然键名保留 `DISMISSED`，但成功点击“立即备份”也属于处理提醒。

固定间隔：

```ts
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const BACKUP_REMINDER_INTERVAL_MS = 7 * DAY_IN_MS;

const reminderDue =
  lastDismissedAt === 0 || Date.now() - lastDismissedAt >= BACKUP_REMINDER_INTERVAL_MS;
```

边界定义：

- 没有记录过时间：立即显示。
- 距上次处理不足 7 个完整的 24 小时：不显示。
- 恰好达到或超过 7 个完整的 24 小时：显示。
- 周期按毫秒计算，不按自然周或本地零点计算，避免时区和夏令时造成歧义。
- 弹窗打开后，如果用户直接关闭扩展页面而没有执行任何按钮，不更新时间；下次进入时仍可显示。

### 4.2 不再使用备份时间抑制提醒

`BackupReminderController` 不再读取以下时间来决定常规提醒是否到期：

- `BACKUP_LAST_EXPORT_AT`
- `WEBDAV_LAST_SYNC`

原因是本次目标是固定每 7 天提醒，而不是“只有近期没有备份才提醒”。用户在设置页导出历史记录、在 WebDAV 页导出所有数据或完成 WebDAV 同步，都不会改变弹窗的固定周期。

这些状态仍可供 WebDAV 页面展示或其他功能使用，本次不删除常量和已保存的数据。

### 4.3 不执行存储健康检查

主应用不再调用 `checkStorageHealth()`，也不保存或向布局透传存储健康状态。备份提醒只判断固定 7 天周期，不再区分常规提醒和存储风险提醒。

同步移除：

- `storageHealth`
- `storageHealthChecked`
- `storageHealthCheckFailed`
- `BackupReminderReason`
- `BACKUP_LAST_RISK_WARNING_AT`

设置页自身的存储状态展示属于独立功能，不受本方案影响。

### 4.4 仍然保留的显示约束

- `/welcome` 不显示提醒。
- 版本更新弹窗优先，关闭后等待现有约 300 ms 再判断备份提醒。
- 两个自动弹窗不得叠加。
- 同一页面会话最多自动显示一次。
- 读取提醒状态失败时按“本次应提醒”降级，但同一会话仍只显示一次。

## 5. “立即备份”设计

### 5.1 复用设置页导出实现

`App.tsx` 直接导入并调用：

```ts
import { exportHistoryToJSON } from "../../utils/export";
```

不得在 `App.tsx` 或弹窗组件中重新拼装 JSON、`Blob` 和下载链接。这样两个入口天然保持一致：

- 数据来源：`getAllHistory()`。
- JSON 顶层结构：`HistoryItem[]`。
- JSON 格式：`JSON.stringify(items, null, 2)`。
- MIME：`application/json;charset=utf-8`。
- 文件名：`bilibili-history-YYYY-MM-DD.json`。

这里的“备份”仅指历史记录 JSON，不是 WebDAV 页的全量备份包。

### 5.2 操作顺序

建议流程：

```text
点击“立即备份”
        │
        ├─ 已在导出中 ───────────────> 忽略重复点击
        │
        └─ 设置导出中状态
                 │
                 v
          exportHistoryToJSON()
                 │
       ┌─────────┴─────────┐
       │                   │
       v                   v
   Promise 成功         Promise 失败
       │                   │
       ├─ 关闭弹窗          ├─ 保持弹窗打开
       ├─ 记录处理时间      ├─ 不记录处理时间
       └─ 成功 toast        └─ 错误 toast，可重试
```

“Promise 成功”表示历史数据读取、JSON 序列化和浏览器下载触发均未抛出异常。由于网页无法确认用户是否取消下载或文件是否最终写入磁盘，文案不承诺物理文件已经保存完成。

建议提示：

- 成功：`历史记录 JSON 已开始下载`
- 失败：`备份失败，请重试`

### 5.3 导出中状态

为防止快速重复点击触发多个下载，`BackupReminderController` 增加 `isBackingUp` 状态，并传给展示组件：

```ts
interface DataBackupReminderModalProps {
  open: boolean;
  isBackingUp: boolean;
  onClose: () => void;
  onBackup: () => void;
}
```

导出期间：

- 主按钮禁用。
- 按钮文字改为“备份中...”。
- “我已了解”、右上角关闭、遮罩和 `Escape` 仍可关闭弹窗；关闭行为照常记录本轮提醒已处理。
- 异步导出完成后只负责提示结果，不应因为组件已关闭而再次打开弹窗。

历史记录量较大时 `getAllHistory()` 和序列化可能占用一定时间，明确的进行中反馈可以避免重复下载。

### 5.4 成功后的时间记录

成功导出后调用现有关闭/记账逻辑，更新：

```ts
BACKUP_REMINDER_LAST_DISMISSED_AT = Date.now();
```

本入口不更新 `BACKUP_LAST_EXPORT_AT`，原因是该键在现有设计中表示 WebDAV 页“导出所有数据”的时间，而本次只导出历史记录。固定 7 天提醒也不依赖该键。

下载已经触发但提醒时间写入失败时：

- 仍关闭弹窗并提示下载已开始。
- 控制台记录状态写入错误。
- 当前会话依靠内存标志避免重复显示。
- 下次打开扩展可能再次提醒，属于安全侧降级。

### 5.5 导出失败

`exportHistoryToJSON()` 已会记录底层错误并向上抛出。控制器捕获异常后：

- 清除 `isBackingUp`。
- 不调用 `dismissReminder()`。
- 保持弹窗打开。
- 展示错误 toast。

用户仍可再次点击“立即备份”，或通过其他关闭入口结束本轮提醒。

## 6. 组件职责与文件改动

### 6.1 `entrypoints/my-history/App.tsx`

- 把提醒间隔从 30 天改为 7 天，并统一常规/风险提醒的时间判断。
- 提醒判断只读取 `BACKUP_REMINDER_LAST_DISMISSED_AT`。
- 移除“近期完整导出或 WebDAV 同步抑制提醒”的判断。
- 移除应用启动时的存储健康检查、相关状态和组件属性透传。
- 移除点击按钮后的 `/settings` 导航。
- 调用 `exportHistoryToJSON()`，管理导出中、成功、失败和提醒记账。
- 使用现有全局 `Toaster` 显示结果。

`useLocation()`、`useNavigate()` 如果没有其他用途，应从 `BackupReminderController` 及对应 import 中移除。

### 6.2 `components/DataBackupReminderModal.tsx`

- 新增 `isBackingUp` 属性。
- 导出中禁用主按钮并显示“备份中...”。
- 移除存储风险类型、风险图标和风险文案。
- 保持现有焦点陷阱、`Escape`、遮罩关闭、焦点恢复、明暗主题和窄屏样式。
- 不在展示组件内访问 IndexedDB、存储状态或执行导出。

### 6.3 `utils/export.ts`

原则上无需修改。弹窗和设置页共同复用现有 `exportHistoryToJSON()`。

如果实现时发现下载链接过早 `URL.revokeObjectURL()` 导致特定浏览器下载不稳定，应单独修复公共函数并同时回归两个入口；这不属于本需求的默认改动。

### 6.4 不改动的文件

- `pages/Settings.tsx`：继续按当前方式调用 `exportHistoryToJSON()`。
- `pages/WebDavSync.tsx`：继续维护全量导出和 `BACKUP_LAST_EXPORT_AT`。
- `utils/constants.ts`：移除不再使用的 `BACKUP_LAST_RISK_WARNING_AT`。
- `entrypoints/background.ts`：WebDAV 后台同步不受影响。

## 7. 状态转换

```text
应用进入非欢迎页
  │
  ├─ 版本更新弹窗未处理 ─────────────> 先显示版本更新弹窗
  │                                      └─ 关闭后继续判断
  │
  └─ 读取最近处理时间
         │
         ├─ 未满 7 天 ───────────────> 不显示
         └─ 已满 7 天或从未记录 ─────> 显示常规备份提醒

提醒已打开
  ├─ 了解/关闭/遮罩/Escape ──────────> 关闭 + 记录当前时间
  └─ 立即备份
         ├─ 成功触发下载 ─────────────> 关闭 + 记录当前时间 + 成功提示
         └─ 失败 ─────────────────────> 保持打开 + 错误提示
```

## 8. 验收标准

### 8.1 七天周期

- 没有 `BACKUP_REMINDER_LAST_DISMISSED_AT` 时，首次进入非欢迎页显示提醒。
- 上次处理时间距当前 `7 天 - 1 ms` 时不显示。
- 上次处理时间距当前恰好 7 天时显示。
- 上次处理时间距当前超过 7 天时显示。
- 任一关闭入口都会更新处理时间，之后 7 天内不再显示。
- 近期完成过设置页 JSON 导出、WebDAV 全量导出或同步，也不抑制到期提醒。
- 同一页面会话内关闭后切换路由，不会再次自动显示。

### 8.2 直接导出

- 点击“立即备份”不发生路由跳转。
- 下载文件名与设置页导出历史 JSON 一致：`bilibili-history-YYYY-MM-DD.json`。
- 下载内容与同一时刻设置页选择“历史记录 + JSON”导出的内容结构一致。
- 顶层为数组；空历史记录也能导出合法的 `[]`。
- 导出期间主按钮禁用，不能重复触发下载。
- 导出成功后关闭弹窗、提示下载已开始，并开始新的 7 天周期。
- 模拟 `getAllHistory()`、JSON 序列化或下载流程抛错时，弹窗保持打开、不更新时间，并显示错误提示。
- 导出过程中主动关闭弹窗时，不出现状态更新警告，也不会在导出完成后重新打开弹窗。

### 8.3 回归项

- 设置页的历史 JSON/CSV、音乐 JSON/CSV 导出行为不变。
- WebDAV 页的全量导出、备份和同步行为不变。
- 欢迎页不显示提醒。
- 版本更新弹窗与备份提醒不叠加。
- 明暗主题、窄屏、焦点陷阱、`Tab`/`Shift+Tab`、`Escape` 和焦点恢复行为不退化。

## 9. 验证计划

项目当前没有自动化测试脚本，本次实现后至少执行：

```bash
pnpm compile
pnpm format:check
```

手工验证建议使用浏览器开发者工具修改 `browser.storage.local` 中的 `backupReminderLastDismissedAt`，覆盖：首次、未满 7 天、恰好 7 天、超过 7 天和存储读取失败。

下载验证至少比较两份文件：

1. 从弹窗点击“立即备份”得到的 JSON。
2. 从设置页选择“历史记录 + JSON”得到的 JSON。

两者应具有相同文件名规则和顶层数据结构；如果验证期间历史数据没有变化，解析后的 JSON 内容也应一致。

## 10. 实施顺序

1. 调整 `BackupReminderController` 的 7 天判断和风险文案选择逻辑。
2. 接入 `exportHistoryToJSON()`，补齐导出状态、toast 和成功后记账。
3. 给 `DataBackupReminderModal` 增加导出中状态。
4. 清理不再需要的路由与备份时间依赖。
5. 执行类型检查、格式检查和手工回归。

## 11. 评审重点

请重点确认以下产品语义：

1. “每隔 7 天”是否采用本文的固定周期，即近期已导出或已完成 WebDAV 同步也照常提醒。
2. “立即备份”是否只导出历史记录，与设置页“历史记录 + JSON”一致，而不是 WebDAV 页的全量数据包。
3. 成功触发浏览器下载后即关闭弹窗并开始下一个周期，不等待也无法确认文件最终写入磁盘。
