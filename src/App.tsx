import { useEffect } from "react";
import { useAppStore } from "./stores/appStore";
import { useAuthStore } from "./stores/authStore";
import { useRepoStore } from "./stores/repoStore";
import { useSettingsStore } from "./stores/settingsStore";
import TokenSetup from "./components/auth/TokenSetup";
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

  if (view === "loading") return null;
  if (view === "token-setup") return <TokenSetup />;
  return <AppShell />;
}
