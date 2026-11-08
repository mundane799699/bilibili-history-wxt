import apiClient from "@/utils/apiClient";

export interface MembershipStatus {
  loggedIn: boolean;
  active: boolean;
  plan: string | null;
  expiresAt: string | null;
  /** 后端会员记录状态：active / expired / cancelled，无记录时为 null */
  status: string | null;
}

const INACTIVE: MembershipStatus = {
  loggedIn: false,
  active: false,
  plan: null,
  expiresAt: null,
  status: null,
};

/** 有效会员：后端判定为 active，且在有效期内（expiresAt 为空表示永久会员） */
export const isMembershipValid = (membership: MembershipStatus | null | undefined): boolean => {
  if (!membership?.loggedIn || !membership.active) return false;
  if (!membership.expiresAt) return true;
  const expiresAt = new Date(membership.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
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
      status: res?.status ?? null,
    };
  } catch (error) {
    console.warn("读取会员状态失败，按非会员处理:", error);
    return INACTIVE;
  }
};
