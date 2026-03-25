import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "./stores/appStore";
import { useAuthStore } from "./stores/authStore";
import { useRepoStore } from "./stores/repoStore";
import { useSettingsStore } from "./stores/settingsStore";
import AppShell from "./components/layout/AppShell";

export default function App() {
  const view = useAppStore((s) => s.view);
  const loadToken = useAuthStore((s) => s.loadToken);
  const loadRecentRepos = useRepoStore((s) => s.loadRecentRepos);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    loadSettings();
    loadToken();
    loadRecentRepos();
  }, [loadSettings, loadToken, loadRecentRepos]);

  // Show the window once the app is ready — avoids white flash on startup
  useEffect(() => {
    if (view !== "loading") {
      getCurrentWindow().show();
    }
  }, [view]);

  if (view === "loading") return null;
  return <AppShell />;
}
