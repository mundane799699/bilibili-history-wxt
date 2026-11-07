import { useEffect } from "react";
import { Crown } from "lucide-react";
import { getSession } from "@/services/auth";
import type { MembershipStatus } from "@/services/membership";
import { useUserStore } from "@/utils/store";

const baseUrl = import.meta.env.VITE_BASE_API || "https://bilibilihistory.mundane.ink";

/** 方案 id 见官网 lib/pay/plans.ts */
const PLAN_NAMES: Record<string, string> = {
  month: "月度会员",
  year: "年度会员",
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

interface UserInfoProps {
  /** 不传则不展示会员信息；null 表示加载中 */
  membership?: MembershipStatus | null;
}

export const UserInfo = ({ membership }: UserInfoProps) => {
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

  const showMembership = Boolean(userInfo) && membership !== undefined;
  const isMember = Boolean(membership?.active);
  const planName = isMember ? (PLAN_NAMES[membership?.plan ?? ""] ?? "会员") : "免费版";

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
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-[13.5px] font-medium text-ink dark:text-night-text">
            {isLoading ? "加载中…" : userInfo ? userInfo.name : "未登录"}
          </p>
          {showMembership && membership && (
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                isMember
                  ? "bg-brand-soft text-brand-strong dark:bg-brand/10 dark:text-brand"
                  : "bg-wash text-ink-muted dark:bg-night-line dark:text-night-muted"
              }`}
            >
              {isMember && <Crown className="h-3 w-3" />}
              {planName}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12.5px] tabular-nums text-ink-muted dark:text-night-muted">
          {!userInfo
            ? "登录后即可使用云同步"
            : isMember
              ? `有效期至 ${membership?.expiresAt ? formatDate(membership.expiresAt) : "永久"}`
              : "已登录，可以使用云同步"}
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
