import { create } from "zustand";
import { tauriKeychain } from "../lib/tauri";
import { initGitHub, fetchCurrentUser } from "../lib/github";
import { useAppStore } from "./appStore";

interface AuthState {
  token: string | null;
  currentUser: string | null;
  isLoading: boolean;
  error: string | null;

  /** Load token from OS keychain on app start */
  loadToken: () => Promise<void>;
  /** Save token, init GitHub client, fetch user */
  saveToken: (token: string) => Promise<void>;
  /** Remove token from keychain and reset state */
  logout: () => Promise<void>;
  /** Skip auth and continue without a token (local-only mode) */
  skipAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  currentUser: null,
  isLoading: false,
  error: null,

  loadToken: async () => {
    set({ isLoading: true, error: null });
    try {
      // Try OS keychain first, fall back to localStorage for reliability
      let token: string | null = null;
      try { token = await tauriKeychain.get(); } catch { /* keychain unavailable */ }
      if (!token) token = localStorage.getItem("lingoa:token");

      if (token) {
        initGitHub(token);
        const user = await fetchCurrentUser();
        set({ token, currentUser: user, isLoading: false });
        useAppStore.getState().setView("home");
      } else {
        set({ isLoading: false });
        useAppStore.getState().setView("token-setup");
      }
    } catch {
      set({ isLoading: false });
      useAppStore.getState().setView("token-setup");
    }
  },

  saveToken: async (token) => {
    set({ isLoading: true, error: null });
    try {
      initGitHub(token);
      const user = await fetchCurrentUser();
      try { await tauriKeychain.store(token); } catch { /* keychain unavailable */ }
      localStorage.setItem("lingoa:token", token);
      set({ token, currentUser: user, isLoading: false });
      useAppStore.getState().setView("home");
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : "Invalid token",
      });
    }
  },

  skipAuth: () => {
    useAppStore.getState().setView("home");
  },

  logout: async () => {
    await tauriKeychain.delete().catch(() => {});
    localStorage.removeItem("lingoa:token");
    set({ token: null, currentUser: null });
    useAppStore.getState().setView("token-setup");
  },
}));
