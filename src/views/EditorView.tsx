import { useState, useEffect } from "react";
import KeyList from "../components/sidebar/KeyList";
import TranslationEditor from "../components/editor/TranslationEditor";
import { useEditorStore } from "../stores/editorStore";
import { useRepoStore } from "../stores/repoStore";
import { useAuthStore } from "../stores/authStore";
import { usePRStore } from "../stores/prStore";
import { getTargetLocales } from "../lib/discovery";
import { useT, interp } from "../i18n";

export default function EditorView() {
  const { submitPR, keys, loadEditor, sourceFile, targetLocale, saveCurrentKey, saveAndNext, nextKey, prevKey } = useEditorStore();
  const { repoInfo, files, repoPath } = useRepoStore();
  const { isLoading: prLoading } = usePRStore();
  const currentUser = useAuthStore((s) => s.currentUser);
  const t = useT();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  // Global keyboard shortcuts — work anywhere in the editor, except search/select inputs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isTextField = tag === "INPUT" || tag === "SELECT";
      if (e.shiftKey && e.key === "ArrowDown" && !isTextField) {
        e.preventDefault();
        saveCurrentKey().then(() => nextKey());
      } else if (e.shiftKey && e.key === "ArrowUp" && !isTextField) {
        e.preventDefault();
        saveCurrentKey().then(() => prevKey());
      } else if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        saveAndNext();
      } else if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        saveCurrentKey();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [saveCurrentKey, saveAndNext, nextKey, prevKey]);

  const translatedCount = keys.filter((k) => k.editorTranslation).length;
  const totalCount = keys.length;

  // Source files = all files sharing the current source locale
  const sourceLocale = sourceFile?.locale ?? "en";
  const sourceFiles = files.filter((f) => f.locale === sourceLocale);
  const targetLocales = getTargetLocales(files, sourceLocale);

  const handleFileChange = async (relativePath: string) => {
    if (!targetLocale || !repoPath) return;
    const newFile = files.find((f) => f.relativePath === relativePath);
    if (!newFile || newFile.relativePath === sourceFile?.relativePath) return;
    setIsSwitching(true);
    try {
      await loadEditor(newFile, targetLocale, currentUser, repoPath);
    } finally {
      setIsSwitching(false);
    }
  };

  const handleLocaleChange = async (newLocale: string) => {
    if (!sourceFile || !repoPath) return;
    if (newLocale === targetLocale) return;
    setIsSwitching(true);
    try {
      await loadEditor(sourceFile, newLocale, currentUser, repoPath);
    } finally {
      setIsSwitching(false);
    }
  };

  const handleSubmitPR = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const url = await submitPR();
      setPrUrl(url);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to create PR");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-72 bg-app-surface border-r border-app-border flex flex-col shrink-0">
        {/* Sidebar header — file + locale selectors */}
        <div className="px-3 pt-2.5 pb-2 border-b border-app-border shrink-0 space-y-1.5">
          {/* File selector */}
          {sourceFiles.length > 1 ? (
            <select
              value={sourceFile?.relativePath ?? ""}
              onChange={(e) => handleFileChange(e.target.value)}
              disabled={isSwitching}
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
                disabled={isSwitching}
                className="flex-1 bg-app-base border border-app-border rounded px-2 py-1 text-app-text text-xs focus:outline-none focus:border-app-accent transition-colors disabled:opacity-50"
              >
                {targetLocale && !targetLocales.includes(targetLocale) && (
                  <option value={targetLocale}>{targetLocale}</option>
                )}
                {targetLocales.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              {prLoading && (
                <span className="text-app-muted text-xs animate-pulse shrink-0">{t.editor.loadingPRs}</span>
              )}
            </div>
          )}

          {isSwitching && (
            <div className="text-app-muted text-xs animate-pulse">{t.editor.switching}</div>
          )}
        </div>

        {/* Key list */}
        <div className="flex-1 min-h-0">
          <KeyList />
        </div>

        {/* Submit PR footer */}
        <div className="p-3 border-t border-app-border shrink-0">
          {prUrl ? (
            <div className="text-center">
              <p className="text-key-green text-xs mb-1">{t.editor.prCreated}</p>
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-app-accent text-xs hover:underline"
              >
                {t.editor.viewOnGitHub}
              </a>
            </div>
          ) : (
            <>
              <div className="text-app-muted text-xs mb-2 text-center">
                {interp(t.editor.keysTranslated, { translated: translatedCount, total: totalCount })}
              </div>
              {submitError && (
                <p className="text-key-red text-xs mb-2">{submitError}</p>
              )}
              {repoInfo && currentUser ? (
                <button
                  onClick={handleSubmitPR}
                  disabled={isSubmitting || translatedCount === 0}
                  className="w-full bg-key-green/90 hover:bg-key-green disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-semibold py-2 px-3 rounded-md transition-colors"
                >
                  {isSubmitting ? t.editor.creatingPR : t.editor.submitPR}
                </button>
              ) : (
                <p className="text-app-muted text-xs text-center">
                  {t.editor.noRemoteLocal}
                </p>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Main editor */}
      <main className="flex-1 min-w-0 bg-app-base">
        <TranslationEditor />
      </main>
    </div>
  );
}
