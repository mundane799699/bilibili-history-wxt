import { create } from 'zustand';

export type UserInfo = {
  createdAt?: string;
  updatedAt?: string;
  email: string;
  emailVerified?: boolean;
  name: string;
  id: string;
  image?: string;
};

interface UserStore {
  userInfo: UserInfo | null;
  isLoading: boolean;
  setUserInfo: (userInfo: UserInfo | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  clearUserInfo: () => void;
}

export const useUserStore = create<UserStore>((set) => ({
  userInfo: null,
  isLoading: false,
  setUserInfo: (userInfo) => set({ userInfo }),
  setIsLoading: (isLoading) => set({ isLoading }),
  clearUserInfo: () => set({ userInfo: null }),
})); 