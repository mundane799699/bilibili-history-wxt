import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { getStorageValue, setStorageValue } from "@/utils/storage";
import {
  WEBDAV_CONFIG,
  WEBDAV_LAST_SYNC,
  WEBDAV_AUTO_SYNC_ENABLED,
  WEBDAV_AUTO_SYNC_INTERVAL,
} from "@/utils/constants";
import {
  WebDavConfig,
  testConnection,
  ensureDirectory,
  uploadFile,
  downloadFile,
} from "@/utils/webdav";
import {
  getAllHistory,
  getAllLikedMusic,
  getAllFavFolders,
  getAllFavResources,
  saveHistory,
  importLikedMusic,
  importFavFolders,
  importFavResources,
  smartMergeHistory,
  smartMergeLikedMusic,
  smartMergeFavResources,
} from "@/utils/db";
import { HistoryItem, LikedMusic, FavoriteFolder, FavoriteResource } from "@/utils/types";

/** WebDAV 同步的 4 个数据文件名 */
const DATA_FILES = {
  history: "history.json",
  likedMusic: "likedMusic.json",
  favFolders: "favFolders.json",
  favResources: "favResources.json",
} as const;

/** 备份/恢复进度信息 */
interface SyncProgress {
  current: number;
  total: number;
  message: string;
}

const defaultConfig: WebDavConfig = {
  serverUrl: "",
  username: "",
  password: "",
  basePath: "/bilibili-history/",
};

