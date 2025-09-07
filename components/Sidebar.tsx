import { useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  CloudIcon,
  Crown,
  HistoryIcon,
  InfoIcon,
  MessageCircleIcon,
  MusicIcon,
  SettingsIcon,
} from "lucide-react";
import { UserInfo } from "./UserInfo";
import ExpandableMenu from "./ExpandableMenu";
const menuList = [
  {
    title: "历史记录",
    icon: <HistoryIcon className="w-4 h-4" />,
    to: "/",
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

  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    // 兼容 Chrome/Firefox
    const manifest = browser?.runtime?.getManifest?.();
    if (manifest?.version) {
      setVersion(manifest.version);
    }
  }, []);

  return (
    <div className="fixed top-0 left-0 w-40 bg-gray-100 flex-shrink-0 h-full">
      <UserInfo />

      <nav className="space-y-2 p-4">
        {menuList.map((item, index) => (
          <ExpandableMenu key={index} {...item} />
        ))}
      </nav>

      <p className="absolute bottom-2 left-2 text-gray-600 text-base">
        {version ? `v${version}` : ""}
      </p>
    </div>
  );
};
