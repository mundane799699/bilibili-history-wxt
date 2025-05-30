export const IS_SYNC_DELETE = "isSyncDelete";

export const IS_SYNCING = "isSyncing";

export const HAS_FULL_SYNC = "hasFullSync";

export const SYNC_INTERVAL = "syncInterval";

export const SYNC_TIME_REMAIN = "syncTimeRemain";

export const UPDATE_HISTORY = [
  {
    date: "2025-05-30",
    version: "1.6.2",
    changes: ["修复了旧版本专栏的跳转", "间隔时间可以手动输入"],
  },
  {
    date: "2025-05-28",
    version: "1.6.1",
    changes: ["日期选择增加+、-按钮"],
  },
  {
    date: "2025-05-24",
    version: "1.6.0",
    changes: ["代码开源", "增加设置自动同步时间间隔功能"],
  },
  {
    date: "2025-05-22",
    version: "1.5.0",
    changes: ["修改导出功能，增加导入功能"],
  },
  {
    date: "2025-05-18",
    version: "1.4.2",
    changes: ["修复了打开浏览器历史页面跳转到插件页面的问题"],
  },
  {
    date: "2025-05-18",
    version: "1.4.1",
    changes: ["修复了1.4.0版本引入的视频跳转的bug"],
  },
  {
    date: "2025-05-18",
    version: "1.4.0",
    changes: ["修复了番剧和课堂的跳转", "侧边栏添加了更新日志和反馈"],
  },
] as const;
