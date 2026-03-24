import { create } from "zustand";
import { open } from "@tauri-apps/plugin-dialog";
import type { RepoInfo, TranslationFile, RecentRepo } from "../types";
import { tauriFs, tauriGit } from "../lib/tauri";
import { parseGithubUrl } from "../lib/git";
import { discoverI18nFiles, detectSourceFile, detectLocaleFromPath } from "../lib/discovery";
import { parseJsonFlat } from "../lib/parsers/json";
import { parseYaml } from "../lib/parsers/yaml";

const RECENT_REPOS_KEY = "lingoa:recent-repos";
const MAX_RECENT = 8;

interface RepoState {
  repoPath: string | null;
  repoInfo: RepoInfo | null;
  files: TranslationFile[];
  sourceFile: TranslationFile | null;
  recentRepos: RecentRepo[];
  isScanning: boolean;
  error: string | null;

  openFolder: () => Promise<void>;
  openPath: (path: string) => Promise<void>;
  addManualFiles: () => Promise<void>;
  setRepoInfo: (info: Partial<RepoInfo>) => void;
  setSourceFile: (file: TranslationFile) => void;
  loadRecentRepos: () => void;
  removeRecentRepo: (localPath: string) => void;
  /** Register a new target file that was created during translation (not on disk yet). */
  registerTargetFile: (file: TranslationFile) => void;
}

async function countKeys(f: TranslationFile): Promise<TranslationFile> {
  try {
    const content = await tauriFs.readFile(f.absolutePath);
    const keys = /\.ya?ml$/i.test(f.relativePath)
      ? parseYaml(content)
      : parseJsonFlat(content);
    return { ...f, keyCount: Object.keys(keys).length };
  } catch {
    return f;
  }
}

/** Process files in small batches, yielding to the event loop between each batch. */
const BATCH_SIZE = 5;
async function countKeysBatched(
  files: TranslationFile[],
  onBatch: (counted: TranslationFile[]) => void
): Promise<void> {
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const counted = await Promise.all(files.slice(i, i + BATCH_SIZE).map(countKeys));
    onBatch(counted);
    // Yield to the browser's event loop so the UI stays responsive
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

export const useRepoStore = create<RepoState>((set, get) => ({
  repoPath: null,
  repoInfo: null,
  files: [],
  sourceFile: null,
  recentRepos: [],
  isScanning: false,
  error: null,

  openFolder: async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open Repository Folder",
    });
    if (!selected || typeof selected !== "string") return;
    await get().openPath(selected);
  },

  openPath: async (repoPath) => {
    set({ isScanning: true, error: null, repoPath, files: [], sourceFile: null, repoInfo: null });
    try {
      // 1. Detect git remote (fast)
      let repoInfo: RepoInfo | null = null;
      try {
        const remoteUrl = await tauriGit.run(["remote", "get-url", "origin"], repoPath);
        const parsed = parseGithubUrl(remoteUrl);
        if (parsed) repoInfo = { ...parsed, localPath: repoPath, isForked: false };
      } catch { /* no git remote */ }

      // 2. List all files + discover i18n files
      const relativePaths = await tauriFs.listFiles(repoPath);
      const files = discoverI18nFiles(relativePaths, repoPath);
      const sourceFile = detectSourceFile(files);

      // ── Unblock the UI immediately — show files without key counts ──
      set({ repoInfo, files, sourceFile, isScanning: false });

      // Save to recent repos
      if (repoInfo) {
        const recent: RecentRepo = {
          localPath: repoPath,
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          lastOpenedAt: new Date().toISOString(),
        };
        const existing: RecentRepo[] = JSON.parse(localStorage.getItem(RECENT_REPOS_KEY) ?? "[]");
        const updated = [recent, ...existing.filter((r) => r.localPath !== repoPath)].slice(0, MAX_RECENT);
        localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(updated));
        set({ recentRepos: updated });
      }

      // 3. Count keys in batches — updates the store incrementally, UI stays responsive
      await countKeysBatched(files, (batch) => {
        set((s) => {
          const updated = s.files.map(
            (f) => batch.find((b) => b.absolutePath === f.absolutePath) ?? f
          );
          return { files: updated, sourceFile: detectSourceFile(updated) };
        });
      });

    } catch (e) {
      set({ isScanning: false, error: e instanceof Error ? e.message : "Failed to open folder" });
    }
  },

  addManualFiles: async () => {
    const { repoPath } = get();
    const selected = await open({
      multiple: true,
      title: "Select i18n files",
      filters: [{ name: "i18n files", extensions: ["json", "yaml", "yml"] }],
      defaultPath: repoPath ?? undefined,
    });
    if (!selected) return;

    const paths: string[] = Array.isArray(selected) ? selected : [selected];
    const newFiles: TranslationFile[] = [];

    for (const absPath of paths) {
      const normalized = absPath.replace(/\\/g, "/");
      // Derive relative path from repo root if available
      const relPath = repoPath
        ? normalized.replace(repoPath.replace(/\\/g, "/") + "/", "")
        : normalized.split("/").pop()!;

      const locale = detectLocaleFromPath(relPath) ?? detectLocaleFromPath(normalized) ?? "unknown";

      newFiles.push({ absolutePath: normalized, relativePath: relPath, locale, keyCount: 0 });
    }

    // Merge with existing, skip duplicates
    const existing = get().files;
    const merged = [
      ...existing,
      ...newFiles.filter((nf) => !existing.some((e) => e.absolutePath === nf.absolutePath)),
    ];
    const sourceFile = detectSourceFile(merged);
    set({ files: merged, sourceFile });

    // Count keys for new files in batches
    await countKeysBatched(newFiles, (batch) => {
      set((s) => {
        const updated = s.files.map(
          (f) => batch.find((b) => b.absolutePath === f.absolutePath) ?? f
        );
        return { files: updated, sourceFile: detectSourceFile(updated) };
      });
    });
  },

  setRepoInfo: (info) =>
    set((s) => ({ repoInfo: s.repoInfo ? { ...s.repoInfo, ...info } : null })),

  setSourceFile: (file) => set({ sourceFile: file }),

  loadRecentRepos: () => {
    try {
      const stored = localStorage.getItem(RECENT_REPOS_KEY);
      if (stored) set({ recentRepos: JSON.parse(stored) as RecentRepo[] });
    } catch { /* ignore */ }
  },

  removeRecentRepo: (localPath) => {
    const updated = get().recentRepos.filter((r) => r.localPath !== localPath);
    localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(updated));
    set({ recentRepos: updated });
  },

  registerTargetFile: (file) => {
    const already = get().files.some((f) => f.relativePath === file.relativePath);
    if (!already) set({ files: [...get().files, file] });
  },
}));
