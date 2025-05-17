import { useState, useEffect } from "react";
import { clearHistory } from "../utils/db";
import { getStorageValue, setStorageValue } from "../utils/storage";
import { IS_SYNC_DELETE } from "../utils/constants";
import { exportHistoryToCSV } from "../utils/export";
import toast from "react-hot-toast";

const Settings = () => {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isSyncDelete, setIsSyncDelete] = useState(true);

  const [showResetResultDialog, setShowResetResultDialog] = useState(false);
  const [resetResult, setResetResult] = useState("");
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState("");

  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    // 加载同步删除设置
    const loadSettings = async () => {
      const syncDelete = await getStorageValue(IS_SYNC_DELETE, true);
      setIsSyncDelete(syncDelete);
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
      await exportHistoryToCSV();
      toast.success("导出成功！");
    } catch (error) {
      console.error("导出失败:", error);
      toast.error("导出失败，请重试！");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-4 flex flex-col container mx-auto items-center">
      <div className="w-full max-w-md mb-8">
        <div className="flex items-center justify-between p-4 bg-white rounded-lg shadow">
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

      <div className="w-full max-w-md mb-8">
        <div className="flex items-center justify-between p-4 bg-white rounded-lg shadow">
          <div>
            <h3 className="text-lg font-medium">同步删除设置</h3>
            <p className="text-sm text-gray-500">
              删除本地历史记录时同步删除B站服务器历史记录
            </p>
            <div className="mt-2 flex items-center text-sm text-amber-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 mr-1"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span>需要保持至少打开一个B站标签页，否则无法同步删除</span>
            </div>
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

      <div className="w-full max-w-md mb-8">
        <div className="flex items-center justify-between p-4 bg-white rounded-lg shadow">
          <div>
            <h3 className="text-lg font-medium text-blue-600">导出历史记录</h3>
            <p className="text-sm text-gray-500">
              将所有历史记录导出为CSV文件，方便备份和查看
            </p>
          </div>
          <button
            onClick={handleExport}
            className="px-4 py-2 text-sm text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isExporting}
          >
            {isExporting ? "导出中..." : "导出CSV"}
          </button>
        </div>
      </div>

      {/* 确认弹窗 */}
      {showConfirmDialog && (
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
      )}

      {showResetResultDialog && (
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
      )}
    </div>
  );
};

export default Settings;
