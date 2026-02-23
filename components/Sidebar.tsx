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
} from "lucide-react";
import { UserInfo } from "./UserInfo";
import ExpandableMenu from "./ExpandableMenu";
import { UPDATE_HISTORY, HIDE_USER_INFO, HIDDEN_MENUS } from "../utils/constants";
import { getStorageValue } from "../utils/storage";

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

  useEffect(() => {
    getStorageValue(HIDE_USER_INFO, false).then(setHideUserInfo);
    getStorageValue(HIDDEN_MENUS, []).then(setHiddenMenus);

    const handleStorageChange = (
      changes: { [key: string]: Browser.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === "local") {
        if (changes[HIDE_USER_INFO]) {
          setHideUserInfo(changes[HIDE_USER_INFO].newValue as boolean);
        }
        if (changes[HIDDEN_MENUS]) {
          setHiddenMenus((changes[HIDDEN_MENUS].newValue as string[]) || []);
        }
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);


  return (
    <div className="fixed top-0 left-0 w-40 bg-gray-100 flex-shrink-0 h-full">
      {!hideUserInfo && <UserInfo />}

      <nav className="space-y-2 p-4">
        {menuList
          .filter((item) => !hiddenMenus.includes(item.title))
          .map((item, index) => (
            <ExpandableMenu key={index} {...item} />
          ))}
      </nav>

      <p className="absolute bottom-2 left-2 text-gray-600 text-base">
        {version ? `v${version}` : ""}
      </p>
    </div>
  );
};
