import { useCallback, useEffect, useRef, useState } from "react";
import { HashRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { History } from "../../pages/History";
import { About } from "../../pages/About";
import { Sidebar } from "../../components/Sidebar";
import Settings from "../../pages/Settings";
import ScrollToTopButton from "../../components/ScrollToTopButton";
import { MiniPlayer } from "../../components/MiniPlayer";
import toast, { Toaster } from "react-hot-toast";
import Feedback from "../../pages/Feedback";
import CloudSync from "../../pages/CloudSync";
import LocalBackup from "../../pages/backup/LocalBackup";
import WebDavBackup from "../../pages/backup/WebDavBackup";
import JsonBackup from "../../pages/backup/JsonBackup";
import SearchMusic from "../../pages/music/SearchMusic";
import LikedMusic from "../../pages/music/LikedMusic";
import { Favorites } from "../../pages/Favorites";
import AISearch from "../../pages/AISearch";
import Reward from "../../pages/Reward";
import { UpdateNoticeModal } from "../../components/UpdateNoticeModal";
import { DataBackupReminderModal } from "../../components/DataBackupReminderModal";
import { FirstRunGuideModal } from "../../components/FirstRunGuideModal";
import SubscribedCollections from "../../pages/SubscribedCollections";
import VideoBackup from "../../pages/VideoBackup";
import { startVideoBackupWorker } from "../../utils/videoBackupWorker";
import {
  BACKUP_REMINDER_LAST_DISMISSED_AT,
  FIRST_RUN_GUIDE_COMPLETED,
  SIDEBAR_COLLAPSED,
} from "../../utils/constants";
import { getStorageValue, setStorageValue } from "../../utils/storage";
import { exportHistoryToJSON } from "../../utils/export";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const BACKUP_REMINDER_INTERVAL_MS = 7 * DAY_IN_MS;

const BackupReminderController = () => {
  const hasEvaluatedRef = useRef(false);
  const hasShownThisSessionRef = useRef(false);
  const isBackingUpRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);

  useEffect(() => {
    if (hasEvaluatedRef.current || hasShownThisSessionRef.current) return;
    hasEvaluatedRef.current = true;

    let isActive = true;

    const evaluateReminder = async () => {
      try {
        const lastDismissedAt = await getStorageValue<number>(BACKUP_REMINDER_LAST_DISMISSED_AT, 0);

        if (!isActive) return;

        const now = Date.now();
        const reminderDue =
          lastDismissedAt === 0 || now - lastDismissedAt >= BACKUP_REMINDER_INTERVAL_MS;

        if (!reminderDue) return;

        setIsOpen(true);
        hasShownThisSessionRef.current = true;
      } catch (error) {
        console.error("读取数据备份提醒状态失败:", error);
        if (!isActive) return;

        setIsOpen(true);
        hasShownThisSessionRef.current = true;
      }
    };

    void evaluateReminder();

    return () => {
      isActive = false;
    };
  }, []);

  const dismissReminder = useCallback(async () => {
    const dismissedAt = Date.now();
    setIsOpen(false);

    try {
      await setStorageValue(BACKUP_REMINDER_LAST_DISMISSED_AT, dismissedAt);
    } catch (error) {
      console.error("保存数据备份提醒状态失败:", error);
    }
  }, []);

  const handleBackup = useCallback(async () => {
    if (isBackingUpRef.current) return;

    isBackingUpRef.current = true;
    setIsBackingUp(true);

    try {
      await exportHistoryToJSON();
      await dismissReminder();
      toast.success("历史记录 JSON 已开始下载");
    } catch (error) {
      console.error("备份历史记录失败:", error);
      toast.error("备份失败，请重试");
    } finally {
      isBackingUpRef.current = false;
      setIsBackingUp(false);
    }
  }, [dismissReminder]);

  return (
    <DataBackupReminderModal
      open={isOpen}
      isBackingUp={isBackingUp}
      onClose={() => void dismissReminder()}
      onBackup={() => void handleBackup()}
    />
  );
};

