import { useEffect } from "react";
import { getSession } from "@/services/auth";
import { useUserStore } from "@/utils/store";

const baseUrl = import.meta.env.VITE_BASE_API || "https://bilibilihistory.mundane.ink";

export const UserInfo = () => {
  const { userInfo, isLoading, setUserInfo, setIsLoading } = useUserStore();

  const fetchUserInfo = () => {
    setIsLoading(true);
    getSession()
      .then((res: any) => {
        if (res) {
          const { user } = res;
          setUserInfo(user);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchUserInfo();
  }, []);

  useEffect(() => {
    const handleTabActivated = (activeInfo: any) => {
      browser.tabs.get(activeInfo.tabId).then((tab) => {
        if (tab.url?.startsWith(browser.runtime.getURL("/my-history.html"))) {
          console.log("userInfo = ", userInfo);
          if (userInfo) {
            return;
          }
          fetchUserInfo();
        }
      });
    };

    browser.tabs.onActivated.addListener(handleTabActivated);
    return () => {
      browser.tabs.onActivated.removeListener(handleTabActivated);
    };
  }, [userInfo]);

  // 获取用户名首字母并转为大写
  const getInitial = (name: string) => {
    const firstChar = name.charAt(0);
    return firstChar.toUpperCase();
  };

  const handleUserNameClick = () => {
    if (userInfo) {
      window.open(`${baseUrl}/dashboard`, "_blank");
    } else {
      window.open(`${baseUrl}/login`, "_blank");
    }
  };

  return (
    <div className="mb-8 flex items-center gap-4 p-4 bg-gray-50 dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800">
      <div className="w-12 h-12 flex-shrink-0 rounded-full overflow-hidden bg-gray-300 dark:bg-neutral-700">
        {userInfo ? (
          <div className="w-full h-full bg-pink-400 dark:bg-gray-700 flex items-center justify-center">
            <span className="text-white font-medium text-lg">{getInitial(userInfo.name)}</span>
          </div>
        ) : (
          <img src="/noface.jpg" alt="用户头像" className="w-full h-full object-cover" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-medium text-gray-900 dark:text-neutral-100 truncate">
          {isLoading ? "加载中..." : userInfo ? userInfo.name : "未登录"}
        </p>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          {userInfo ? "已登录，可以使用云同步" : "登录后即可使用云同步"}
        </p>
      </div>
      <button
        onClick={handleUserNameClick}
        disabled={isLoading}
        className="flex-shrink-0 px-4 py-2 text-sm font-medium text-white bg-pink-400 hover:bg-pink-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {userInfo ? "账户中心" : "去登录"}
      </button>
    </div>
  );
};
