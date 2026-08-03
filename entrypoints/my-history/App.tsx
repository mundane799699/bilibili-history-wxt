import { useCallback, useEffect, useRef, useState } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { History } from "../../pages/History";
import { About } from "../../pages/About";
import { Sidebar } from "../../components/Sidebar";
import Settings from "../../pages/Settings";
import ScrollToTopButton from "../../components/ScrollToTopButton";
import toast, { Toaster } from "react-hot-toast";
import Feedback from "../../pages/Feedback";
import CloudSync from "../../pages/CloudSync";
import WebDavSync from "../../pages/WebDavSync";
import SearchMusic from "../../pages/music/SearchMusic";
import LikedMusic from "../../pages/music/LikedMusic";
import { Favorites } from "../../pages/Favorites";
import Welcome from "../../pages/Welcome";
import AISearch from "../../pages/AISearch";
import Reward from "../../pages/Reward";
import { UpdateNoticeModal } from "../../components/UpdateNoticeModal";
import {
  BackupReminderReason,
  DataBackupReminderModal,
} from "../../components/DataBackupReminderModal";
import SubscribedCollections from "../../pages/SubscribedCollections";
import { checkStorageHealth, StorageHealthReport } from "../../utils/storageHealth";
import { BACKUP_REMINDER_LAST_DISMISSED_AT } from "../../utils/constants";
import { getStorageValue, setStorageValue } from "../../utils/storage";
import { exportHistoryToJSON } from "../../utils/export";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const BACKUP_REMINDER_INTERVAL_MS = 7 * DAY_IN_MS;

interface BackupReminderControllerProps {
  storageHealth: StorageHealthReport | null;
  storageHealthCheckFailed: boolean;
}

const BackupReminderController = ({
  storageHealth,
  storageHealthCheckFailed,
}: BackupReminderControllerProps) => {
  const hasEvaluatedRef = useRef(false);
  const hasShownThisSessionRef = useRef(false);
  const isBackingUpRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<BackupReminderReason>("routine");
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

        const hasCurrentStorageRisk =
          storageHealthCheckFailed ||
          storageHealth === null ||
          !storageHealth.storageProtected ||
          storageHealth.errors.length > 0;

        setReason(hasCurrentStorageRisk ? "storage-risk" : "routine");
        setIsOpen(true);
        hasShownThisSessionRef.current = true;
      } catch (error) {
        console.error("读取数据备份提醒状态失败:", error);
        if (!isActive) return;

        setReason("routine");
        setIsOpen(true);
        hasShownThisSessionRef.current = true;
      }
    };

    void evaluateReminder();

    return () => {
      isActive = false;
    };
  }, [storageHealth, storageHealthCheckFailed]);

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
      reason={reason}
      isBackingUp={isBackingUp}
      onClose={() => void dismissReminder()}
      onBackup={() => void handleBackup()}
    />
  );
};

interface MainLayoutProps {
  children: React.ReactNode;
  storageHealth: StorageHealthReport | null;
  storageHealthChecked: boolean;
  storageHealthCheckFailed: boolean;
}

const MainLayout = ({
  children,
  storageHealth,
  storageHealthChecked,
  storageHealthCheckFailed,
}: MainLayoutProps) => {
  const location = useLocation();
  const isWelcome = location.pathname === "/welcome";
  const [isUpdateNoticeOpen, setIsUpdateNoticeOpen] = useState(false);
  const [isUpdateNoticeReady, setIsUpdateNoticeReady] = useState(false);
  const [canEvaluateBackupReminder, setCanEvaluateBackupReminder] = useState(false);

  const handleUpdateNoticeOpenChange = useCallback((open: boolean) => {
    setIsUpdateNoticeOpen(open);
  }, []);

  const handleUpdateNoticeReady = useCallback(() => {
    setIsUpdateNoticeReady(true);
  }, []);

  useEffect(() => {
    if (isWelcome) {
      setIsUpdateNoticeOpen(false);
      setIsUpdateNoticeReady(false);
      setCanEvaluateBackupReminder(false);
      return;
    }

    if (!isUpdateNoticeReady || isUpdateNoticeOpen || !storageHealthChecked) {
      setCanEvaluateBackupReminder(false);
      return;
    }

    const timerId = window.setTimeout(() => setCanEvaluateBackupReminder(true), 300);
    return () => window.clearTimeout(timerId);
  }, [isUpdateNoticeOpen, isUpdateNoticeReady, isWelcome, storageHealthChecked]);

  return (
    <div className="flex h-screen dark:bg-[#0a0a0a] dark:text-neutral-100">
      {!isWelcome && <Sidebar />}
      {/* 主内容区域 */}
      <div className={`${!isWelcome ? "ml-40" : ""} w-full transition-all duration-300`}>
        {children}
      </div>
      {!isWelcome && (
        <UpdateNoticeModal
          onOpenChange={handleUpdateNoticeOpenChange}
          onReady={handleUpdateNoticeReady}
        />
      )}
      {!isWelcome && canEvaluateBackupReminder && (
        <BackupReminderController
          storageHealth={storageHealth}
          storageHealthCheckFailed={storageHealthCheckFailed}
        />
      )}
    </div>
  );
};

const App = () => {
  const [storageHealth, setStorageHealth] = useState<StorageHealthReport | null>(null);
  const [storageHealthChecked, setStorageHealthChecked] = useState(false);
  const [storageHealthCheckFailed, setStorageHealthCheckFailed] = useState(false);

  useEffect(() => {
    let isActive = true;

    checkStorageHealth(true)
      .then((report) => {
        if (!isActive) return;

        setStorageHealth(report);
        if (!report.storageProtected || report.errors.length > 0) {
          console.warn("扩展存储未完全受保护:", report);
        }
      })
      .catch((error) => {
        if (!isActive) return;

        setStorageHealthCheckFailed(true);
        console.error("检查扩展存储保护状态失败:", error);
      })
      .finally(() => {
        if (isActive) setStorageHealthChecked(true);
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <HashRouter>
      <Toaster position="top-center" />
      <MainLayout
        storageHealth={storageHealth}
        storageHealthChecked={storageHealthChecked}
        storageHealthCheckFailed={storageHealthCheckFailed}
      >
        <div>
          <Routes>
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/" element={<History />} />
            <Route path="/about" element={<About />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/cloud-sync" element={<CloudSync />} />
            <Route path="/webdav-sync" element={<WebDavSync />} />
            <Route path="/reward" element={<Reward />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/collections" element={<SubscribedCollections />} />
            <Route path="/ai-search" element={<AISearch />} />
            <Route path="/music/search" element={<SearchMusic />} />
            <Route path="/music/liked" element={<LikedMusic />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        <ScrollToTopButton />
      </MainLayout>
    </HashRouter>
  );
};

export default App;
