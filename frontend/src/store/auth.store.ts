import { create } from "zustand";
import { authApi, type AuthUser } from "../api/auth.api";

type Status = "idle" | "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  user: AuthUser | null;
  status: Status;
  init: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "idle",

  init: async () => {
    set({ status: "loading" });
    try {
      const { data } = await authApi.me();
      set({ user: data.user, status: "authenticated" });
    } catch {
      try {
        await authApi.refresh();
        const { data } = await authApi.me();
        set({ user: data.user, status: "authenticated" });
      } catch {
        set({ user: null, status: "unauthenticated" });
      }
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      set({ user: null, status: "unauthenticated" });
    }
  },

  setUser: (user) => set({ user, status: "authenticated" }),
}));
