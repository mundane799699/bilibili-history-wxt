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
} from "lucide-react";
import { UserInfo } from "./UserInfo";
import ExpandableMenu from "./ExpandableMenu";
import { UPDATE_HISTORY, HIDE_USER_INFO, HIDDEN_MENUS, THEME_MODE } from "../utils/constants";
import { getStorageValue } from "../utils/storage";
import { setTheme, type ThemeMode } from "../utils/theme";

const menuList = [
  {
    title: "历史记录",
    icon: <HistoryIcon className="w-4 h-4" />,
    to: "/",
  },
  {
    title: "收藏夹",
    icon: <Star className="w-4 h-4" />,
    to: "/favorites",
  },
  {
    title: "AI探索",
    icon: <Sparkles className="w-4 h-4" />,
    to: "/ai-search",
  },
  {
    title: "听歌",
    icon: <MusicIcon className="w-4 h-4" />,
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
    icon: <InfoIcon className="w-4 h-4" />,
    to: "/about",
  },
  {
    title: "反馈",
    icon: <MessageCircleIcon className="w-4 h-4" />,
    to: "/feedback",
  },
  {
    title: "云同步",
    icon: <CloudIcon className="w-4 h-4" />,
    to: "/cloud-sync",
  },
  {
    title: "WebDAV",
    icon: <HardDriveDownload className="w-4 h-4" />,
    to: "/webdav-sync",
  },
  {
    title: "赞赏",
    icon: <Heart className="w-4 h-4" />,
    to: "/reward",
  },
  {
    title: "设置",
    icon: <SettingsIcon className="w-4 h-4" />,
    to: "/settings",
  },
];

export const Sidebar = () => {
  const location = useLocation();

  const [version, setVersion] = useState<string>(UPDATE_HISTORY[0]?.version || "");
  const [hideUserInfo, setHideUserInfo] = useState(false);
  const [hiddenMenus, setHiddenMenus] = useState<string[]>([]);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");

  useEffect(() => {
    getStorageValue(HIDE_USER_INFO, false).then(setHideUserInfo);
    getStorageValue(HIDDEN_MENUS, []).then(setHiddenMenus);
    getStorageValue<ThemeMode>(THEME_MODE, "light").then((m) =>
      setThemeMode(m === "dark" ? "dark" : "light"),
    );

    const handleStorageChange = (
      changes: { [key: string]: Browser.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === "local") {
        if (changes[HIDE_USER_INFO]) {
          setHideUserInfo(changes[HIDE_USER_INFO].newValue as boolean);
        }
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

  const handleToggleTheme = () => {
    setTheme(themeMode === "dark" ? "light" : "dark");
  };

  const isDark = themeMode === "dark";

  return (
    <div className="fixed top-0 left-0 w-40 bg-gray-100 dark:bg-[#141414] dark:text-neutral-100 flex-shrink-0 h-full">
      {!hideUserInfo && <UserInfo />}

      <nav className="space-y-2 p-4">
        {menuList
          .filter((item) => !hiddenMenus.includes(item.title))
          .map((item, index) => (
            <ExpandableMenu key={index} {...item} />
          ))}
      </nav>

      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
        <p className="text-gray-600 dark:text-neutral-400 text-base leading-none">
          {version ? `v${version}` : ""}
        </p>
        <button
          type="button"
          onClick={handleToggleTheme}
          title={isDark ? "切换到白天模式" : "切换到黑夜模式"}
          aria-label={isDark ? "切换到白天模式" : "切换到黑夜模式"}
          className="inline-flex items-center justify-center w-8 h-8 rounded-md text-gray-600 hover:bg-gray-200 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};
