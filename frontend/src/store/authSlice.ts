import { StateCreator } from "zustand";
import { isDesktopApp } from "../lib/runtime.js";

export interface UserState {
  id: string;
  email: string;
  fullName?: string | null;
  status: string;
}

export interface AuthSlice {
  user: UserState | null;
  isAuthenticated: boolean;
  accessToken: string | null;
  setUser: (user: UserState | null) => void;
  setAccessToken: (token: string | null) => void;
  logout: () => void;
}

const isDesktop = isDesktopApp();
const initialDesktopUser: UserState | null = isDesktop
  ? {
      id: "00000000-0000-4000-8000-000000000001",
      email: "local@desktop.invalid",
      fullName: "Usuario Local",
      status: "ACTIVE"
    }
  : null;

export const createAuthSlice: StateCreator<AuthSlice> = (set) => ({
  user: initialDesktopUser,
  isAuthenticated: isDesktop,
  accessToken: null,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  logout: () =>
    set({
      user: isDesktop ? initialDesktopUser : null,
      isAuthenticated: isDesktop,
      accessToken: null
    })
});
