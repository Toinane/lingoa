import { useState, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { useRepoStore } from "../../stores/repoStore";
import { useEditorStore } from "../../stores/editorStore";
import { useT } from "../../i18n";
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

  const handleNav = useCallback(
    async (target: "home" | "editor" | "review") => {
      if (isDirty && view === "editor" && target !== "editor") {
        const ok = await confirm("You have unsaved changes. Leave anyway?", {
          title: "Lingoa",
          kind: "warning",
        });
        if (!ok) return;
      }
      setSettingsOpen(false);
      setView(target);
    },
    [isDirty, view, setView]
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
              onClick={() => (repoInfo && currentUser) ? handleNav("review") : undefined}
              disabled={!repoInfo || !currentUser}
              title={(!repoInfo || !currentUser) ? t.nav.reviewDisabledHint : undefined}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                view === "review"
                  ? "bg-app-accent text-white"
                  : (repoInfo && currentUser)
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
            title="Settings"
            className="p-1 text-app-muted hover:text-app-text transition-colors rounded"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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

        {/* Window controls */}
        <div className="flex items-stretch h-full -mr-4 ml-2">
          <button
            onClick={() => getCurrentWindow().minimize()}
            title="Minimize"
            className="flex items-center justify-center w-11 h-full text-app-muted hover:text-app-text hover:bg-app-surface-2 transition-colors"
          >
            {/* Filled rect — no stroke needed, crispEdges for pixel-perfect horizontal line */}
            <svg
              className="w-3 h-2"
              viewBox="0 0 10 1"
              fill="currentColor"
              shapeRendering="crispEdges"
            >
              <rect width="10" height="1" />
            </svg>
          </button>
          <button
            onClick={() => getCurrentWindow().toggleMaximize()}
            title={isMaximized ? "Restore" : "Maximize"}
            className="flex items-center justify-center w-11 h-full text-app-muted hover:text-app-text hover:bg-app-surface-2 transition-colors"
          >
            {isMaximized ? (
              /* Restore: offset coords by 0.5 so 1px stroke sits on pixel boundary */
              <svg
                className="w-3 h-3"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                shapeRendering="crispEdges"
              >
                <rect
                  x="2.5"
                  y="0.5"
                  width="7"
                  height="7"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d="M0.5 2.5 L0.5 9.5 L7.5 9.5"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            ) : (
              <svg
                className="w-3 h-3"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                shapeRendering="crispEdges"
              >
                <rect
                  x="0.5"
                  y="0.5"
                  width="9"
                  height="9"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}
          </button>
          <button
            onClick={() => getCurrentWindow().close()}
            title="Close"
            className="flex items-center justify-center w-11 h-full text-app-muted hover:text-white hover:bg-red-500 transition-colors"
          >
            {/* Diagonal lines — geometricPrecision keeps antialiasing for smooth diagonals */}
            <svg
              className="w-3 h-3"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              shapeRendering="geometricPrecision"
              strokeLinecap="round"
            >
              <line
                x1="1"
                y1="1"
                x2="9"
                y2="9"
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1="9"
                y1="1"
                x2="1"
                y2="9"
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
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
