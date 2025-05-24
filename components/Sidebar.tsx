import { Link, useLocation } from "react-router-dom";

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
    <div className="w-40 bg-gray-100 flex-shrink-0 relative">
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
          to="/update-history"
          className={`block w-full px-4 py-2 text-left rounded transition-colors text-lg ${
            location.pathname === "/update-history"
              ? "bg-pink-400 text-white"
              : "text-gray-700 hover:bg-gray-200"
          }`}
        >
          更新日志
        </Link>
        <Link
          to="/open-source"
          className={`block w-full px-4 py-2 text-left rounded transition-colors text-lg ${
            location.pathname === "/open-source"
              ? "bg-pink-400 text-white"
              : "text-gray-700 hover:bg-gray-200"
          }`}
        >
          参与开发
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
