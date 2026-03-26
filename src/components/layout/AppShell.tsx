import { useState, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { useRepoStore } from "../../stores/repoStore";
import { useEditorStore } from "../../stores/editorStore";
import { useT } from "../../i18n";
import { useUpdateCheck } from "../../hooks/useUpdateCheck";
import {
  IconGear,
  IconWindowMinimize,
  IconWindowRestore,
  IconWindowMaximize,
  IconWindowClose,
} from "../Icons";
import HomeView from "../../views/HomeView";
import EditorView from "../../views/EditorView";
import ReviewView from "../../views/ReviewView";
import TokenSetup from "../auth/TokenSetup";
import SettingsModal from "../settings/SettingsModal";
import ErrorBoundary from "../ErrorBoundary";

export default function AppShell() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const currentUser = useAuthStore((s) => s.currentUser);
  const repoInfo = useRepoStore((s) => s.repoInfo);
  const editorReady = useEditorStore((s) => s.sourceFile !== null);
  const isDirty = useEditorStore((s) => s.isDirty);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const t = useT();
  const { updateAvailable, updateVersion, isInstalling, installAndRelaunch } =
    useUpdateCheck();

  const handleNav = useCallback(
    async (target: "home" | "editor" | "review") => {
      if (isDirty && view === "editor" && target !== "editor") {
        const ok = await confirm(t.app.unsavedChangesPrompt, {
          title: "Lingoa",
          kind: "warning",
        });
        if (!ok) return;
      }
      setSettingsOpen(false);
      setView(target);
    },
    [isDirty, view, setView],
  );

  useEffect(() => {
    const win = getCurrentWindow();
    win.isMaximized().then(setIsMaximized);
    let unlisten: (() => void) | undefined;
    win
      .onResized(() => win.isMaximized().then(setIsMaximized))
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  return (
    <div className="flex flex-col h-screen bg-app-base text-app-text overflow-hidden">
      {/* Global top bar */}
      <header
        className="flex items-center gap-4 px-4 h-10 bg-app-surface border-b border-app-border shrink-0 select-none"
        data-tauri-drag-region
      >
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

        {/* Update indicator — appears when a new version is available */}
        {updateAvailable && (
          <button
            onClick={installAndRelaunch}
            disabled={isInstalling}
            title={`${t.update.tooltip}${updateVersion ? ` (${updateVersion})` : ""}`}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-app-accent/15 text-app-accent hover:bg-app-accent/25 transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-app-accent animate-pulse shrink-0" />
            {isInstalling ? t.update.installing : t.update.available}
          </button>
        )}

        {/* View tabs — always visible once past token-setup */}
        {view !== "token-setup" && (
          <nav className="flex gap-1">
            <button
              onClick={() => handleNav("home")}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                view === "home"
                  ? "bg-app-accent text-white"
                  : "text-app-muted hover:text-app-text hover:bg-app-surface-2"
              }`}
            >
              {t.nav.home}
            </button>
            <button
              onClick={() => editorReady && handleNav("editor")}
              disabled={!editorReady}
              title={!editorReady ? t.nav.editorDisabledHint : undefined}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                view === "editor"
                  ? "bg-app-accent text-white"
                  : editorReady
                    ? "text-app-muted hover:text-app-text hover:bg-app-surface-2"
                    : "text-app-muted/40 cursor-not-allowed"
              }`}
            >
              {t.nav.editor}
            </button>
            <button
              onClick={() =>
                repoInfo && currentUser ? handleNav("review") : undefined
              }
              disabled={!repoInfo || !currentUser}
              title={
                !repoInfo || !currentUser ? t.nav.reviewDisabledHint : undefined
              }
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                view === "review"
                  ? "bg-app-accent text-white"
                  : repoInfo && currentUser
                    ? "text-app-muted hover:text-app-text hover:bg-app-surface-2"
                    : "text-app-muted/40 cursor-not-allowed"
              }`}
            >
              {t.nav.review}
            </button>
          </nav>
        )}

        {/* settings */}
        <div className="flex items-center gap-2">
          {/* Settings gear */}
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            title={t.settings.title}
            className="p-1 text-app-muted hover:text-app-text transition-colors rounded"
          >
            <IconGear className="w-4 h-4" />
          </button>
        </div>

        {/* Window controls */}
        <div className="flex items-stretch h-full -mr-4 ml-2">
          <button
            onClick={() => getCurrentWindow().minimize()}
            title={t.window.minimize}
            className="flex items-center justify-center w-11 h-full text-app-muted hover:text-app-text hover:bg-app-surface-2 transition-colors"
          >
            <IconWindowMinimize className="w-3 h-2" />
          </button>
          <button
            onClick={() => getCurrentWindow().toggleMaximize()}
            title={isMaximized ? t.window.restore : t.window.maximize}
            className="flex items-center justify-center w-11 h-full text-app-muted hover:text-app-text hover:bg-app-surface-2 transition-colors"
          >
            {isMaximized ? (
              <IconWindowRestore className="w-3 h-3" />
            ) : (
              <IconWindowMaximize className="w-3 h-3" />
            )}
          </button>
          <button
            onClick={() => getCurrentWindow().close()}
            title={t.window.close}
            className="flex items-center justify-center w-11 h-full text-app-muted hover:text-white hover:bg-red-500 transition-colors"
          >
            <IconWindowClose className="w-3 h-3" />
          </button>
        </div>
      </header>

      {/* Content */}
      <ErrorBoundary>
        <div className="flex-1 min-h-0">
          {view === "token-setup" && <TokenSetup />}
          {view === "home" && <HomeView />}
          {view === "editor" && <EditorView />}
          {view === "review" && <ReviewView />}
        </div>
      </ErrorBoundary>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
