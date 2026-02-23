import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { clearHistory, saveHistory } from "../utils/db";
import { getStorageValue, setStorageValue } from "../utils/storage";
import {
  IS_SYNC_DELETE,
  SYNC_INTERVAL,
  IS_SYNC_DELETE_FROM_BILIBILI,
  FAV_SYNC_INTERVAL,
  HIDE_USER_INFO,
  HIDDEN_MENUS,
  SYNC_PROGRESS_HISTORY,
  SYNC_PROGRESS_FAV,
  DATE_SELECTION_MODE,
} from "../utils/constants";
import {
  exportHistoryToCSV,
  exportHistoryToJSON,
  exportLikedMusicToJSON,
  exportLikedMusicToCSV,
} from "../utils/export";
import toast from "react-hot-toast";
import { HistoryItem, LikedMusic } from "../utils/types";
import { importLikedMusic } from "../utils/db";
import { Checkbox } from "../components/Checkbox";
import { Select } from "../components/Select";

const Settings = () => {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isSyncDelete, setIsSyncDelete] = useState(true);
  const [isSyncDeleteFromBilibili, setIsSyncDeleteFromBilibili] =
    useState(true);
  const [isHideUserInfo, setIsHideUserInfo] = useState(false);
  const [hiddenMenus, setHiddenMenus] = useState<string[]>([]);
  const [dateSelectionMode, setDateSelectionMode] = useState<"range" | "single">("range");

  // separate progress states
  const [historyProgress, setHistoryProgress] = useState<{ current: number, message: string } | null>(null);
  const [favProgress, setFavProgress] = useState<{ current: number, total: number, message: string } | null>(null);

  const [showResetResultDialog, setShowResetResultDialog] = useState(false);
  const [resetResult, setResetResult] = useState("");
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState("");

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const [exportSource, setExportSource] = useState<"history" | "music">("history");
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("json");

  const [syncInterval, setSyncInterval] = useState<number | string>(1);
  const [favSyncInterval, setFavSyncInterval] = useState<number | string>(15);

  useEffect(() => {
    // 加载设置
    const loadSettings = async () => {
      const syncDelete = await getStorageValue(IS_SYNC_DELETE, true);
      const syncDeleteFromBilibili = await getStorageValue(
        IS_SYNC_DELETE_FROM_BILIBILI,
        true
      );
      const hideUserInfo = await getStorageValue(HIDE_USER_INFO, false);
      const menus = await getStorageValue(HIDDEN_MENUS, []);
      const storedSyncInterval = await getStorageValue(SYNC_INTERVAL, 1);
      const storedFavSyncInterval = await getStorageValue(FAV_SYNC_INTERVAL, 15);
      const storedDateMode = await getStorageValue(DATE_SELECTION_MODE, "range");

      const histProg = await getStorageValue(SYNC_PROGRESS_HISTORY, null);
      const favProg = await getStorageValue(SYNC_PROGRESS_FAV, null);

      setIsSyncDelete(syncDelete);
      setIsSyncDeleteFromBilibili(syncDeleteFromBilibili);
      setIsHideUserInfo(hideUserInfo);
      setHiddenMenus(menus);
      setSyncInterval(storedSyncInterval);
      setFavSyncInterval(storedFavSyncInterval);
      setDateSelectionMode(storedDateMode as "range" | "single");

      setHistoryProgress(histProg);
      setFavProgress(favProg);
    };
    loadSettings();

    // 监听 storage 变化
    const handleStorageChange = (
      changes: { [key: string]: Browser.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === "local") {
        if (changes[SYNC_PROGRESS_HISTORY]) {
          setHistoryProgress(changes[SYNC_PROGRESS_HISTORY].newValue as { current: number; message: string } | null);
        }
        if (changes[SYNC_PROGRESS_FAV]) {
          setFavProgress(changes[SYNC_PROGRESS_FAV].newValue as { current: number; total: number; message: string } | null);
        }
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const handleSyncDeleteChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newValue = e.target.checked;
    setIsSyncDelete(newValue);
    await setStorageValue(IS_SYNC_DELETE, newValue);
  };

  const handleSyncDeleteFromBilibiliChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
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
      newMenus = hiddenMenus.filter(t => t !== title);
    }

    setHiddenMenus(newMenus);
    await setStorageValue(HIDDEN_MENUS, newMenus);
  };

  const handleSyncIntervalChange = async (val: string | number) => {
    setSyncInterval(val);
    const num = Number(val);
    if (!isNaN(num) && num >= 1) {
      await setStorageValue(SYNC_INTERVAL, num);
    }
  };

  const handleFavSyncIntervalChange = async (val: string | number) => {
    setFavSyncInterval(val);
    const num = Number(val);
    if (!isNaN(num) && num >= 1) {
      await setStorageValue(FAV_SYNC_INTERVAL, num);
    }
  };

  const handleReset = async () => {
    try {
      setIsResetLoading(true);
      setResetStatus("正在清空历史记录...");
      await clearHistory();
      setResetStatus("正在清理存储...");
      await browser.storage.local.clear();
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

  const handleExport = async () => {
    try {
      setIsExporting(true);
      if (exportSource === "history") {
        if (exportFormat === "csv") {
          await exportHistoryToCSV();
          toast.success("历史记录(CSV)导出成功！");
        } else {
          await exportHistoryToJSON();
          toast.success("历史记录(JSON)导出成功！");
        }
      } else {
        // Music
        if (exportFormat === "csv") {
          await exportLikedMusicToCSV();
          toast.success("音乐(CSV)导出成功！");
        } else {
          await exportLikedMusicToJSON();
          toast.success("音乐(JSON)导出成功！");
        }
      }
    } catch (error) {
      console.error(`导出失败:`, error);
      toast.error(`导出失败，请重试！`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    if (exportFormat === "csv") {
      toast.error("暂不支持导入CSV格式数据");
      return;
    }

    try {
      setIsImporting(true);
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".json";

      fileInput.onchange = async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = async (e) => {
            try {
              const jsonContent = e.target?.result as string;

              if (exportSource === "history") {
                const items = JSON.parse(jsonContent) as HistoryItem[];
                if (!Array.isArray(items) || items.some(item => typeof item.id === "undefined")) {
                  toast.error("文件格式错误，请确保是历史记录JSON");
                  return;
                }
                await saveHistory(items);
                toast.success("历史记录导入成功！");
              } else {
                // Music
                const items = JSON.parse(jsonContent) as LikedMusic[];
                if (!Array.isArray(items) || items.some(item => typeof item.bvid === "undefined")) {
                  toast.error("文件格式错误，请确保是音乐JSON");
                  return;
                }
                await importLikedMusic(items);
                toast.success("音乐导入成功！");
              }
            } catch (parseError) {
              console.error("解析文件失败:", parseError);
              toast.error("导入失败，文件内容错误");
            } finally {
              setIsImporting(false);
            }
          };
          reader.readAsText(file);
        } else {
          setIsImporting(false);
        }
      };

      fileInput.click();
    } catch (error) {
      console.error(`导入失败:`, error);
      toast.error("导入失败，请重试。");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="p-4 flex flex-col container mx-auto items-center pb-20">
      {/* 恢复出厂设置 */}
      <div className="w-full max-w-md mb-8 rounded-lg bg-gray-50 hover:bg-gray-100 border border-transparent hover:border-gray-200 transition-all duration-300 ease-in-out">
        <div className="flex items-center justify-between p-4 ">
          <div>
            <h3 className="text-lg font-medium text-gray-800">恢复出厂设置</h3>
            <p className="text-sm text-gray-400">
              清空所有数据，无法恢复
            </p>
          </div>
          <button
            onClick={() => setShowConfirmDialog(true)}
            className="px-4 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
            disabled={isResetLoading}
          >
            恢复出厂
          </button>
        </div>
      </div>

      {/* 历史记录同同进度显示 */}
      {historyProgress && historyProgress.message && (
        <div className="w-full max-w-md mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg animate-in fade-in duration-300">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium text-blue-800">历史记录同步中</span>
              <span className="text-xs text-blue-600 font-mono">
                {historyProgress.current > 0 ? `${historyProgress.current} 条` : ""}
              </span>
            </div>
            <p className="text-sm text-blue-600">{historyProgress.message}</p>
          </div>
        </div>
      )}

      {/* 收藏夹同步进度显示 */}
      {favProgress && favProgress.message && (
        <div className="w-full max-w-md mb-8 p-4 bg-purple-50 border border-purple-200 rounded-lg animate-in fade-in duration-300">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium text-purple-800">收藏夹同步中</span>
              <span className="text-xs text-purple-600 font-bold">
                {favProgress.total > 0 ? `${favProgress.current} / ${favProgress.total}` : `${favProgress.current}`}
              </span>
            </div>
            {favProgress.total > 0 && (
              <div className="w-full bg-purple-200 rounded-full h-2 mb-2">
                <div
                  className="bg-purple-600 h-2 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.min(100, (favProgress.current / favProgress.total) * 100)}%` }}
                ></div>
              </div>
            )}
            <p className="text-sm text-purple-600 truncate" title={favProgress.message}>{favProgress.message}</p>
          </div>
        </div>
      )}


      {/* 侧边栏菜单管理 */}
      <div className="w-full max-w-md mb-8 rounded-xl bg-white shadow-sm border border-gray-100">
        <div className="p-5">
          <h3 className="text-lg font-bold text-gray-800 mb-1">侧边栏菜单管理</h3>
          <p className="text-sm text-gray-500 mb-6">选择需要隐藏并禁用的菜单项</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Checkbox
              label="隐藏用户信息"
              checked={isHideUserInfo}
              onChange={handleHideUserInfoChange}
            />

            {["收藏夹", "听歌", "云同步", "关于", "反馈"].map(title => (
              <Checkbox
                key={title}
                label={`隐藏${title}`}
                checked={hiddenMenus.includes(title)}
                onChange={(checked) => toggleHiddenMenu(title, checked)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 界面管理 */}
      <div className="w-full max-w-md mb-8 rounded-xl bg-white shadow-sm border border-gray-100">
        <div className="p-5">
          <h3 className="text-lg font-bold text-gray-800 mb-1">界面管理</h3>
          <p className="text-sm text-gray-500 mb-6">自定义界面显示与交互</p>

          <div className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-3">日期选择方式</label>
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
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 transition-all cursor-pointer"
                  />
                  <span className="text-sm text-gray-600 group-hover:text-blue-600 transition-colors">范围选择 (起始 - 结束)</span>
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
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 transition-all cursor-pointer"
                  />
                  <span className="text-sm text-gray-600 group-hover:text-blue-600 transition-colors">单日选择 (点选日期)</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 数据管理 */}
      <div className="w-full max-w-md mb-8 rounded-xl bg-white shadow-sm border border-gray-100">
        <div className="p-5">
          <h3 className="text-lg font-bold text-gray-800 mb-6">数据管理</h3>

          <div className="flex flex-col gap-5">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* 数据源选择 */}
              <div className="flex-1">
                <Select
                  label="导出内容"
                  value={exportSource}
                  onChange={(val) => setExportSource(val as "history" | "music")}
                  options={[
                    { value: "history", label: "历史记录" },
                    { value: "music", label: "我喜欢的音乐" }
                  ]}
                />
              </div>

              {/* 格式选择 */}
              <div className="flex-1">
                <Select
                  label="导出格式"
                  value={exportFormat}
                  onChange={(val) => setExportFormat(val as "csv" | "json")}
                  options={[
                    { value: "json", label: "JSON" },
                    { value: "csv", label: "CSV" }
                  ]}
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={handleImport}
                disabled={isImporting || exportFormat === 'csv'}
                className="px-5 py-2.5 text-sm font-medium bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title={exportFormat === 'csv' ? "CSV格式不支持导入" : "导入所选内容的JSON文件"}
              >
                {isImporting ? "导入中..." : "导入 (JSON)"}
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg shadow-md hover:shadow-lg hover:bg-blue-700 transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isExporting ? "导出中..." : "导出"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-md mb-8 rounded-xl bg-white shadow-sm border border-gray-100 hover:border-gray-200 transition-colors">
        <div className="flex items-center justify-between p-5">
          <div className="pr-4">
            <h3 className="text-base font-medium text-gray-800">同步删除：插件 -&gt; B站</h3>
            <p className="text-xs text-gray-400 mt-1">
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
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>

      <div className="w-full max-w-md mb-8 rounded-xl bg-white shadow-sm border border-gray-100 hover:border-gray-200 transition-colors">
        <div className="flex items-center justify-between p-5">
          <div className="pr-4">
            <h3 className="text-base font-medium text-gray-800">同步删除：B站 -&gt; 插件</h3>
            <p className="text-xs text-gray-400 mt-1">
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
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>

      <div className="w-full max-w-md mb-8 rounded-xl bg-white shadow-sm border border-gray-100 hover:border-gray-200 transition-colors">
        <div className="flex items-center justify-between p-5">
          <div>
            <h3 className="text-base font-medium text-gray-800">
              自动同步时间间隔
            </h3>
            <p className="text-xs text-fuchsia-500 mt-1">单位：分钟</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleSyncIntervalChange(Number(syncInterval) - 1)}
              className="w-8 h-8 flex items-center justify-center text-gray-500 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors disabled:opacity-50"
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
              className="w-16 text-center text-lg text-gray-700 font-mono font-medium bg-transparent border-b border-transparent hover:border-gray-300 focus:border-fuchsia-500 outline-none transition-colors"
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

      <div className="w-full max-w-md mb-8 rounded-xl bg-white shadow-sm border border-gray-100 hover:border-gray-200 transition-colors">
        <div className="flex items-center justify-between p-5">
          <div>
            <h3 className="text-base font-medium text-gray-800">
              自动同步收藏夹间隔
            </h3>
            <p className="text-xs text-pink-500 mt-1">单位：分钟</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleFavSyncIntervalChange(Number(favSyncInterval) - 5)}
              className="w-8 h-8 flex items-center justify-center text-gray-500 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors disabled:opacity-50"
              disabled={Number(favSyncInterval) <= 5}
            >
              -
            </button>
            <input
              type="number"
              value={favSyncInterval}
              onChange={(e) => handleFavSyncIntervalChange(e.target.value)}
              onBlur={() => {
                const num = Number(favSyncInterval);
                if (isNaN(num) || num < 5) {
                  handleFavSyncIntervalChange(15);
                }
              }}
              className="w-16 text-center text-lg text-gray-700 font-mono font-medium bg-transparent border-b border-transparent hover:border-gray-300 focus:border-pink-500 outline-none transition-colors"
            />
            <button
              onClick={() => handleFavSyncIntervalChange(Number(favSyncInterval) + 5)}
              className="w-8 h-8 flex items-center justify-center text-white bg-pink-500 rounded-full hover:bg-pink-600 transition-colors shadow-sm"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* 确认弹窗 */}
      {/* ... (Dialog code) ... */}
      {
        showConfirmDialog && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white p-6 rounded-xl shadow-xl max-w-sm w-full mx-4">
              <h3 className="text-lg font-bold text-gray-900 mb-2">确认恢复出厂设置？</h3>
              <p className="text-gray-500 mb-6 text-sm leading-relaxed">
                此操作将<span className="text-red-600 font-medium">永久删除</span>所有本地存储的历史记录和偏好设置。
              </p>
              {isResetLoading && (
                <p className="text-blue-600 mb-4 text-sm animate-pulse">{resetStatus}</p>
              )}
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowConfirmDialog(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
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
        )
      }

      {
        showResetResultDialog && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-xl shadow-xl max-w-sm w-full mx-4 text-center">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check size={24} />
              </div>
              <p className="text-lg text-gray-800 mb-6 font-medium">
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
        )
      }
    </div >
  );
};

export default Settings;
