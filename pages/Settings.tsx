import { useState, useEffect } from "react";
import { Check, HardDrive, RefreshCw } from "lucide-react";
import { clearHistory, deleteDB } from "../utils/db";
import { getStorageValue, setStorageValue } from "../utils/storage";
import {
  IS_SYNC_DELETE,
  SYNC_INTERVAL,
  IS_SYNC_DELETE_FROM_BILIBILI,
  HIDE_USER_INFO,
  HIDDEN_MENUS,
  DATE_SELECTION_MODE,
  HISTORY_LOAD_MODE,
  FIRST_RUN_GUIDE_COMPLETED,
} from "../utils/constants";
import toast from "react-hot-toast";
import { Checkbox } from "../components/Checkbox";
import { Select } from "../components/Select";
import { checkStorageHealth, formatStorageSize, StorageHealthReport } from "../utils/storageHealth";
import { clearLocalBackupDirectoryHandle } from "../utils/localBackupHandle";

const Settings = () => {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isSyncDelete, setIsSyncDelete] = useState(false);
  const [isSyncDeleteFromBilibili, setIsSyncDeleteFromBilibili] = useState(true);
  const [isHideUserInfo, setIsHideUserInfo] = useState(false);
  const [hiddenMenus, setHiddenMenus] = useState<string[]>([]);
  const [dateSelectionMode, setDateSelectionMode] = useState<"range" | "single">("range");
  const [historyLoadMode, setHistoryLoadMode] = useState<"pagination" | "scroll">("pagination");

  const [showResetResultDialog, setShowResetResultDialog] = useState(false);
  const [resetResult, setResetResult] = useState("");
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState("");

  const [syncInterval, setSyncInterval] = useState<number | string>(1);
  const [storageHealth, setStorageHealth] = useState<StorageHealthReport | null>(null);
  const [isCheckingStorage, setIsCheckingStorage] = useState(false);
  const [storageHealthError, setStorageHealthError] = useState("");

  const refreshStorageHealth = async (showSuccess = false) => {
    setIsCheckingStorage(true);
    setStorageHealthError("");
    try {
      const report = await checkStorageHealth(true);
      setStorageHealth(report);
      if (showSuccess) toast.success("存储保护状态已刷新");
    } catch (error) {
      console.error("检查存储保护状态失败:", error);
      setStorageHealthError(error instanceof Error ? error.message : "未知错误");
      if (showSuccess) toast.error("存储保护状态检查失败");
    } finally {
      setIsCheckingStorage(false);
    }
  };

  useEffect(() => {
    // 加载设置
    const loadSettings = async () => {
      const syncDelete = await getStorageValue(IS_SYNC_DELETE, false);
      const syncDeleteFromBilibili = await getStorageValue(IS_SYNC_DELETE_FROM_BILIBILI, true);
      const hideUserInfo = await getStorageValue(HIDE_USER_INFO, false);
      const menus = await getStorageValue<string[]>(HIDDEN_MENUS, []);
      const storedSyncInterval = await getStorageValue(SYNC_INTERVAL, 1);
      const storedDateMode = await getStorageValue(DATE_SELECTION_MODE, "range");
      const storedHistoryLoadMode = await getStorageValue(HISTORY_LOAD_MODE, "pagination");

      setIsSyncDelete(syncDelete);
      setIsSyncDeleteFromBilibili(syncDeleteFromBilibili);
      setIsHideUserInfo(hideUserInfo);
      setHiddenMenus(
        menus.includes("WebDAV") && !menus.includes("数据备份") ? [...menus, "数据备份"] : menus,
      );
      setSyncInterval(storedSyncInterval);
      setDateSelectionMode(storedDateMode as "range" | "single");
      setHistoryLoadMode(storedHistoryLoadMode as "pagination" | "scroll");
    };
    loadSettings();
    void refreshStorageHealth();
  }, []);

  const handleSyncDeleteChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setIsSyncDelete(newValue);
    await setStorageValue(IS_SYNC_DELETE, newValue);
  };

  const handleSyncDeleteFromBilibiliChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setIsSyncDeleteFromBilibili(newValue);
    await setStorageValue(IS_SYNC_DELETE_FROM_BILIBILI, newValue);
  };

  const handleHideUserInfoChange = async (checked: boolean) => {
    setIsHideUserInfo(checked);
    await setStorageValue(HIDE_USER_INFO, checked);
  };

  const toggleHiddenMenu = async (title: string, checked: boolean) => {
    let newMenus;
    if (!checked) {
      // if unchecked, remove from hidden (show it)
      // logic: hiddenMenus contains items to HIDE.
      // Checkbox "Hide XXX". Checked = Included in hiddenMenus.
      // So if checkbox says "Hide Favorites" is checked, we add to list.
      // Wait, toggleHiddenMenu logic was:
      // if includes -> remove. else -> add.
      // Checkbox onChange gives NEW checked state.
      // If checked=true (user wants to Hide), we Add to list.
      // If checked=false (user wants to Show), we Remove from list.
      newMenus = hiddenMenus.filter((t) => t !== title);
    } else {
      newMenus = [...hiddenMenus, title];
    }
    // Correct logic re-check:
    // If we receive `checked` as true, it means "Hide this menu". So title should be in hiddenMenus.
    if (checked) {
      if (!hiddenMenus.includes(title)) newMenus = [...hiddenMenus, title];
      else newMenus = hiddenMenus;
    } else {
      newMenus = hiddenMenus.filter((t) => t !== title);
    }

    setHiddenMenus(newMenus);
    await setStorageValue(HIDDEN_MENUS, newMenus);
  };

  const replayFirstRunGuide = async () => {
    await setStorageValue(FIRST_RUN_GUIDE_COMPLETED, false);
    toast.success("首次引导将在当前页面重新打开");
  };

  const handleSyncIntervalChange = async (val: string | number) => {
    setSyncInterval(val);
    const num = Number(val);
    if (!isNaN(num) && num >= 1) {
      await setStorageValue(SYNC_INTERVAL, num);
    }
  };

  const handleReset = async () => {
    try {
      setIsResetLoading(true);
      setResetStatus("正在清空历史记录...");
      await clearHistory();
      setResetStatus("正在清理备份目录授权...");
      await clearLocalBackupDirectoryHandle();
      setResetStatus("正在清理存储...");
      await browser.storage.local.clear();
      setResetStatus("正在删除全部本地数据...");
      await deleteDB();
      setResetStatus("正在重新加载...");
      setResetResult("恢复出厂设置成功！");
    } catch (error) {
      console.error("恢复出厂设置失败:", error);
      setResetResult("恢复出厂设置失败，请重试！");
    } finally {
      setIsResetLoading(false);
      setResetStatus("");
      setShowResetResultDialog(true);
      setShowConfirmDialog(false);
    }
  };

  return (
    <div className="p-6 pb-20 min-h-screen bg-gray-50/30 dark:bg-[#0a0a0a] text-gray-900 dark:text-neutral-100 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* 左列：数据与存储管理 */}
        <div className="space-y-6">
          <div className="border-b border-gray-200 dark:border-neutral-800 pb-2 mb-4">
            <h2 className="text-base font-bold text-gray-800 dark:text-neutral-200 flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-blue-500" />
              数据与存储管理
            </h2>
          </div>

          <div className="w-full rounded-xl border border-gray-200 bg-gray-50 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between gap-4 p-5">
              <div>
                <h3 className="text-base font-medium text-gray-800 dark:text-neutral-100">
                  首次引导
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
                  重新查看历史记录和备份功能介绍
                </p>
              </div>
              <button
                type="button"
                onClick={() => void replayFirstRunGuide()}
                className="shrink-0 rounded-lg border border-blue-300 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50 dark:border-blue-500/30 dark:text-blue-300 dark:hover:bg-blue-500/10"
              >
                重新查看
              </button>
            </div>
          </div>

          {/* Edge/Chromium 存储保护 */}
          <div className="w-full rounded-xl bg-gray-50 dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800">
            <div className="p-5">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <HardDrive className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 dark:text-neutral-100 mb-1">
                      本地存储保护
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-neutral-400">
                      检查 IndexedDB 持久化状态和可用容量
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshStorageHealth(true)}
                  disabled={isCheckingStorage}
                  className="p-2 rounded-lg text-gray-500 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                  title="刷新存储保护状态"
                >
                  <RefreshCw className={`w-4 h-4 ${isCheckingStorage ? "animate-spin" : ""}`} />
                </button>
              </div>

              {storageHealth ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-neutral-400">扩展存储保护</span>
                    <span
                      className={
                        storageHealth.storageProtected
                          ? "font-medium text-green-600 dark:text-green-400"
                          : "font-medium text-amber-600 dark:text-amber-400"
                      }
                    >
                      {storageHealth.storageProtected ? "已启用" : "未启用"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-gray-500 dark:text-neutral-400">保护方式</span>
                    <span className="text-right font-medium text-gray-700 dark:text-neutral-200">
                      {storageHealth.unlimitedStorageGranted
                        ? "unlimitedStorage 权限"
                        : storageHealth.persisted
                          ? "浏览器持久化存储"
                          : "无"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-neutral-400">当前使用量</span>
                    <span className="font-medium text-gray-700 dark:text-neutral-200">
                      {formatStorageSize(storageHealth.usage)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-neutral-400">估算配额</span>
                    <span className="font-medium text-gray-700 dark:text-neutral-200">
                      {formatStorageSize(storageHealth.quota)}
                    </span>
                  </div>

                  {storageHealth.unlimitedStorageGranted && !storageHealth.persisted && (
                    <div className="rounded-lg border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-3 py-2 text-blue-700 dark:text-blue-300">
                      unlimitedStorage
                      权限已生效。浏览器未单独标记持久化存储不影响扩展存储保护，无需手动授权。
                    </div>
                  )}

                  {!storageHealth.storageProtected && (
                    <div className="rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
                      未检测到 unlimitedStorage
                      权限或浏览器持久化存储。请先重新加载扩展，并建议定期导出 JSON 或配置 WebDAV
                      备份。
                    </div>
                  )}

                  {(storageHealth.errors.length > 0 || storageHealthError) && (
                    <div className="rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-red-700 dark:text-red-300">
                      存储状态检测出现异常：
                      {storageHealthError ||
                        storageHealth.errors.map((error) => error.name).join("、")}
                      。建议立即导出 JSON 或检查 WebDAV 备份。
                    </div>
                  )}

                  {storageHealth.lastWarning && (
                    <div className="rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-red-700 dark:text-red-300">
                      最近一次存储写入异常：{storageHealth.lastWarning.name}（
                      {new Date(storageHealth.lastWarning.timestamp).toLocaleString()}
                      ）。建议立即检查备份。
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-neutral-400">
                  {isCheckingStorage ? "正在检查存储状态..." : storageHealthError || "暂无存储信息"}
                </p>
              )}
            </div>
          </div>

          {/* 恢复出厂设置 */}
          <div className="w-full rounded-lg bg-gray-50 dark:bg-neutral-900 hover:bg-gray-100 dark:hover:bg-neutral-800 border border-transparent dark:border-neutral-800 hover:border-gray-200 dark:hover:border-neutral-700 transition-all duration-300 ease-in-out">
            <div className="flex items-center justify-between p-4">
              <div>
                <h3 className="text-lg font-medium text-gray-800 dark:text-neutral-100">
                  恢复出厂设置
                </h3>
                <p className="text-sm text-gray-400 dark:text-neutral-500">
                  清空所有数据，无法恢复
                </p>
              </div>
              <button
                onClick={() => setShowConfirmDialog(true)}
                className="px-4 py-2 text-sm text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 border border-red-200 dark:border-red-500/20 rounded-lg transition-colors disabled:opacity-50"
                disabled={isResetLoading}
              >
                恢复出厂
              </button>
            </div>
          </div>
        </div>

        {/* 右列：同步与界面偏好 */}
        <div className="space-y-6">
          <div className="border-b border-gray-200 dark:border-neutral-800 pb-2 mb-4">
            <h2 className="text-base font-bold text-gray-800 dark:text-neutral-200 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-fuchsia-500" />
              同步与界面偏好
            </h2>
          </div>

          {/* 历史记录自动同步时间间隔 */}
          <div className="w-full rounded-xl bg-gray-50 dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800 hover:border-gray-200 dark:hover:border-neutral-700 transition-colors">
            <div className="flex items-center justify-between p-5">
              <div>
                <h3 className="text-base font-medium text-gray-800 dark:text-neutral-100">
                  历史记录自动同步时间间隔
                </h3>
                <p className="text-xs text-fuchsia-500 mt-1">单位：分钟</p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleSyncIntervalChange(Number(syncInterval) - 1)}
                  className="w-8 h-8 flex items-center justify-center text-gray-500 dark:text-neutral-300 bg-gray-100 dark:bg-neutral-800 rounded-full hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50"
                  disabled={Number(syncInterval) <= 1}
                >
                  -
                </button>
                <input
                  type="number"
                  value={syncInterval}
                  onChange={(e) => handleSyncIntervalChange(e.target.value)}
                  onBlur={() => {
                    const num = Number(syncInterval);
                    if (isNaN(num) || num < 1) {
                      handleSyncIntervalChange(1);
                    }
                  }}
                  className="w-16 text-center text-lg text-gray-700 dark:text-neutral-100 font-mono font-medium bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-neutral-600 focus:border-fuchsia-500 outline-none transition-colors"
                />
                <button
                  onClick={() => handleSyncIntervalChange(Number(syncInterval) + 1)}
                  className="w-8 h-8 flex items-center justify-center text-white bg-fuchsia-500 rounded-full hover:bg-fuchsia-600 transition-colors shadow-sm"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* 同步删除：插件 -> B站 */}
          <div className="w-full rounded-xl bg-gray-50 dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800 hover:border-gray-200 dark:hover:border-neutral-700 transition-colors">
            <div className="flex items-center justify-between p-5">
              <div className="pr-4">
                <h3 className="text-base font-medium text-gray-800 dark:text-neutral-100">
                  同步删除：插件 -&gt; B站
                </h3>
                <p className="text-xs text-gray-400 dark:text-neutral-500 mt-1">
                  删除本地记录时同步删除B站记录
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={isSyncDelete}
                  onChange={handleSyncDeleteChange}
                />
                <div className="w-11 h-6 bg-gray-200 dark:bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-neutral-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

          {/* 同步删除：B站 -> 插件 */}
          <div className="w-full rounded-xl bg-gray-50 dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800 hover:border-gray-200 dark:hover:border-neutral-700 transition-colors">
            <div className="flex items-center justify-between p-5">
              <div className="pr-4">
                <h3 className="text-base font-medium text-gray-800 dark:text-neutral-100">
                  同步删除：B站 -&gt; 插件
                </h3>
                <p className="text-xs text-gray-400 dark:text-neutral-500 mt-1">
                  B站删记录时同步删除本地记录
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={isSyncDeleteFromBilibili}
                  onChange={handleSyncDeleteFromBilibiliChange}
                />
                <div className="w-11 h-6 bg-gray-200 dark:bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-neutral-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

          {/* 历史记录加载方式 */}
          <div className="w-full rounded-xl bg-gray-50 dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800">
            <div className="p-5">
              <h3 className="text-lg font-bold text-gray-800 dark:text-neutral-100 mb-1">
                历史记录加载方式
              </h3>
              <p className="text-sm text-gray-500 dark:text-neutral-400 mb-6">
                控制历史记录页面的数据加载方式
              </p>

              <div className="flex gap-6">
                {(
                  [
                    { value: "pagination", label: "分页加载" },
                    { value: "scroll", label: "下拉加载" },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <input
                      type="radio"
                      name="historyLoadMode"
                      value={option.value}
                      checked={historyLoadMode === option.value}
                      onChange={async () => {
                        setHistoryLoadMode(option.value);
                        await setStorageValue(HISTORY_LOAD_MODE, option.value);
                      }}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-neutral-700 transition-all cursor-pointer"
                    />
                    <span className="text-sm text-gray-600 dark:text-neutral-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* 界面管理 */}
          <div className="w-full rounded-xl bg-gray-50 dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800">
            <div className="p-5">
              <h3 className="text-lg font-bold text-gray-800 dark:text-neutral-100 mb-1">
                界面管理
              </h3>
              <p className="text-sm text-gray-500 dark:text-neutral-400 mb-6">
                自定义界面显示与交互
              </p>

              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-neutral-300 block mb-3">
                    日期选择方式
                  </label>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="radio"
                        name="dateSelectionMode"
                        value="range"
                        checked={dateSelectionMode === "range"}
                        onChange={async () => {
                          setDateSelectionMode("range");
                          await setStorageValue(DATE_SELECTION_MODE, "range");
                        }}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-neutral-700 transition-all cursor-pointer"
                      />
                      <span className="text-sm text-gray-600 dark:text-neutral-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        范围选择 (起始 - 结束)
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="radio"
                        name="dateSelectionMode"
                        value="single"
                        checked={dateSelectionMode === "single"}
                        onChange={async () => {
                          setDateSelectionMode("single");
                          await setStorageValue(DATE_SELECTION_MODE, "single");
                        }}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-neutral-700 transition-all cursor-pointer"
                      />
                      <span className="text-sm text-gray-600 dark:text-neutral-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        单日选择 (点选日期)
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 侧边栏菜单管理 */}
          <div className="w-full rounded-xl bg-gray-50 dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800">
            <div className="p-5">
              <h3 className="text-lg font-bold text-gray-800 dark:text-neutral-100 mb-1">
                侧边栏菜单管理
              </h3>
              <p className="text-sm text-gray-500 dark:text-neutral-400 mb-6">
                选择需要隐藏并禁用的菜单项
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Checkbox
                  label="隐藏用户信息"
                  checked={isHideUserInfo}
                  onChange={handleHideUserInfoChange}
                />

                {["收藏夹", "合集", "AI探索", "听歌", "云同步", "数据备份", "关于", "反馈"].map(
                  (title) => (
                    <Checkbox
                      key={title}
                      label={`隐藏${title}`}
                      checked={hiddenMenus.includes(title)}
                      onChange={(checked) => toggleHiddenMenu(title, checked)}
                    />
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 确认弹窗 */}
      {/* ... (Dialog code) ... */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-xl shadow-xl max-w-sm w-full mx-4 border border-transparent dark:border-neutral-800">
            <h3 className="text-lg font-bold text-gray-900 dark:text-neutral-100 mb-2">
              确认恢复出厂设置？
            </h3>
            <p className="text-gray-500 dark:text-neutral-400 mb-6 text-sm leading-relaxed">
              此操作将<span className="text-red-600 font-medium">永久删除</span>
              所有本地存储的历史记录和偏好设置。
            </p>
            {isResetLoading && (
              <p className="text-blue-600 mb-4 text-sm animate-pulse">{resetStatus}</p>
            )}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-neutral-300 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                disabled={isResetLoading}
              >
                取消
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
                disabled={isResetLoading}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetResultDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-xl shadow-xl max-w-sm w-full mx-4 text-center border border-transparent dark:border-neutral-800">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={24} />
            </div>
            <p className="text-lg text-gray-800 dark:text-neutral-100 mb-6 font-medium">
              {resetResult}
            </p>
            <button
              onClick={() => setShowResetResultDialog(false)}
              className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              确定
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
