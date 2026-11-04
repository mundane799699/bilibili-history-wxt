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
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-card dark:border-night-line dark:bg-night-card">
      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-brand-soft dark:bg-brand/15">
        {userInfo ? (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-[15px] font-semibold text-brand-strong dark:text-brand">
              {getInitial(userInfo.name)}
            </span>
          </div>
        ) : (
          <img src="/noface.jpg" alt="用户头像" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-ink dark:text-night-text">
          {isLoading ? "加载中…" : userInfo ? userInfo.name : "未登录"}
        </p>
        <p className="mt-0.5 text-[12.5px] text-ink-muted dark:text-night-muted">
          {userInfo ? "已登录，可以使用云同步" : "登录后即可使用云同步"}
        </p>
      </div>
      <button
        onClick={handleUserNameClick}
        disabled={isLoading}
        className="flex-shrink-0 rounded-xl border border-line px-3 py-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-brand/30 hover:bg-brand-soft hover:text-brand-strong disabled:cursor-not-allowed disabled:opacity-50 dark:border-night-line dark:text-night-text dark:hover:border-brand/40 dark:hover:bg-brand/10"
      >
        {userInfo ? "账户中心" : "去登录"}
      </button>
    </div>
  );
};
