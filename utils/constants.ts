export const IS_SYNC_DELETE = "isSyncDelete";
export const IS_SYNC_DELETE_FROM_BILIBILI = "isSyncDeleteFromBilibili";

export const IS_SYNCING = "isSyncing";
export const IS_SYNCING_FAV = "isSyncingFav";

export const HAS_FULL_SYNC = "hasFullSync";

export const SYNC_INTERVAL = "syncInterval";

export const SYNC_TIME_REMAIN = "syncTimeRemain";

export const FAV_SYNC_INTERVAL = "favSyncInterval"; // 单位：分钟，默认 60*24 (1天)
export const FAV_SYNC_TIME_REMAIN = "favSyncTimeRemain"; // 单位：分钟

export const HIDE_USER_INFO = "hideUserInfo";
export const HIDDEN_MENUS = "hiddenMenus"; // Array of hidden titles
export const SYNC_PROGRESS_HISTORY = "syncProgressHistory";
export const SYNC_PROGRESS_FAV = "syncProgressFav";

export const UPDATE_HISTORY = [
  {
    date: "2026-02-05",
    version: "1.9.1",
    changes: [
      "历史记录搜索支持BV号搜索",
      "优化部分UI",
      "新增可隐藏并禁用侧边栏功能",
      "新增可视化同步进度条",
    ],
  },
  {
    date: "2026-02-02",
    version: "1.9.0beta",
    changes: [
      "历史记录支持按类型筛选",
      "收藏夹支持自动清理已取消收藏的内容",
      "收藏夹支持保留已失效视频的元数据",
      "收藏夹增加分页功能",
      "优化UI界面",
    ],
  },
  {
    date: "2025-11-10",
    version: "1.8.8",
    changes: ["同步删除：插件 -> B站, 不需要打开b站标签页"],
  },
  {
    date: "2025-10-22",
    version: "1.8.7",
    changes: ["修复播放模式的bug"],
  },
  {
    date: "2025-10-21",
    version: "1.8.6",
    changes: ["听歌页面增加随机播放和单曲循环功能"],
  },
  {
    date: "2025-10-16",
    version: "1.8.5",
    changes: ["修复了部分歌不能听的问题"],
  },
  {
    date: "2025-09-18",
    version: "1.8.4",
    changes: ["修复了部分歌不能听的问题"],
  },
  {
    date: "2025-09-16",
    version: "1.8.3",
    changes: ["修复了不能上传b站视频的bug"],
  },
  {
    date: "2025-09-14",
    version: "1.8.0",
    changes: ["增加听歌功能，超级棒！！！"],
  },
  {
    date: "2025-07-09",
    version: "1.7.2",
    changes: [
      "支持在B站网页端删除历史记录时同步删除插件历史记录",
      "修复刷新按钮不刷新总记录数的bug",
    ],
  },
  {
    date: "2025-06-28",
    version: "1.7.1",
    changes: [
      "优化云同步功能(正式启用)",
      "显示历史记录总数",
      "优化关于和反馈页面",
    ],
  },
  {
    date: "2025-06-15",
    version: "1.7.0",
    changes: [
      "增加云同步功能(测试阶段)",
      "pop中可选择增量同步或者全量同步",
      "优化菜单项",
    ],
  },
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
