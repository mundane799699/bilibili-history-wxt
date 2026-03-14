import { useEffect } from "react";
import { getSession } from "@/services/auth";
import { useUserStore } from "@/utils/store";

const baseUrl = import.meta.env.VITE_BASE_API || "https://bilibilihistory.com";

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
    <div className="py-2 px-4">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-300">
          {userInfo ? (
            <div className="w-full h-full bg-pink-400 flex items-center justify-center">
              <span className="text-white font-medium text-sm">{getInitial(userInfo.name)}</span>
            </div>
          ) : (
            <img src="/noface.jpg" alt="用户头像" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium text-gray-900 truncate cursor-pointer hover:text-pink-400`}
            onClick={handleUserNameClick}
          >
            {isLoading ? "加载中..." : userInfo ? userInfo.name : "未登录"}
          </p>
        </div>
      </div>
    </div>
  );
};
