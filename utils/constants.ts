export const IS_SYNC_DELETE = "isSyncDelete";

export const IS_SYNCING = "isSyncing";

export const HAS_FULL_SYNC = "hasFullSync";

export const SYNC_INTERVAL = "syncInterval";

export const SYNC_TIME_REMAIN = "syncTimeRemain";

export const UPDATE_HISTORY = [
  {
    version: "1.5.0",
    changes: ["修改导出功能，增加导入功能"],
  },
  {
    version: "1.4.2",
    changes: ["修复了打开浏览器历史页面跳转到插件页面的问题"],
  },
  {
    version: "1.4.1",
    changes: ["修复了1.4.0版本引入的视频跳转的bug"],
  },
  {
    version: "1.4.0",
    changes: ["修复了番剧和课堂的跳转", "侧边栏添加了更新日志和反馈"],
  },
] as const;