/** 侧边栏折叠状态，持久化到 storage，下次打开保持上次的选择 */
const useSidebarCollapsed = () => {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    void getStorageValue(SIDEBAR_COLLAPSED, false).then(setCollapsed);
  }, []);

  const toggleCollapsed = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    void setStorageValue(SIDEBAR_COLLAPSED, next);
  }, [collapsed]);

  return [collapsed, toggleCollapsed] as const;
};

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout = ({ children }: MainLayoutProps) => {
  const navigate = useNavigate();
  const [sidebarCollapsed, toggleSidebarCollapsed] = useSidebarCollapsed();
  const [isUpdateNoticeOpen, setIsUpdateNoticeOpen] = useState(false);
  const [isUpdateNoticeReady, setIsUpdateNoticeReady] = useState(false);
  const [canEvaluateBackupReminder, setCanEvaluateBackupReminder] = useState(false);
  const [isFirstRunGuideOpen, setIsFirstRunGuideOpen] = useState(false);
  const [isFirstRunGuideReady, setIsFirstRunGuideReady] = useState(false);

  const handleUpdateNoticeOpenChange = useCallback((open: boolean) => {
    setIsUpdateNoticeOpen(open);
  }, []);

  const handleUpdateNoticeReady = useCallback(() => {
    setIsUpdateNoticeReady(true);
  }, []);

  useEffect(() => {
    let isActive = true;
    setIsFirstRunGuideReady(false);
    void getStorageValue(FIRST_RUN_GUIDE_COMPLETED, false)
      .then((completed) => {
        if (!isActive) return;
        setIsFirstRunGuideOpen(!completed);
        setIsFirstRunGuideReady(true);
      })
      .catch((error) => {
        console.error("读取首次引导状态失败:", error);
        if (!isActive) return;
        setIsFirstRunGuideOpen(true);
        setIsFirstRunGuideReady(true);
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const handleGuideStorageChange = (
      changes: Record<string, Browser.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === "local" && changes[FIRST_RUN_GUIDE_COMPLETED]?.newValue === false) {
        setIsFirstRunGuideOpen(true);
        setIsFirstRunGuideReady(true);
      }
    };
    browser.storage.onChanged.addListener(handleGuideStorageChange);
    return () => browser.storage.onChanged.removeListener(handleGuideStorageChange);
  }, []);

  useEffect(() => {
    if (!isFirstRunGuideReady || isFirstRunGuideOpen) {
      setIsUpdateNoticeReady(false);
      setCanEvaluateBackupReminder(false);
      return;
    }

    if (!isUpdateNoticeReady || isUpdateNoticeOpen) {
      setCanEvaluateBackupReminder(false);
      return;
    }

    const timerId = window.setTimeout(() => setCanEvaluateBackupReminder(true), 300);
    return () => window.clearTimeout(timerId);
  }, [isFirstRunGuideOpen, isFirstRunGuideReady, isUpdateNoticeOpen, isUpdateNoticeReady]);

  const completeFirstRunGuide = useCallback(() => {
    setIsFirstRunGuideOpen(false);
    void setStorageValue(FIRST_RUN_GUIDE_COMPLETED, true).catch((error) => {
      console.error("保存首次引导状态失败:", error);
    });
  }, []);

  return (
    <div className="flex h-screen bg-paper text-ink dark:bg-night dark:text-night-text">
      <Sidebar collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebarCollapsed} />
      {/* 主内容区域：左边距与侧边栏宽度同步过渡 */}
      <div
        className={`w-full transition-[margin] duration-200 ease-out ${sidebarCollapsed ? "ml-14" : "ml-52"}`}
      >
        {children}
      </div>
      {isFirstRunGuideReady && !isFirstRunGuideOpen && (
        <UpdateNoticeModal
          onOpenChange={handleUpdateNoticeOpenChange}
          onReady={handleUpdateNoticeReady}
        />
      )}
      {canEvaluateBackupReminder && <BackupReminderController />}
      {isFirstRunGuideReady && (
        <FirstRunGuideModal
          open={isFirstRunGuideOpen}
          onComplete={completeFirstRunGuide}
          onNavigate={navigate}
        />
      )}
    </div>
  );
};

const App = () => {
  useEffect(() => {
    // 视频备份队列由插件页面执行，任意一个插件页面打开即可处理（多标签页间用 Web Lock 互斥）
    startVideoBackupWorker();
  }, []);

  return (
    <HashRouter>
      <Toaster position="top-center" />
      <MainLayout>
        <div>
          <Routes>
            <Route path="/" element={<History />} />
            <Route path="/about" element={<About />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/cloud-sync" element={<CloudSync />} />
            <Route path="/backup/local" element={<LocalBackup />} />
            <Route path="/backup/webdav" element={<WebDavBackup />} />
            <Route path="/backup/json" element={<JsonBackup />} />
            <Route path="/webdav-sync" element={<Navigate to="/backup/local" replace />} />
            <Route path="/reward" element={<Reward />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/collections" element={<SubscribedCollections />} />
            <Route path="/ai-search" element={<AISearch />} />
            <Route path="/music/search" element={<SearchMusic />} />
            <Route path="/music/liked" element={<LikedMusic />} />
            <Route path="/video-backup" element={<VideoBackup />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        <ScrollToTopButton />
        <MiniPlayer />
      </MainLayout>
    </HashRouter>
  );
};

export default App;
