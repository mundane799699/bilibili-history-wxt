import { useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  CloudIcon,
  Star,
  HistoryIcon,
  InfoIcon,
  MessageCircleIcon,
  MusicIcon,
  SettingsIcon,
  HardDriveDownload,
  Sparkles,
  Sun,
  Moon,
  Heart,
  LibraryBig,
} from "lucide-react";
import ExpandableMenu from "./ExpandableMenu";
import { SubscribePromo } from "./SubscribePromo";
import {
  UPDATE_HISTORY,
  HIDDEN_MENUS,
  THEME_MODE,
  SUBSCRIBE_PROMO_DISMISSED_FOR,
} from "../utils/constants";
import { getStorageValue, setStorageValue } from "../utils/storage";
import { setTheme, type ThemeMode } from "../utils/theme";
import { getMembershipStatus } from "../services/membership";
import { getSession } from "../services/auth";

/** 未登录时也允许关闭，用一个固定标识代替会话 token */
const ANONYMOUS_PROMO_KEY = "__anonymous__";

const iconClass = "h-4 w-4";

const menuList = [
  {
    title: "历史记录",
    group: "浏览数据",
    icon: <HistoryIcon className={iconClass} />,
    to: "/",
    tourId: "history-menu",
  },
  {
    title: "收藏夹",
    group: "浏览数据",
    icon: <Star className={iconClass} />,
    to: "/favorites",
  },
  {
    title: "合集",
    group: "浏览数据",
    icon: <LibraryBig className={iconClass} />,
    to: "/collections",
  },
  {
    title: "AI探索",
    group: "浏览数据",
    icon: <Sparkles className={iconClass} />,
    to: "/ai-search",
  },
  {
    title: "听歌",
    group: "浏览数据",
    icon: <MusicIcon className={iconClass} />,
    subMenus: [
      {
        title: "搜索",
        to: "/music/search",
      },
      {
        title: "我喜欢的音乐",
        to: "/music/liked",
      },
    ],
  },
  {
    title: "关于",
    group: "更多",
    icon: <InfoIcon className={iconClass} />,
    to: "/about",
  },
  {
    title: "反馈",
    group: "更多",
    icon: <MessageCircleIcon className={iconClass} />,
    to: "/feedback",
  },
  {
    title: "云同步",
    group: "同步与备份",
    icon: <CloudIcon className={iconClass} />,
    to: "/cloud-sync",
  },
  {
    title: "数据备份",
    group: "同步与备份",
    icon: <HardDriveDownload className={iconClass} />,
    tourId: "backup-menu",
    subMenus: [
      {
        title: "本地目录",
        to: "/backup/local",
      },
      {
        title: "WebDAV",
        to: "/backup/webdav",
      },
      {
        title: "JSON 文件",
        to: "/backup/json",
      },
    ],
  },
  {
    title: "赞赏",
    group: "更多",
    icon: <Heart className={iconClass} />,
    to: "/reward",
  },
  {
    title: "设置",
    group: "更多",
    icon: <SettingsIcon className={iconClass} />,
    to: "/settings",
  },
];

export const Sidebar = () => {
  const location = useLocation();

  const [version, setVersion] = useState<string>(UPDATE_HISTORY[0]?.version || "");
  const [hiddenMenus, setHiddenMenus] = useState<string[]>([]);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [showSubscribePromo, setShowSubscribePromo] = useState(false);
  const [promoSessionKey, setPromoSessionKey] = useState<string>("");

  useEffect(() => {
    getStorageValue<string[]>(HIDDEN_MENUS, []).then((menus) => {
      // Keep the renamed entry hidden for users who previously hid "WebDAV".
      setHiddenMenus(
        menus.includes("WebDAV") && !menus.includes("数据备份") ? [...menus, "数据备份"] : menus,
      );
    });
    getStorageValue<ThemeMode>(THEME_MODE, "light").then((m) =>
      setThemeMode(m === "dark" ? "dark" : "light"),
    );

    const handleStorageChange = (
      changes: { [key: string]: Browser.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === "local") {
        if (changes[HIDDEN_MENUS]) {
          setHiddenMenus((changes[HIDDEN_MENUS].newValue as string[]) || []);
        }
        if (changes[THEME_MODE]) {
          const next = changes[THEME_MODE].newValue as ThemeMode | undefined;
          setThemeMode(next === "dark" ? "dark" : "light");
        }
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // 订阅引导：会员不展示；关闭只对当前登录会话生效，下次登录会重新出现
  useEffect(() => {
    let isActive = true;
    Promise.all([
      getStorageValue<string>(SUBSCRIBE_PROMO_DISMISSED_FOR, ""),
      getMembershipStatus(),
      getSession().catch(() => null),
    ])
      .then(([dismissedFor, membership, session]) => {
        if (!isActive) return;
        const token = (session as any)?.session?.token ?? "";
        const key = token || ANONYMOUS_PROMO_KEY;
        setPromoSessionKey(key);
        setShowSubscribePromo(!membership.active && dismissedFor !== key);
      })
      .catch((error) => {
        console.error("读取订阅引导状态失败:", error);
      });
    return () => {
      isActive = false;
    };
  }, []);

  const dismissSubscribePromo = () => {
    setShowSubscribePromo(false);
    const key = promoSessionKey || ANONYMOUS_PROMO_KEY;
    void setStorageValue(SUBSCRIBE_PROMO_DISMISSED_FOR, key).catch((error) => {
      console.error("保存订阅引导状态失败:", error);
    });
  };

  const handleToggleTheme = () => {
    setTheme(themeMode === "dark" ? "light" : "dark");
  };

  const isDark = themeMode === "dark";

  return (
    <aside className="fixed top-0 left-0 z-40 flex h-full w-52 flex-col border-r border-line bg-paper dark:border-night-line dark:bg-night-card">
      {/* 品牌区 */}
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-4 dark:border-night-line">
        <img src="/icon/32.png" alt="" className="h-6 w-6 rounded-md" />
        <span className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink dark:text-night-text">
          无限历史记录
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        {["浏览数据", "同步与备份", "更多"].map((group) => {
          const items = menuList.filter(
            (item) => item.group === group && !hiddenMenus.includes(item.title),
          );
          if (!items.length) return null;
          return (
            <div key={group} className="mb-3 last:mb-0">
              <p className="px-2.5 pb-1.5 text-[11px] font-medium tracking-[0.08em] text-ink-faint dark:text-night-muted">
                {group}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => (
                  <ExpandableMenu key={item.title} {...item} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {showSubscribePromo && <SubscribePromo variant="sidebar" onDismiss={dismissSubscribePromo} />}

      <div className="flex items-center justify-between border-t border-line px-3 py-2.5 dark:border-night-line">
        <p className="text-[12px] tabular-nums text-ink-faint dark:text-night-muted">
          {version ? `v${version}` : ""}
        </p>
        <button
          type="button"
          onClick={handleToggleTheme}
          title={isDark ? "切换到白天模式" : "切换到黑夜模式"}
          aria-label={isDark ? "切换到白天模式" : "切换到黑夜模式"}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-wash hover:text-ink-soft dark:text-night-muted dark:hover:bg-night-line/60 dark:hover:text-night-text"
        >
          {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
      </div>
    </aside>
  );
};
