import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { Crown } from "lucide-react";
import { UserInfo } from "./UserInfo";

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
        <Link
          to="/"
          className={`block w-full px-4 py-2 text-left rounded transition-colors text-lg ${
            location.pathname === "/"
              ? "bg-pink-400 text-white"
              : "text-gray-700 hover:bg-gray-200"
          }`}
        >
          历史记录
        </Link>
        <Link
          to="/about"
          className={`block w-full px-4 py-2 text-left rounded transition-colors text-lg ${
            location.pathname === "/about"
              ? "bg-pink-400 text-white"
              : "text-gray-700 hover:bg-gray-200"
          }`}
        >
          关于
        </Link>
        <Link
          to="/feedback"
          className={`block w-full px-4 py-2 text-left rounded transition-colors text-lg ${
            location.pathname === "/feedback"
              ? "bg-pink-400 text-white"
              : "text-gray-700 hover:bg-gray-200"
          }`}
        >
          反馈
        </Link>
        <Link
          to="/cloud-sync"
          className={`block w-full px-4 py-2 text-left rounded transition-colors text-lg ${
            location.pathname === "/cloud-sync"
              ? "bg-pink-400 text-white"
              : "text-gray-700 hover:bg-gray-200"
          }`}
        >
          <span className="flex items-center gap-2">
            云同步
            <Crown
              size={16}
              className={` ${
                location.pathname === "/cloud-sync"
                  ? "text-white"
                  : "text-yellow-500"
              }`}
            />
          </span>
        </Link>
        <Link
          to="/settings"
          className={`block w-full px-4 py-2 text-left rounded transition-colors text-lg ${
            location.pathname === "/settings"
              ? "bg-pink-400 text-white"
              : "text-gray-700 hover:bg-gray-200"
          }`}
        >
          设置
        </Link>
      </nav>

      <p className="absolute bottom-2 left-2 text-gray-600 text-base">
        {version ? `v${version}` : ""}
      </p>
    </div>
  );
};
