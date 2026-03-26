import { useState, useEffect, useMemo } from "react";
import KeyList from "../components/sidebar/KeyList";
import TranslationEditor from "../components/editor/TranslationEditor";
import ShortcutBar from "../components/editor/ShortcutBar";
import { useEditorStore } from "../stores/editorStore";
import { useRepoStore } from "../stores/repoStore";
import { useAuthStore } from "../stores/authStore";
import { usePRStore } from "../stores/prStore";
import { getTargetLocales } from "../lib/discovery";
import { buildBranchName } from "../lib/git";
import { openExternal } from "../lib/tauri";
import { useT, interp } from "../i18n";
import { useResizableSidebar } from "../hooks/useResizableSidebar";
import AppModal from "../components/AppModal";

interface PRModalState {
  show: boolean;
  submitting: boolean;
  url: string | null;
  error: string | null;
  userNote: string;
}

const PR_MODAL_INITIAL: PRModalState = {
  show: false,
  submitting: false,
  url: null,
  error: null,
  userNote: "",
};

export default function EditorView() {
  const {
    submitPR,
    keys,
    loadEditor,
    sourceFile,
    targetLocale,
    isLoading,
    saveCurrentKey,
    saveAndNext,
    nextKey,
    prevKey,
  } = useEditorStore();
  const { repoInfo, files, repoPath } = useRepoStore();
  const { isLoading: prLoading } = usePRStore();
  const currentUser = useAuthStore((s) => s.currentUser);
  const t = useT();

  const [prModal, setPrModal] = useState<PRModalState>(PR_MODAL_INITIAL);
  const { width: sidebarWidth, handleResizeStart } = useResizableSidebar(
    "lingoa-sidebar-width",
  );

  // Global keyboard shortcuts — work anywhere in the editor, except search/select inputs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isTextField = tag === "INPUT" || tag === "SELECT";
      if (e.shiftKey && e.key === "ArrowDown" && !isTextField) {
        e.preventDefault();
        void saveCurrentKey().then(() => nextKey());
      } else if (e.shiftKey && e.key === "ArrowUp" && !isTextField) {
        e.preventDefault();
        void saveCurrentKey().then(() => prevKey());
      } else if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        void saveAndNext();
      } else if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        void saveCurrentKey();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [saveCurrentKey, saveAndNext, nextKey, prevKey]);

  const translatedCount = useMemo(
    () => keys.filter((k) => k.editorTranslation).length,
    [keys],
  );
  const totalCount = keys.length;

  // Source files = all files sharing the current source locale
  const sourceLocale = sourceFile?.locale ?? "en";
  const sourceFiles = useMemo(
    () => files.filter((f) => f.locale === sourceLocale),
    [files, sourceLocale],
  );
  const targetLocales = useMemo(
    () => getTargetLocales(files, sourceLocale),
    [files, sourceLocale],
  );

  const handleFileChange = async (relativePath: string) => {
    if (!targetLocale || !repoPath) return;
    const newFile = files.find((f) => f.relativePath === relativePath);
    if (!newFile || newFile.relativePath === sourceFile?.relativePath) return;
    await loadEditor(newFile, targetLocale, currentUser, repoPath);
  };

  const handleLocaleChange = async (newLocale: string) => {
    if (!sourceFile || !repoPath || newLocale === targetLocale) return;
    await loadEditor(sourceFile, newLocale, currentUser, repoPath);
  };

  const handleSubmitPR = async () => {
    setPrModal((s) => ({ ...s, submitting: true, error: null }));
    try {
      const url = await submitPR(prModal.userNote);
      setPrModal({
        show: false,
        submitting: false,
        url,
        error: null,
        userNote: "",
      });
    } catch (e) {
      setPrModal((s) => ({
        ...s,
        submitting: false,
        error: e instanceof Error ? e.message : "Failed to create PR",
      }));
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside
        className="bg-app-surface flex flex-col shrink-0"
        style={{ width: sidebarWidth }}
      >
        {/* Sidebar header — file + locale selectors */}
        <div className="px-3 pt-2.5 pb-2 border-b border-app-border shrink-0 space-y-1.5">
          {/* File selector */}
          {sourceFiles.length > 1 ? (
            <select
              value={sourceFile?.relativePath ?? ""}
              onChange={(e) => handleFileChange(e.target.value)}
              disabled={isLoading}
              className="w-full bg-app-base border border-app-border rounded px-2 py-1 text-app-text text-xs font-mono focus:outline-none focus:border-app-accent transition-colors disabled:opacity-50"
            >
              {sourceFiles.map((f) => (
                <option key={f.relativePath} value={f.relativePath}>
                  {f.relativePath.split("/").pop()}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-app-muted text-xs font-mono truncate">
              {sourceFile?.relativePath.split("/").pop() ?? "—"}
            </div>
          )}

          {/* Target locale selector — only shown when there are multiple choices */}
          {targetLocales.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-app-muted text-xs shrink-0">→</span>
              <select
                value={targetLocale ?? ""}
                onChange={(e) => handleLocaleChange(e.target.value)}
                disabled={isLoading}
                className="flex-1 bg-app-base border border-app-border rounded px-2 py-1 text-app-text text-xs focus:outline-none focus:border-app-accent transition-colors disabled:opacity-50"
              >
                {targetLocale && !targetLocales.includes(targetLocale) && (
                  <option value={targetLocale}>{targetLocale}</option>
                )}
                {targetLocales.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              {prLoading && (
                <span className="text-app-muted text-xs animate-pulse shrink-0">
                  {t.editor.loadingPRs}
                </span>
              )}
            </div>
          )}

          {isLoading && (
            <div className="text-app-muted text-xs animate-pulse">
              {t.editor.switching}
            </div>
          )}
        </div>

        {/* Key list */}
        <div className="flex-1 min-h-0">
          <KeyList />
        </div>

        {/* Submit PR footer */}
        <div className="p-3 border-t border-app-border shrink-0">
          {prModal.url ? (
            <div className="text-center">
              <p className="text-key-green text-xs mb-1">
                {t.editor.prCreated}
              </p>
              <button
                onClick={() => openExternal(prModal.url!)}
                className="text-app-accent text-xs hover:underline"
              >
                {t.editor.viewOnGitHub}
              </button>
            </div>
          ) : repoInfo && currentUser ? (
            <button
              onClick={() => setPrModal((s) => ({ ...s, show: true }))}
              disabled={translatedCount === 0}
              className="w-full bg-key-green/90 hover:bg-key-green disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-semibold py-2 px-3 rounded-md transition-colors"
            >
              {t.editor.submitPR}
            </button>
          ) : (
            <p className="text-app-muted text-xs text-center">
              {t.editor.noRemoteLocal}
            </p>
          )}
        </div>
      </aside>

      {/* Resize handle — 8px hit area, 1px visual */}
      <div
        onMouseDown={handleResizeStart}
        className="w-2 shrink-0 cursor-col-resize group relative"
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-px w-px bg-app-border group-hover:bg-app-accent transition-colors" />
      </div>

      {/* Main editor */}
      <main className="flex-1 min-w-0 bg-app-base">
        <TranslationEditor />
      </main>

      {/* Shortcut hint bar */}
      <ShortcutBar />

      {/* PR confirmation modal */}
      {prModal.show && (
        <AppModal
          onClose={() => {
            if (!prModal.submitting)
              setPrModal((s) => ({ ...s, show: false, error: null }));
          }}
        >
          <div className="w-full max-w-sm bg-app-surface border border-app-border rounded-xl shadow-2xl p-5">
            <h2 className="text-app-text font-semibold text-sm mb-4">
              {t.editor.confirmPR}
            </h2>

            <div className="space-y-3 mb-5">
              <div>
                <p className="text-app-muted text-xs uppercase tracking-wider mb-1">
                  {t.editor.confirmPRBranch}
                </p>
                <p className="text-app-text font-mono text-xs bg-app-base rounded px-2 py-1.5 break-all">
                  {sourceFile && targetLocale
                    ? buildBranchName(targetLocale, sourceFile.relativePath)
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-app-text text-sm font-medium">
                  {interp(t.editor.keysTranslated, {
                    translated: translatedCount,
                    total: totalCount,
                  })}
                </p>
                <p className="text-app-muted text-xs mt-1">
                  {t.editor.confirmPRBody}
                </p>
              </div>
              <div>
                <p className="text-app-muted text-xs uppercase tracking-wider mb-1">
                  {t.editor.confirmPRNote}
                </p>
                <textarea
                  value={prModal.userNote}
                  onChange={(e) =>
                    setPrModal((s) => ({ ...s, userNote: e.target.value }))
                  }
                  placeholder={t.editor.confirmPRNotePlaceholder}
                  rows={3}
                  className="w-full bg-app-base border border-app-border rounded px-2 py-1.5 text-app-text placeholder-app-muted text-xs resize-none focus:outline-none focus:border-app-accent transition-colors"
                />
              </div>
            </div>

            {prModal.error && (
              <p className="text-key-red text-xs mb-3">{prModal.error}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() =>
                  setPrModal((s) => ({ ...s, show: false, error: null }))
                }
                disabled={prModal.submitting}
                className="px-4 py-2 text-app-muted hover:text-app-text text-xs transition-colors disabled:opacity-50"
              >
                {t.editor.confirmPRCancel}
              </button>
              <button
                onClick={handleSubmitPR}
                disabled={prModal.submitting}
                className="px-4 py-2 bg-key-green/90 hover:bg-key-green disabled:opacity-40 text-black text-xs font-semibold rounded-md transition-colors"
              >
                {prModal.submitting
                  ? t.editor.creatingPR
                  : t.editor.confirmPRConfirm}
              </button>
            </div>
          </div>
        </AppModal>
      )}
    </div>
  );
}
