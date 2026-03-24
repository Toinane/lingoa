import { useState } from "react";
import { useAppStore } from "../stores/appStore";
import { useRepoStore } from "../stores/repoStore";
import { useEditorStore } from "../stores/editorStore";
import { useAuthStore } from "../stores/authStore";
import { usePRStore } from "../stores/prStore";
import { getTargetLocales } from "../lib/discovery";
import { useT, interp } from "../i18n";
import type { TranslationFile } from "../types";

const COMMON_LOCALES: Record<string, string> = {
  fr: "French", de: "German", es: "Spanish", it: "Italian",
  pt: "Portuguese", ja: "Japanese", ko: "Korean", zh: "Chinese",
  ru: "Russian", ar: "Arabic", nl: "Dutch", pl: "Polish",
  sv: "Swedish", "pt-BR": "Portuguese (BR)", "zh-CN": "Chinese (Simplified)",
};

function localeName(code: string) {
  return COMMON_LOCALES[code] ?? code;
}

export default function HomeView() {
  const setView = useAppStore((s) => s.setView);
  const {
    repoPath, repoInfo, files, sourceFile,
    setSourceFile, openFolder, addManualFiles,
    isScanning, recentRepos, openPath, removeRecentRepo,
  } = useRepoStore();
  const { loadEditor } = useEditorStore();
  const { fetchPRs } = usePRStore();
  const currentUser = useAuthStore((s) => s.currentUser);
  const t = useT();

  const [targetLocale, setTargetLocale] = useState("");
  const [customLocale, setCustomLocale] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetLocales = files.length > 0
    ? getTargetLocales(files, sourceFile?.locale ?? "en")
    : [];

  const finalTarget = targetLocale === "__custom" ? customLocale : targetLocale;

  const handleStart = async () => {
    if (!sourceFile || !finalTarget || !repoPath) return;
    setIsStarting(true);
    setError(null);
    try {
      if (repoInfo) {
        try {
          await fetchPRs(
            repoInfo.upstreamOwner ?? repoInfo.owner,
            repoInfo.upstreamRepo ?? repoInfo.repo
          );
        } catch { /* continue without proposals */ }
      }
      await loadEditor(sourceFile, finalTarget, currentUser, repoPath);
      setView("editor");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start");
    } finally {
      setIsStarting(false);
    }
  };

  // ── No folder loaded ──────────────────────────────────────────────────────
  if (!repoPath) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-full max-w-lg px-8">
          <button
            onClick={openFolder}
            disabled={isScanning}
            className="w-full border-2 border-dashed border-app-border hover:border-app-accent rounded-lg py-12 flex flex-col items-center gap-3 transition-colors group"
          >
            <svg className="w-8 h-8 text-app-muted group-hover:text-app-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
            <span className="text-app-text font-medium">{t.home.openFolder}</span>
            <span className="text-app-muted text-sm">{t.home.openFolderHint}</span>
          </button>

          {recentRepos.length > 0 && (
            <div className="mt-8">
              <h3 className="text-app-muted text-xs uppercase tracking-wider mb-3">{t.home.recent}</h3>
              <div className="space-y-1">
                {recentRepos.map((r) => (
                  <div key={r.localPath} className="flex items-center gap-1">
                    <button
                      onClick={() => openPath(r.localPath)}
                      className="flex-1 flex items-center gap-3 px-3 py-2.5 bg-app-surface hover:bg-app-surface-2 border border-app-border rounded-md text-left transition-colors min-w-0"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-app-text text-sm font-medium">{r.owner}/{r.repo}</div>
                        <div className="text-app-muted text-xs truncate font-mono">{r.localPath}</div>
                      </div>
                      <svg className="w-4 h-4 text-app-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => removeRecentRepo(r.localPath)}
                      className="p-1.5 text-app-muted hover:text-key-red transition-colors shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isScanning) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-app-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-app-muted text-sm">{t.home.scanningRepo}</p>
          <p className="text-app-muted text-xs font-mono truncate max-w-xs">{repoPath}</p>
        </div>
      </div>
    );
  }

  // ── Repo loaded ───────────────────────────────────────────────────────────
  const groupedByLocale: Record<string, TranslationFile[]> = {};
  for (const f of files) {
    if (!groupedByLocale[f.locale]) groupedByLocale[f.locale] = [];
    groupedByLocale[f.locale].push(f);
  }

  return (
    <div className="flex items-start justify-center h-full overflow-y-auto py-10">
      <div className="w-full max-w-2xl px-8">

        {/* Repo header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-app-text font-semibold text-lg">
              {repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : repoPath}
            </h2>
            <p className="text-app-muted text-sm font-mono">{repoPath}</p>
          </div>
          <button onClick={openFolder} className="text-app-muted hover:text-app-text text-xs transition-colors">
            {t.home.changeFolder}
          </button>
        </div>

        {!repoInfo && (
          <div className="mb-4 text-key-yellow text-xs bg-key-yellow/10 border border-key-yellow/20 rounded-md px-3 py-2">
            {t.home.noRemoteWarning}
          </div>
        )}

        {repoInfo && <ForkOverride />}

        {/* Detected files */}
        <div className="bg-app-surface border border-app-border rounded-lg p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-app-muted text-xs uppercase tracking-wider">
              {t.home.i18nFiles} {files.length > 0 ? `(${files.length})` : ""}
            </h3>
            <button
              onClick={addManualFiles}
              className="text-app-accent hover:text-app-accent-hover text-xs transition-colors"
            >
              {t.home.addManually}
            </button>
          </div>

          {files.length === 0 ? (
            <div className="space-y-3">
              <p className="text-app-muted text-sm">{t.home.noFilesFound}</p>
              <p className="text-app-muted text-xs">
                {t.home.noFilesPatterns}{" "}
                <code className="text-app-text">src/i18n/en.json</code>,{" "}
                <code className="text-app-text">locales/fr.yaml</code>, etc.
              </p>
            </div>
          ) : (
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {Object.entries(groupedByLocale).map(([locale, locFiles]) => (
                <div key={locale}>
                  {locFiles.map((f, i) => (
                    <div key={f.relativePath} className="flex items-center gap-2 text-sm">
                      <span className="text-app-muted font-mono w-14 shrink-0">
                        {i === 0 ? locale : ""}
                      </span>
                      <span className="text-app-text font-mono truncate flex-1 text-xs">
                        {f.relativePath}
                      </span>
                      <span className="text-app-muted text-xs shrink-0">
                        {f.keyCount > 0 ? interp(t.home.keys, { n: f.keyCount }) : t.home.countingKeys}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {files.length > 0 && (
          <>
            {/* Source locale */}
            <div className="mb-4">
              <label className="block text-app-muted text-xs uppercase tracking-wider mb-1.5">
                {t.home.translateFrom}
              </label>
              <select
                value={sourceFile?.locale ?? ""}
                onChange={(e) => {
                  const f = files.find((x) => x.locale === e.target.value);
                  if (f) setSourceFile(f);
                }}
                className="w-full bg-app-surface border border-app-border rounded-md px-3 py-2 text-app-text text-sm focus:outline-none focus:border-app-accent transition-colors"
              >
                {[...new Set(files.map((f) => f.locale))].map((locale) => (
                  <option key={locale} value={locale}>
                    {localeName(locale)} ({locale}) — {files.find((f) => f.locale === locale)?.keyCount ?? 0} keys
                  </option>
                ))}
              </select>
            </div>

            {/* Target locale */}
            <div className="mb-6">
              <label className="block text-app-muted text-xs uppercase tracking-wider mb-1.5">
                {t.home.translateTo}
              </label>
              <select
                value={targetLocale}
                onChange={(e) => setTargetLocale(e.target.value)}
                className="w-full bg-app-surface border border-app-border rounded-md px-3 py-2 text-app-text text-sm focus:outline-none focus:border-app-accent transition-colors"
              >
                <option value="">{t.home.selectTarget}</option>
                {targetLocales.map((locale) => (
                  <option key={locale} value={locale}>
                    {localeName(locale)} ({locale})
                  </option>
                ))}
                <option value="__custom">{t.home.newLocale}</option>
              </select>

              {targetLocale === "__custom" && (
                <input
                  type="text"
                  value={customLocale}
                  onChange={(e) => setCustomLocale(e.target.value)}
                  placeholder={t.home.newLocalePlaceholder}
                  className="mt-2 w-full bg-app-surface border border-app-border rounded-md px-3 py-2 text-app-text placeholder-app-muted font-mono text-sm focus:outline-none focus:border-app-accent transition-colors"
                  autoFocus
                />
              )}
            </div>

            {error && (
              <div className="mb-4 text-key-red text-sm bg-key-red/10 border border-key-red/20 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <button
              onClick={handleStart}
              disabled={!finalTarget || isStarting || !sourceFile}
              className="w-full bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 px-4 rounded-md transition-colors"
            >
              {isStarting ? t.home.starting : t.home.startTranslating}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ForkOverride() {
  const { repoInfo, setRepoInfo } = useRepoStore();
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  if (!editing) {
    return (
      <div className="mb-4 flex items-center gap-2 text-xs text-app-muted">
        <span>{t.home.prsTarget}</span>
        <span className="text-app-text font-mono">
          {repoInfo?.upstreamOwner
            ? `${repoInfo.upstreamOwner}/${repoInfo.upstreamRepo}`
            : `${repoInfo?.owner}/${repoInfo?.repo}`}
        </span>
        <button onClick={() => setEditing(true)} className="text-app-accent hover:underline">
          {t.home.change}
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t.home.upstreamPlaceholder}
        className="flex-1 bg-app-surface border border-app-border rounded-md px-2 py-1 text-app-text font-mono text-xs focus:outline-none focus:border-app-accent"
        autoFocus
      />
      <button
        onClick={() => {
          const [owner, repo] = value.split("/");
          if (owner && repo) setRepoInfo({ upstreamOwner: owner, upstreamRepo: repo, isForked: true });
          setEditing(false);
        }}
        className="text-xs text-app-accent hover:underline"
      >
        {t.home.set}
      </button>
    </div>
  );
}
