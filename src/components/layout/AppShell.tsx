import { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { useRepoStore } from "../../stores/repoStore";
import { useT } from "../../i18n";
import HomeView from "../../views/HomeView";
import EditorView from "../../views/EditorView";
import ReviewView from "../../views/ReviewView";
import SettingsModal from "../settings/SettingsModal";

export default function AppShell() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const currentUser = useAuthStore((s) => s.currentUser);
  const repoInfo = useRepoStore((s) => s.repoInfo);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const t = useT();

  return (
    <div className="flex flex-col h-screen bg-app-base text-app-text overflow-hidden">
      {/* Global top bar */}
      <header className="flex items-center gap-4 px-4 h-10 bg-app-surface border-b border-app-border shrink-0">
        {/* Logo */}
        <span className="font-bold text-app-text text-sm tracking-tight">
          Lingoa
        </span>

        {/* Repo indicator */}
        {repoInfo && (
          <span className="text-app-muted text-xs font-mono">
            {repoInfo.owner}/{repoInfo.repo}
          </span>
        )}

        <div className="flex-1" />

        {/* View tabs */}
        {(view === "editor" || view === "review" || repoInfo) && (
          <nav className="flex gap-1">
            <button
              onClick={() => setView("home")}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                view === "home"
                  ? "bg-app-accent text-white"
                  : "text-app-muted hover:text-app-text hover:bg-app-surface-2"
              }`}
            >
              {t.nav.home}
            </button>
            <button
              onClick={() => setView("editor")}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                view === "editor"
                  ? "bg-app-accent text-white"
                  : "text-app-muted hover:text-app-text hover:bg-app-surface-2"
              }`}
            >
              {t.nav.editor}
            </button>
            {repoInfo && currentUser && (
              <button
                onClick={() => setView("review")}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  view === "review"
                    ? "bg-app-accent text-white"
                    : "text-app-muted hover:text-app-text hover:bg-app-surface-2"
                }`}
              >
                {t.nav.review}
              </button>
            )}
          </nav>
        )}

        {/* User + settings */}
        <div className="flex items-center gap-2">
          {currentUser && (
            <span className="text-app-muted text-xs">@{currentUser}</span>
          )}

          {/* Settings gear */}
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            className="p-1 text-app-muted hover:text-app-text transition-colors rounded"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {view === "home" && <HomeView />}
        {view === "editor" && <EditorView />}
        {view === "review" && <ReviewView />}
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