const WebDavSync = () => {
  // ===== WebDAV 配置状态 =====
  const [config, setConfig] = useState<WebDavConfig>(defaultConfig);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);

  // ===== 同步操作状态 =====
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);

  // ===== 备份模式对话框 =====
  const [showBackupDialog, setShowBackupDialog] = useState(false);

  // ===== 手动导出/导入状态 =====
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // ===== 自动同步状态 =====
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoSyncInterval, setAutoSyncInterval] = useState(30);

  // 加载已保存的配置
  useEffect(() => {
    const loadConfig = async () => {
      const saved = await getStorageValue<WebDavConfig | null>(WEBDAV_CONFIG, null);
      if (saved) setConfig(saved);
      const syncTime = await getStorageValue<number | null>(WEBDAV_LAST_SYNC, null);
      if (syncTime) setLastSync(syncTime);

      const enabled = await getStorageValue<boolean>(WEBDAV_AUTO_SYNC_ENABLED, false);
      setAutoSyncEnabled(enabled);
      const interval = await getStorageValue<number>(WEBDAV_AUTO_SYNC_INTERVAL, 30);
      setAutoSyncInterval(interval);
    };
    loadConfig();
  }, []);

  // ===== WebDAV 配置操作 =====

  const handleTestConnection = async () => {
    if (!config.serverUrl) {
      toast.error("请先填写服务器地址");
      return;
    }
    setIsTesting(true);
    try {
      const ok = await testConnection(config);
      if (ok) {
        toast.success("连接成功！");
      } else {
        toast.error("连接失败，请检查服务器地址和凭证");
      }
    } catch {
      toast.error("连接测试出错");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!config.serverUrl) {
      toast.error("请先填写服务器地址");
      return;
    }
    setIsSaving(true);
    try {
      await setStorageValue(WEBDAV_CONFIG, config);
      toast.success("配置已保存");
    } catch {
      toast.error("保存配置失败");
    } finally {
      setIsSaving(false);
    }
  };

  // ===== WebDAV 备份 =====

  const handleBackup = async () => {
    if (!config.serverUrl) {
      toast.error("请先配置 WebDAV 服务器");
      return;
    }

    setIsBackingUp(true);
    setSyncProgress({ current: 0, total: 4, message: "准备备份数据..." });

    try {
      // 确保远程目录存在
      await ensureDirectory(config);

      // 1. 上传历史记录
      setSyncProgress({ current: 0, total: 4, message: "正在备份历史记录..." });
      const history = await getAllHistory();
      const historyOk = await uploadFile(config, DATA_FILES.history, JSON.stringify(history));
      if (!historyOk) throw new Error("上传历史记录失败");

      // 2. 上传喜欢的音乐
      setSyncProgress({ current: 1, total: 4, message: "正在备份喜欢的音乐..." });
      const music = await getAllLikedMusic();
      const musicOk = await uploadFile(config, DATA_FILES.likedMusic, JSON.stringify(music));
      if (!musicOk) throw new Error("上传喜欢的音乐失败");

      // 3. 上传收藏夹
      setSyncProgress({ current: 2, total: 4, message: "正在备份收藏夹..." });
      const folders = await getAllFavFolders();
      const foldersOk = await uploadFile(config, DATA_FILES.favFolders, JSON.stringify(folders));
      if (!foldersOk) throw new Error("上传收藏夹失败");

      // 4. 上传收藏资源
      setSyncProgress({ current: 3, total: 4, message: "正在备份收藏资源..." });
      const resources = await getAllFavResources();
      const resourcesOk = await uploadFile(
        config,
        DATA_FILES.favResources,
        JSON.stringify(resources),
      );
      if (!resourcesOk) throw new Error("上传收藏资源失败");

      // 记录同步时间（数值时间戳）
      const now = Date.now();
      await setStorageValue(WEBDAV_LAST_SYNC, now);
      setLastSync(now);

      setSyncProgress({ current: 4, total: 4, message: "备份完成！" });
      toast.success(
        `备份完成！历史 ${history.length} 条，音乐 ${music.length} 首，收藏夹 ${folders.length} 个，收藏 ${resources.length} 项`,
      );
    } catch (error: any) {
      console.error("WebDAV 备份失败:", error);
      toast.error(error.message || "备份失败，请检查配置");
    } finally {
      setIsBackingUp(false);
      setTimeout(() => setSyncProgress(null), 3000);
    }
  };

  // ===== WebDAV 双向同步（拉取+合并+推送） =====

  const handleBidirectionalSync = async () => {
    if (!config.serverUrl) {
      toast.error("请先配置 WebDAV 服务器");
      return;
    }

    setIsBackingUp(true);
    setSyncProgress({ current: 0, total: 8, message: "准备双向同步..." });

    try {
      await ensureDirectory(config);

      // 第一步：拉取远端数据并合并
      let totalMerged = 0;
      let totalSkipped = 0;

      setSyncProgress({ current: 0, total: 8, message: "步骤 1/2：拉取历史记录..." });
      const historyData = await downloadFile(config, DATA_FILES.history);
      if (historyData) {
        const items = JSON.parse(historyData) as HistoryItem[];
        const result = await smartMergeHistory(items);
        totalMerged += result.merged;
        totalSkipped += result.skipped;
      }

      setSyncProgress({ current: 1, total: 8, message: "步骤 1/2：拉取喜欢的音乐..." });
      const musicData = await downloadFile(config, DATA_FILES.likedMusic);
      if (musicData) {
        const items = JSON.parse(musicData) as LikedMusic[];
        const result = await smartMergeLikedMusic(items);
        totalMerged += result.merged;
        totalSkipped += result.skipped;
      }

      setSyncProgress({ current: 2, total: 8, message: "步骤 1/2：拉取收藏夹..." });
      const foldersData = await downloadFile(config, DATA_FILES.favFolders);
      if (foldersData) {
        const items = JSON.parse(foldersData) as FavoriteFolder[];
        await importFavFolders(items);
        totalMerged += items.length;
      }

      setSyncProgress({ current: 3, total: 8, message: "步骤 1/2：拉取收藏资源..." });
      const resourcesData = await downloadFile(config, DATA_FILES.favResources);
      if (resourcesData) {
        const items = JSON.parse(resourcesData) as FavoriteResource[];
        const result = await smartMergeFavResources(items);
        totalMerged += result.merged;
        totalSkipped += result.skipped;
      }

      // 第二步：推送合并后的最新数据
      setSyncProgress({ current: 4, total: 8, message: "步骤 2/2：推送历史记录..." });
      const history = await getAllHistory();
      const historyOk = await uploadFile(config, DATA_FILES.history, JSON.stringify(history));
      if (!historyOk) throw new Error("上传历史记录失败");

      setSyncProgress({ current: 5, total: 8, message: "步骤 2/2：推送喜欢的音乐..." });
      const music = await getAllLikedMusic();
      const musicOk = await uploadFile(config, DATA_FILES.likedMusic, JSON.stringify(music));
      if (!musicOk) throw new Error("上传音乐失败");

      setSyncProgress({ current: 6, total: 8, message: "步骤 2/2：推送收藏夹..." });
      const folders = await getAllFavFolders();
      const foldersOk = await uploadFile(config, DATA_FILES.favFolders, JSON.stringify(folders));
      if (!foldersOk) throw new Error("上传收藏夹失败");

      setSyncProgress({ current: 7, total: 8, message: "步骤 2/2：推送收藏资源..." });
      const resources = await getAllFavResources();
      const resourcesOk = await uploadFile(
        config,
        DATA_FILES.favResources,
        JSON.stringify(resources),
      );
      if (!resourcesOk) throw new Error("上传收藏资源失败");

      const now = Date.now();
      await setStorageValue(WEBDAV_LAST_SYNC, now);
      setLastSync(now);

      setSyncProgress({ current: 8, total: 8, message: "双向同步完成！" });
      toast.success(
        `双向同步完成！合并 ${totalMerged} 条，跳过 ${totalSkipped} 条，推送 ${history.length + music.length + folders.length + resources.length} 条`,
      );
    } catch (error: any) {
      console.error("WebDAV 双向同步失败:", error);
      toast.error(error.message || "双向同步失败，请检查配置");
    } finally {
      setIsBackingUp(false);
      setTimeout(() => setSyncProgress(null), 3000);
    }
  };

  // ===== WebDAV 恢复 =====

  const handleRestore = async () => {
    if (!config.serverUrl) {
      toast.error("请先配置 WebDAV 服务器");
      return;
    }

    setIsRestoring(true);
    setSyncProgress({ current: 0, total: 4, message: "正在从 WebDAV 下载数据..." });

    try {
      let totalMerged = 0;
      let totalSkipped = 0;

      // 1. 恢复历史记录
      setSyncProgress({ current: 0, total: 4, message: "正在恢复历史记录..." });
      const historyData = await downloadFile(config, DATA_FILES.history);
      if (historyData) {
        const items = JSON.parse(historyData) as HistoryItem[];
        const result = await smartMergeHistory(items);
        totalMerged += result.merged;
        totalSkipped += result.skipped;
      }

      // 2. 恢复喜欢的音乐
      setSyncProgress({ current: 1, total: 4, message: "正在恢复喜欢的音乐..." });
      const musicData = await downloadFile(config, DATA_FILES.likedMusic);
      if (musicData) {
        const items = JSON.parse(musicData) as LikedMusic[];
        const result = await smartMergeLikedMusic(items);
        totalMerged += result.merged;
        totalSkipped += result.skipped;
      }

      // 3. 恢复收藏夹（直接 upsert，无时间戳比对）
      setSyncProgress({ current: 2, total: 4, message: "正在恢复收藏夹..." });
      const foldersData = await downloadFile(config, DATA_FILES.favFolders);
      if (foldersData) {
        const items = JSON.parse(foldersData) as FavoriteFolder[];
        await importFavFolders(items);
        totalMerged += items.length;
      }

      // 4. 恢复收藏资源
      setSyncProgress({ current: 3, total: 4, message: "正在恢复收藏资源..." });
      const resourcesData = await downloadFile(config, DATA_FILES.favResources);
      if (resourcesData) {
        const items = JSON.parse(resourcesData) as FavoriteResource[];
        const result = await smartMergeFavResources(items);
        totalMerged += result.merged;
        totalSkipped += result.skipped;
      }

      // 记录同步时间
      const now = Date.now();
      await setStorageValue(WEBDAV_LAST_SYNC, now);
      setLastSync(now);

      setSyncProgress({ current: 4, total: 4, message: "恢复完成！" });
      toast.success(`恢复完成！合并 ${totalMerged} 条，跳过 ${totalSkipped} 条（本地更新）`);
    } catch (error: any) {
      console.error("WebDAV 恢复失败:", error);
      toast.error(error.message || "恢复失败，请检查配置");
    } finally {
      setIsRestoring(false);
      setTimeout(() => setSyncProgress(null), 3000);
    }
  };

  // ===== 手动导出全部数据 =====

  const handleExportAll = async () => {
    setIsExporting(true);
    try {
      const data = {
        exportTime: new Date().toISOString(),
        version: "1.0",
        history: await getAllHistory(),
        likedMusic: await getAllLikedMusic(),
        favFolders: await getAllFavFolders(),
        favResources: await getAllFavResources(),
      };

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bilibili-history-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(
        `导出成功！历史 ${data.history.length} 条，音乐 ${data.likedMusic.length} 首，收藏夹 ${data.favFolders.length} 个，收藏 ${data.favResources.length} 项`,
      );
    } catch (error) {
      console.error("导出数据失败:", error);
      toast.error("导出失败，请重试");
    } finally {
      setIsExporting(false);
    }
  };

  // ===== 手动导入数据 =====

  const handleImportAll = async () => {
    setIsImporting(true);
    try {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".json";

      fileInput.onchange = async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) {
          setIsImporting(false);
          return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const content = e.target?.result as string;
            const data = JSON.parse(content);

            let totalMerged = 0;
            let totalSkipped = 0;

            // 智能识别格式：支持完整备份格式和单独数组格式
            if (data.history && Array.isArray(data.history)) {
              // 完整备份格式
              const histResult = await smartMergeHistory(data.history);
              totalMerged += histResult.merged;
              totalSkipped += histResult.skipped;

              if (data.likedMusic && Array.isArray(data.likedMusic)) {
                const musicResult = await smartMergeLikedMusic(data.likedMusic);
                totalMerged += musicResult.merged;
                totalSkipped += musicResult.skipped;
              }
              if (data.favFolders && Array.isArray(data.favFolders)) {
                await importFavFolders(data.favFolders);
                totalMerged += data.favFolders.length;
              }
              if (data.favResources && Array.isArray(data.favResources)) {
                const resResult = await smartMergeFavResources(data.favResources);
                totalMerged += resResult.merged;
                totalSkipped += resResult.skipped;
              }
            } else if (Array.isArray(data)) {
              // 兼容旧版单独数组格式（历史记录或音乐）
              if (data.length > 0 && "view_at" in data[0]) {
                const result = await smartMergeHistory(data as HistoryItem[]);
                totalMerged = result.merged;
                totalSkipped = result.skipped;
              } else if (data.length > 0 && "bvid" in data[0] && "added_at" in data[0]) {
                const result = await smartMergeLikedMusic(data as LikedMusic[]);
                totalMerged = result.merged;
                totalSkipped = result.skipped;
              } else {
                toast.error("无法识别的数据格式");
                setIsImporting(false);
                return;
              }
            } else {
              toast.error("无法识别的文件格式");
              setIsImporting(false);
              return;
            }

            toast.success(`导入完成！合并 ${totalMerged} 条，跳过 ${totalSkipped} 条（本地更新）`);
          } catch (parseError) {
            console.error("解析导入文件失败:", parseError);
            toast.error("导入失败，文件内容格式错误");
          } finally {
            setIsImporting(false);
          }
        };
        reader.readAsText(file);
      };

      // 用户取消选择文件时
      fileInput.addEventListener("cancel", () => {
        setIsImporting(false);
      });

      fileInput.click();
    } catch (error) {
      console.error("导入数据失败:", error);
      toast.error("导入失败，请重试");
      setIsImporting(false);
    }
  };

  // ===== 进度条百分比 =====
  const progressPercent =
    syncProgress && syncProgress.total > 0
      ? Math.round((syncProgress.current / syncProgress.total) * 100)
      : 0;

  // ===== 自动同步操作 =====

  const handleAutoSyncToggle = async (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    await setStorageValue(WEBDAV_AUTO_SYNC_ENABLED, enabled);
    if (enabled) {
      toast.success(`已开启自动同步，每 ${autoSyncInterval} 分钟备份一次`);
    } else {
      toast.success("已关闭自动同步");
    }
  };

  const handleIntervalChange = async (interval: number) => {
    setAutoSyncInterval(interval);
    await setStorageValue(WEBDAV_AUTO_SYNC_INTERVAL, interval);
  };

  return (
    <div className="max-w-[800px] mx-auto p-6 pb-20">
      <h1 className="text-3xl font-bold mb-2">WebDAV 同步</h1>
      <p className="text-gray-500 text-sm mb-8">
        通过 WebDAV 或手动导出/导入来备份和恢复你的数据。
      </p>

      {/* ===== WebDAV 配置区域 ===== */}
      <div className="mb-8 rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"
              />
            </svg>
            WebDAV 服务器配置
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            支持坚果云、NextCloud、群晖 NAS 等 WebDAV 服务
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">服务器地址</label>
            <input
              type="url"
              placeholder="例如：https://dav.jianguoyun.com/dav"
              value={config.serverUrl}
              onChange={(e) => setConfig({ ...config, serverUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
              <input
                type="text"
                placeholder="WebDAV 用户名"
                value={config.username}
                onChange={(e) => setConfig({ ...config, username: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
              <input
                type="password"
                placeholder="WebDAV 密码 / 应用密码"
                value={config.password}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">远程路径</label>
            <input
              type="text"
              placeholder="/bilibili-history/"
              value={config.basePath}
              onChange={(e) => setConfig({ ...config, basePath: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
            />
          </div>

          <p className="text-xs text-gray-400 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            你的凭证仅保存在本地浏览器存储中，不会上传到任何第三方服务器
          </p>

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleTestConnection}
              disabled={isTesting || !config.serverUrl}
              className="px-4 py-2 text-sm font-medium bg-white text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTesting ? "测试中..." : "测试连接"}
            </button>
            <button
              onClick={handleSaveConfig}
              disabled={isSaving || !config.serverUrl}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? "保存中..." : "保存配置"}
            </button>
          </div>
        </div>
      </div>

      {/* ===== WebDAV 同步操作区域 ===== */}
      <div className="mb-8 rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-emerald-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            WebDAV 同步
          </h2>
          {lastSync && (
            <p className="text-xs text-gray-500 mt-1">
              上次同步：{new Date(lastSync).toLocaleString()}
            </p>
          )}
        </div>

        <div className="p-5">
          {/* 进度条 */}
          {syncProgress && (
            <div className="mb-5 p-4 bg-blue-50 rounded-lg border border-blue-200 animate-in fade-in">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-blue-700">{syncProgress.message}</span>
                <span className="text-sm font-medium text-blue-700">{progressPercent}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => setShowBackupDialog(true)}
              disabled={isBackingUp || isRestoring || !config.serverUrl}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3-3m0 0l3 3m-3-3v12"
                />
              </svg>
              {isBackingUp ? "备份中..." : "备份到 WebDAV"}
            </button>

            <button
              onClick={handleRestore}
              disabled={isBackingUp || isRestoring || !config.serverUrl}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-teal-500 hover:bg-teal-600 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3 3m0 0l-3-3m3 3V8"
                />
              </svg>
              {isRestoring ? "恢复中..." : "从 WebDAV 恢复"}
            </button>
          </div>

          <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-xs text-amber-700">
              <strong>提示：</strong>
              恢复数据时会智能合并，仅当远端数据更新时才覆盖本地记录，不会丢失本地较新的数据。
            </p>
          </div>
        </div>
      </div>

      {/* ===== 自动同步设置区域 ===== */}
      <div className="mb-8 rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-amber-50">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-orange-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            自动同步
          </h2>
          <p className="text-xs text-gray-500 mt-1">开启后会在后台定时自动备份数据到 WebDAV</p>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">启用自动同步</span>
              <p className="text-xs text-gray-500 mt-0.5">
                在后台定时将数据自动备份到 WebDAV 服务器
              </p>
            </div>
            <button
              onClick={() => handleAutoSyncToggle(!autoSyncEnabled)}
              disabled={!config.serverUrl}
              title="切换自动同步"
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                autoSyncEnabled ? "bg-orange-500" : "bg-gray-300"
              } ${!config.serverUrl ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 shadow-sm ${
                  autoSyncEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {autoSyncEnabled && (
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                同步间隔
              </label>
              <select
                value={autoSyncInterval}
                onChange={(e) => handleIntervalChange(Number(e.target.value))}
                title="自动同步间隔"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all text-sm bg-white"
              >
                <option value={15}>每 15 分钟</option>
                <option value={30}>每 30 分钟</option>
                <option value={60}>每 1 小时</option>
                <option value={120}>每 2 小时</option>
                <option value={360}>每 6 小时</option>
                <option value={720}>每 12 小时</option>
                <option value={1440}>每 24 小时</option>
              </select>
            </div>
          )}

          {!config.serverUrl && (
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500">
                请先在上方配置并保存 WebDAV 服务器信息后再开启自动同步。
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ===== 手动导出/导入区域 ===== */}
      <div className="mb-8 rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-fuchsia-50">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-purple-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            手动导出 / 导入
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            导出所有数据为单个 JSON 文件，或从 JSON 文件导入恢复
          </p>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={handleExportAll}
              disabled={isExporting}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              {isExporting ? "导出中..." : "导出全部数据"}
            </button>

            <button
              onClick={handleImportAll}
              disabled={isImporting}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-fuchsia-500 hover:bg-fuchsia-600 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              {isImporting ? "导入中..." : "导入数据"}
            </button>
          </div>

          <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-600">
              <strong>说明：</strong>导出文件包含历史记录、喜欢的音乐、收藏夹和收藏资源的完整数据。
              导入时会智能合并，同时兼容旧版导出的单独历史记录或音乐 JSON 文件。
            </p>
          </div>
        </div>
      </div>

      {/* ===== 使用说明 ===== */}
      <div className="rounded-xl bg-gray-50 border border-gray-200 p-5">
        <h3 className="text-base font-semibold mb-3 text-gray-800">使用说明</h3>
        <ul className="text-sm text-gray-600 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5 shrink-0">•</span>
            <span>
              <strong>WebDAV 同步</strong>：将数据备份到你自己的 WebDAV
              服务器（如坚果云、NextCloud），实现跨设备同步
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5 shrink-0">•</span>
            <span>
              <strong>手动导出/导入</strong>：将数据导出为 JSON 文件保存到本地，需要时再导入恢复
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5 shrink-0">•</span>
            <span>
              <strong>智能合并</strong>
              ：恢复或导入数据时，只有更新的远端记录才会覆盖本地，不会丢失本地较新的数据
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-amber-500 mt-0.5 shrink-0">•</span>
            <span>此功能完全免费，数据存储在你自己的服务器或本地，不经过任何第三方</span>
          </li>
        </ul>
      </div>

      {/* ===== 备份模式选择对话框 ===== */}
      {showBackupDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">选择备份模式</h3>
              <p className="text-sm text-gray-500 mt-1">请选择你想要的备份方式</p>
            </div>

            <div className="p-6 space-y-3">
              <button
                onClick={() => {
                  setShowBackupDialog(false);
                  handleBidirectionalSync();
                }}
                className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition-all text-left"
              >
                <svg
                  className="w-6 h-6 text-blue-600 mt-0.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <div>
                  <span className="font-semibold text-blue-800">双向同步（推荐）</span>
                  <p className="text-xs text-blue-600 mt-1">
                    先从 WebDAV
                    拉取远端数据并智能合并到本地，再将最新数据推送回去。适合多设备使用，不会丢失其他设备的数据。
                  </p>
                </div>
              </button>

              <button
                onClick={() => {
                  setShowBackupDialog(false);
                  handleBackup();
                }}
                className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 hover:border-amber-400 transition-all text-left"
              >
                <svg
                  className="w-6 h-6 text-amber-600 mt-0.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3-3m0 0l3 3m-3-3v12"
                  />
                </svg>
                <div>
                  <span className="font-semibold text-amber-800">强制覆盖</span>
                  <p className="text-xs text-amber-600 mt-1">
                    直接用本地数据覆盖 WebDAV 上的文件，不拉取远端数据。适合确定本地数据最新的场景。
                  </p>
                </div>
              </button>
            </div>

            <div className="px-6 pb-5">
              <button
                onClick={() => setShowBackupDialog(false)}
                className="w-full py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebDavSync;
