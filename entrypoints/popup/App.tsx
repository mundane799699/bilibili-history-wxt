import { useState, useEffect } from "react";
import "./App.css";
import { Toaster } from "react-hot-toast";
function App() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingFav, setIsSyncingFav] = useState(false);
  const [status, setStatus] = useState("");
  const [isFullSync, setIsFullSync] = useState(false);

  useEffect(() => {
    // 检查同步状态
    const checkSyncStatus = async () => {
      const result = await browser.storage.local.get("lastSync");
      if (result.lastSync) {
        const lastSync = new Date(result.lastSync as string | number);
        setStatus(`上次同步时间：${lastSync.toLocaleString()}`);
      } else {
        setStatus("尚未同步过历史记录");
      }
    };
    checkSyncStatus();
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    setStatus("正在同步...");

    try {
      const response = await browser.runtime.sendMessage({
        action: "syncHistory",
        isFullSync: isFullSync,
      });

      if (response && response.success) {
        setStatus(response.message);
      } else {
        setStatus("同步失败：" + (response ? response.error : "未知错误"));
      }
    } catch (error) {
      setStatus("同步失败：" + (error instanceof Error ? error.message : "未知错误"));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncFav = async () => {
    setIsSyncingFav(true);
    setStatus("正在同步收藏夹...");

    try {
      const response = await browser.runtime.sendMessage({
        action: "syncFavorites",
      });

      if (response && response.success) {
        setStatus(response.message);
      } else {
        setStatus("同步收藏夹失败：" + (response ? response.error : "未知错误"));
      }
    } catch (error) {
      setStatus("同步收藏夹失败：" + (error instanceof Error ? error.message : "未知错误"));
    } finally {
      setIsSyncingFav(false);
    }
  };

  return (
    <>
      <Toaster position="top-center" />
      <div className="flex flex-col gap-2.5">
        <h2 className="text-xl font-bold">Bilibili 无限历史记录</h2>
        <button
          className="w-full px-2 py-2 text-white bg-[#00a1d6] rounded hover:bg-[#0091c2] disabled:bg-gray-300 disabled:cursor-not-allowed"
          onClick={() => {
            browser.tabs.create({
              url: "/my-history.html",
            });
          }}
          disabled={isSyncing}
        >
          打开历史记录页面
        </button>
        <button
          className="w-full px-2 py-2 text-white bg-[#00a1d6] rounded hover:bg-[#0091c2] disabled:bg-gray-300 disabled:cursor-not-allowed"
          onClick={handleSync}
          disabled={isSyncing}
        >
          {isSyncing ? "同步中..." : "立即同步"}
        </button>
        <button
          className="w-full px-2 py-2 text-white bg-[#fb7299] rounded hover:bg-[#e05a80] disabled:bg-gray-300 disabled:cursor-not-allowed"
          onClick={handleSyncFav}
          disabled={isSyncing || isSyncingFav}
        >
          {isSyncingFav ? "收藏夹同步中..." : "同步收藏夹"}
        </button>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="fullSync"
            checked={isFullSync}
            onChange={(e) => setIsFullSync(e.target.checked)}
            disabled={isSyncing}
            className="w-4 h-4 text-[#00a1d6] bg-gray-100 border-gray-300 rounded focus:ring-[#00a1d6] focus:ring-2"
          />
          <label
            htmlFor="fullSync"
            className={`text-sm ${
              isSyncing ? "text-gray-400" : "text-gray-700"
            } cursor-pointer select-none`}
          >
            全量同步
          </label>
        </div>
        {status && <div className="mt-2.5 text-gray-600">{status}</div>}
      </div>
    </>
  );
}

export default App;
