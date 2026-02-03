import { useState, useEffect } from "react";
import { clearHistory, saveHistory } from "../utils/db";
import { getStorageValue, setStorageValue } from "../utils/storage";
import {
  IS_SYNC_DELETE,
  SYNC_INTERVAL,
  IS_SYNC_DELETE_FROM_BILIBILI,
  FAV_SYNC_INTERVAL,
} from "../utils/constants";
import {
  exportHistoryToCSV,
  exportHistoryToJSON,
  exportLikedMusicToJSON,
} from "../utils/export";
import toast from "react-hot-toast";
import { HistoryItem, LikedMusic } from "../utils/types";
import { importLikedMusic } from "../utils/db";

const Settings = () => {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isSyncDelete, setIsSyncDelete] = useState(true);
  const [isSyncDeleteFromBilibili, setIsSyncDeleteFromBilibili] =
    useState(true);

  const [showResetResultDialog, setShowResetResultDialog] = useState(false);
  const [resetResult, setResetResult] = useState("");
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState("");

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExportingMusic, setIsExportingMusic] = useState(false);
  const [isImportingMusic, setIsImportingMusic] = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("json");
  const [syncInterval, setSyncInterval] = useState(1);
  const [favSyncInterval, setFavSyncInterval] = useState(1440);

  useEffect(() => {
    // 加载同步删除设置
    const loadSettings = async () => {
      const syncDelete = await getStorageValue(IS_SYNC_DELETE, true);
      const syncDeleteFromBilibili = await getStorageValue(
        IS_SYNC_DELETE_FROM_BILIBILI,
        true
      );
      const storedSyncInterval = await getStorageValue(SYNC_INTERVAL, 1);
      const storedFavSyncInterval = await getStorageValue(FAV_SYNC_INTERVAL, 1440);

      setIsSyncDelete(syncDelete);
      setIsSyncDeleteFromBilibili(syncDeleteFromBilibili);
      setSyncInterval(storedSyncInterval);
      setFavSyncInterval(storedFavSyncInterval);
    };
    loadSettings();
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

  const handleSyncIntervalChange = async (newInterval: number) => {
    if (newInterval >= 1) {
      setSyncInterval(newInterval);
      await setStorageValue(SYNC_INTERVAL, newInterval);
    }
  };

  const handleFavSyncIntervalChange = async (newInterval: number) => {
    if (newInterval >= 10) {
      setFavSyncInterval(newInterval);
      await setStorageValue(FAV_SYNC_INTERVAL, newInterval);
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

  const handleExport = async (formatToExport: "csv" | "json") => {
    try {
      setIsExporting(true);
      if (formatToExport === "csv") {
        await exportHistoryToCSV();
        toast.success("CSV导出成功！");
      } else if (formatToExport === "json") {
        await exportHistoryToJSON();
        toast.success("JSON导出成功！");
      }
    } catch (error) {
      console.error(`导出 ${formatToExport.toUpperCase()} 失败:`, error);
      toast.error(`导出 ${formatToExport.toUpperCase()} 失败，请重试！`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
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
              const items = JSON.parse(jsonContent) as HistoryItem[];
              if (
                !Array.isArray(items) ||
                items.some(
                  (item) =>
                    typeof item.id === "undefined" ||
                    typeof item.view_at === "undefined"
                )
              ) {
                toast.error(
                  "文件内容格式不正确，请确保导入的是正确的历史记录文件。"
                );
                setIsImporting(false);
                return;
              }
              await saveHistory(items);
              toast.success("历史记录导入成功！");
            } catch (parseError) {
              console.error("解析JSON文件失败:", parseError);
              toast.error("导入失败，文件格式错误或内容不正确。");
            } finally {
              setIsImporting(false);
            }
          };
          reader.onerror = () => {
            console.error("读取文件失败");
            toast.error("导入失败，无法读取文件。");
            setIsImporting(false);
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

  const handleExportLikedMusic = async () => {
    try {
      setIsExportingMusic(true);
      await exportLikedMusicToJSON();
      toast.success("我喜欢的音乐导出成功！");
    } catch (error) {
      console.error("导出我喜欢的音乐失败:", error);
      toast.error("导出我喜欢的音乐失败，请重试！");
    } finally {
      setIsExportingMusic(false);
    }
  };

  const handleImportLikedMusic = async () => {
    try {
      setIsImportingMusic(true);
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
              const items = JSON.parse(jsonContent) as LikedMusic[];
              if (
                !Array.isArray(items) ||
                items.some(
                  (item) =>
                    typeof item.bvid === "undefined" ||
                    typeof item.title === "undefined" ||
                    typeof item.added_at === "undefined"
                )
              ) {
                toast.error(
                  "文件内容格式不正确，请确保导入的是正确的喜欢音乐文件。"
                );
                setIsImportingMusic(false);
                return;
              }
              await importLikedMusic(items);
              toast.success("我喜欢的音乐导入成功！");
            } catch (parseError) {
              console.error("解析JSON文件失败:", parseError);
              toast.error("导入失败，文件格式错误或内容不正确。");
            } finally {
              setIsImportingMusic(false);
            }
          };
          reader.onerror = () => {
            console.error("读取文件失败");
            toast.error("导入失败，无法读取文件。");
            setIsImportingMusic(false);
          };
          reader.readAsText(file);
        } else {
          setIsImportingMusic(false);
        }
      };

      fileInput.click();
    } catch (error) {
      console.error(`导入我喜欢的音乐失败:`, error);
      toast.error("导入我喜欢的音乐失败，请重试。");
    } finally {
      setIsImportingMusic(false);
    }
  };

  return (
    <div className="p-4 flex flex-col container mx-auto items-center">
      <div className="w-full max-w-md mb-8 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors duration-300 ease-in-out">
        <div className="flex items-center justify-between p-4 ">
          <div>
            <h3 className="text-lg font-medium text-red-600">恢复出厂设置</h3>
            <p className="text-sm text-gray-500">
              清空所有本地历史记录数据和用户偏好，且无法恢复
            </p>
          </div>
          <button
            onClick={() => setShowConfirmDialog(true)}
            className="px-4 py-2 text-sm text-red-600 hover:text-red-900 border border-red-200 rounded hover:border-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isResetLoading}
          >
            恢复出厂
          </button>
        </div>
      </div>

      <div className="w-full max-w-md mb-8 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors duration-300 ease-in-out">
        <div className="flex items-center justify-between p-4">
          <div>
            <h3 className="text-lg font-medium">同步删除：插件 -&gt; B站</h3>
            <p className="text-sm text-gray-500">
              删除本地历史记录时同步删除B站服务器历史记录
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={isSyncDelete}
              onChange={handleSyncDeleteChange}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>

      <div className="w-full max-w-md mb-8 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors duration-300 ease-in-out">
        <div className="flex items-center justify-between p-4">
          <div>
            <h3 className="text-lg font-medium">同步删除：B站 -&gt; 插件</h3>
            <p className="text-sm text-gray-500">
              在B站网页端删除历史记录时同步删除插件历史记录
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={isSyncDeleteFromBilibili}
              onChange={handleSyncDeleteFromBilibiliChange}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>

      <div className="w-full max-w-md mb-8 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors duration-300 ease-in-out">
        <div className="flex items-center justify-between p-4">
          <div>
            <h3 className="text-lg font-medium text-blue-600">导出历史记录</h3>
            <p className="text-sm text-gray-500">
              将所有历史记录导出，方便备份和查看
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <select
              value={exportFormat}
              onChange={(e) =>
                setExportFormat(e.target.value as "csv" | "json")
              }
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
            <button
              onClick={() => handleExport(exportFormat)}
              className="px-4 py-2 text-sm text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isExporting}
            >
              {isExporting ? "导出中..." : "导出"}
            </button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-md mb-8 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors duration-300 ease-in-out">
        <div className="flex items-center justify-between p-4">
          <div>
            <h3 className="text-lg font-medium text-blue-600">导入历史记录</h3>
            <p className="text-sm text-gray-500">
              将.json文件导入，恢复历史记录
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleImport()}
              className="px-4 py-2 text-sm text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isImporting}
            >
              {isImporting ? "导入中..." : "导入"}
            </button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-md mb-8 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors duration-300 ease-in-out">
        <div className="flex items-center justify-between p-4">
          <div>
            <h3 className="text-lg font-medium text-purple-600">
              导出我喜欢的音乐
            </h3>
            <p className="text-sm text-gray-500">
              将所有喜欢的音乐导出为JSON文件
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportLikedMusic}
              className="px-4 py-2 text-sm text-white bg-purple-500 rounded hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isExportingMusic}
            >
              {isExportingMusic ? "导出中..." : "导出"}
            </button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-md mb-8 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors duration-300 ease-in-out">
        <div className="flex items-center justify-between p-4">
          <div>
            <h3 className="text-lg font-medium text-purple-600">
              导入我喜欢的音乐
            </h3>
            <p className="text-sm text-gray-500">
              将.json文件导入，恢复喜欢的音乐
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleImportLikedMusic}
              className="px-4 py-2 text-sm text-white bg-purple-500 rounded hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isImportingMusic}
            >
              {isImportingMusic ? "导入中..." : "导入"}
            </button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-md mb-8 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors duration-300 ease-in-out">
        <div className="flex items-center justify-between p-4">
          <div>
            <h3 className="text-lg font-medium text-fuchsia-600">
              自动同步时间间隔
            </h3>
            <p className="text-sm text-gray-500">单位：分钟，最小值为1</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleSyncIntervalChange(syncInterval - 1)}
              className="px-3 py-1 text-sm text-white bg-fuchsia-500 rounded hover:bg-fuchsia-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={syncInterval <= 1}
            >
              -
            </button>
            <input
              type="number"
              value={syncInterval}
              onChange={(e) => {
                const filteredValue = e.target.value.replace(/[^0-9]/g, "");
                const numValue = parseInt(filteredValue) || 1;
                handleSyncIntervalChange(Math.max(1, numValue));
              }}
              className="px-3 py-1 text-sm text-gray-700 bg-gray-200 rounded-md w-16 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              onClick={() => handleSyncIntervalChange(syncInterval + 1)}
              className="px-3 py-1 text-sm text-white bg-fuchsia-500 rounded hover:bg-fuchsia-600 transition-colors"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-md mb-8 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors duration-300 ease-in-out">
        <div className="flex items-center justify-between p-4">
          <div>
            <h3 className="text-lg font-medium text-pink-500">
              自动同步收藏夹时间间隔
            </h3>
            <p className="text-sm text-gray-500">单位：分钟，最小值为10</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleFavSyncIntervalChange(favSyncInterval - 10)}
              className="px-3 py-1 text-sm text-white bg-pink-500 rounded hover:bg-pink-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={favSyncInterval <= 10}
            >
              -
            </button>
            <input
              type="number"
              value={favSyncInterval}
              onChange={(e) => {
                const filteredValue = e.target.value.replace(/[^0-9]/g, "");
                const numValue = parseInt(filteredValue) || 10;
                handleFavSyncIntervalChange(Math.max(10, numValue));
              }}
              className="px-3 py-1 text-sm text-gray-700 bg-gray-200 rounded-md w-16 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              onClick={() => handleFavSyncIntervalChange(favSyncInterval + 10)}
              className="px-3 py-1 text-sm text-white bg-pink-500 rounded hover:bg-pink-600 transition-colors"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* 确认弹窗 */}
      {
        showConfirmDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
              <h3 className="text-xl font-semibold mb-4">确认恢复出厂设置？</h3>
              <p className="text-gray-600 mb-6">
                此操作将删除所有本地存储的历史记录数据和用户偏好，且无法恢复。确定要继续吗？
              </p>
              {isResetLoading && (
                <p className="text-blue-600 mb-4">{resetStatus}</p>
              )}
              <div className="flex justify-end space-x-4">
                <button
                  onClick={() => setShowConfirmDialog(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isResetLoading}
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    handleReset();
                  }}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isResetLoading}
                >
                  确认
                </button>
              </div>
            </div>
          </div>
        )
      }

      {
        showResetResultDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
              <p className="text-xl text-gray-600 mb-6 text-center font-medium">
                {resetResult}
              </p>
              <div className="flex justify-end space-x-4">
                <button
                  onClick={() => setShowResetResultDialog(false)}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default Settings;
