import apiClient from "@/utils/apiClient";

export interface MembershipStatus {
  loggedIn: boolean;
  active: boolean;
  plan: string | null;
  expiresAt: string | null;
}

const INACTIVE: MembershipStatus = {
  loggedIn: false,
  active: false,
  plan: null,
  expiresAt: null,
};

/**
 * 读取当前登录用户的会员状态。
 * 接口不可用或未登录时统一返回「非会员」，保证订阅引导可以正常展示。
 */
export const getMembershipStatus = async (): Promise<MembershipStatus> => {
  try {
    const res = (await apiClient.get("/api/membership")) as any;
    return {
      loggedIn: Boolean(res?.loggedIn),
      active: Boolean(res?.active),
      plan: res?.plan ?? null,
      expiresAt: res?.expiresAt ?? null,
    };
  } catch (error) {
    console.warn("读取会员状态失败，按非会员处理:", error);
    return INACTIVE;
  }
};
