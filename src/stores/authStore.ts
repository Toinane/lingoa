import { create } from "zustand";
import { tauriKeychain, tauriGitHub } from "../lib/tauri";
import { fetchCurrentUser } from "../lib/github";
import { useAppStore } from "./appStore";

interface AuthState {
  currentUser: string | null;
  isLoading: boolean;
  error: string | null;

  /** Validate the token stored in the OS keychain and load the current user. */
  loadToken: () => Promise<void>;
  /** Store token in the OS keychain, then validate and load the current user. */
  saveToken: (token: string) => Promise<void>;
  /** Remove token from keychain and reset state. */
  logout: () => Promise<void>;
  /** Skip auth and continue without a token (local-only mode). */
  skipAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  isLoading: false,
  error: null,

  loadToken: async () => {
    set({ isLoading: true, error: null });

    // Fast keychain presence check — does not make any network call.
    const stored = await tauriKeychain.isStored().catch(() => false);
    if (!stored) {
      set({ isLoading: false });
      useAppStore.getState().setView("token-setup");
      return;
    }

    // Token exists — try to validate it against GitHub.
    try {
      const user = await fetchCurrentUser();
      set({ currentUser: user, isLoading: false });
      useAppStore.getState().setView("home");
    } catch {
      // Token is stored but GitHub is unreachable (offline, timeout, revoked).
      // Go to home anyway — the user can retry when they open a repo or PR list.
      // If the token is actually revoked the next GitHub call will surface the error.
      set({ isLoading: false, currentUser: null });
      useAppStore.getState().setView("home");
    }
  },

  saveToken: async (token) => {
    set({ isLoading: true, error: null });
    try {
      // 1. Validate the token directly — before touching the keychain.
      //    This separates "bad token" from "keychain unavailable" errors.
      const user = await tauriGitHub.validateToken(token);
      // 2. Token is valid — persist it.
      await tauriKeychain.store(token);
      set({ currentUser: user, isLoading: false });
      useAppStore.getState().setView("home");
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : "Failed to save token";
      set({ isLoading: false, error: msg });
    }
  },

  skipAuth: () => {
    useAppStore.getState().setView("home");
  },

  logout: async () => {
    await tauriKeychain.delete().catch((e: unknown) => {
      console.debug("[lingoa] Token deletion on logout failed:", e);
    });
    set({ currentUser: null });
    useAppStore.getState().setView("token-setup");
  },
}));
