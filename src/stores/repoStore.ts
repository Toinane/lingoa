import { create } from "zustand";
import { open } from "@tauri-apps/plugin-dialog";
import type { RepoInfo, TranslationFile, RecentRepo } from "../types";
import { tauriDiscovery, tauriParsers, tauriGit, type DiscoveredFile } from "../lib/tauri";
import { parseGithubUrl } from "../lib/git";
import { detectFork } from "../lib/github";

const RECENT_REPOS_KEY = "lingoa:recent-repos";
const MAX_RECENT = 8;

interface RepoState {
  repoPath: string | null;
  repoInfo: RepoInfo | null;
  files: TranslationFile[];
  sourceFile: TranslationFile | null;
  recentRepos: RecentRepo[];
  isScanning: boolean;
  isDetectingFork: boolean;
  error: string | null;

  openFolder: () => Promise<void>;
  openPath: (path: string) => Promise<void>;
  addManualFiles: () => Promise<void>;
  setRepoInfo: (info: Partial<RepoInfo>) => void;
  setSourceFile: (file: TranslationFile) => void;
  loadRecentRepos: () => void;
  removeRecentRepo: (localPath: string) => void;
  registerTargetFile: (file: TranslationFile) => void;
}

/** Count keys for a single file via a single sandboxed Rust IPC call. */
async function countKeys(f: TranslationFile, repoPath: string): Promise<TranslationFile> {
  try {
    const keyCount = await tauriParsers.countKeys(repoPath, f.relativePath);
    return { ...f, keyCount };
  } catch {
    return f;
  }
}

/** Process files in small batches to keep the UI responsive between batches. */
const BATCH_SIZE = 5;
async function countKeysBatched(
  files: TranslationFile[],
  repoPath: string,
  onBatch: (counted: TranslationFile[]) => void
): Promise<void> {
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const counted = await Promise.all(
      files.slice(i, i + BATCH_SIZE).map((f) => countKeys(f, repoPath))
    );
    onBatch(counted);
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

function detectSourceFile(files: TranslationFile[]): TranslationFile | null {
  return (
    files.find((f) => f.locale === "en") ??
    files.find((f) => f.locale === "en-US") ??
    [...files].sort((a, b) => b.keyCount - a.keyCount)[0] ??
    null
  );
}

export const useRepoStore = create<RepoState>((set, get) => ({
  repoPath: null,
  repoInfo: null,
  files: [],
  sourceFile: null,
  recentRepos: [],
  isScanning: false,
  isDetectingFork: false,
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
    set({
      isScanning: true,
      isDetectingFork: false,
      error: null,
      repoPath,
      files: [],
      sourceFile: null,
      repoInfo: null,
    });
    let pendingForkDetection: Promise<void> | null = null;
    try {
      // 1. Detect git remote (fast, git2-based) + fork detection
      let repoInfo: RepoInfo | null = null;
      try {
        const remoteUrl = await tauriGit.getRemoteUrl(repoPath);
        if (remoteUrl) {
          const parsed = parseGithubUrl(remoteUrl);
          if (parsed) {
            repoInfo = { ...parsed, localPath: repoPath, isForked: false };

            // 1a. Check for an `upstream` git remote (fast path — fork with upstream configured)
            let forkDetected = false;
            try {
              const upstreamUrl = await tauriGit.getUpstreamRemoteUrl(repoPath);
              if (upstreamUrl) {
                const upstreamParsed = parseGithubUrl(upstreamUrl);
                if (upstreamParsed) {
                  repoInfo = {
                    ...repoInfo,
                    isForked: true,
                    upstreamOwner: upstreamParsed.owner,
                    upstreamRepo: upstreamParsed.repo,
                  };
                  forkDetected = true;
                }
              }
            } catch { /* no upstream remote */ }

            // 1b. Fallback: query GitHub API to detect fork (async, non-blocking)
            if (!forkDetected) {
              pendingForkDetection = detectFork(parsed.owner, parsed.repo)
                .then((forkInfo) => {
                  if (forkInfo) {
                    set((s) =>
                      s.repoInfo
                        ? {
                            isDetectingFork: false,
                            repoInfo: {
                              ...s.repoInfo,
                              isForked: true,
                              upstreamOwner: forkInfo.upstreamOwner,
                              upstreamRepo: forkInfo.upstreamRepo,
                            },
                          }
                        : { isDetectingFork: false }
                    );
                  } else {
                    set({ isDetectingFork: false });
                  }
                })
                .catch(() => { set({ isDetectingFork: false }); });
            }
          }
        }
      } catch { /* no git remote */ }

      // 2. Discover i18n files (Rust: walkdir + locale pattern matching)
      const files: TranslationFile[] = (await tauriDiscovery.discover(repoPath)).map(
        (f: DiscoveredFile) => ({ ...f, keyCount: 0 })
      );
      const sourceFile = detectSourceFile(files);

      // Unblock the UI — isDetectingFork stays true until fork API call resolves
      set({ repoInfo, files, sourceFile, isScanning: false, isDetectingFork: pendingForkDetection !== null });

      // Save to recent repos
      if (repoInfo) {
        const recent: RecentRepo = {
          localPath: repoPath,
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          lastOpenedAt: new Date().toISOString(),
        };
        const existing: RecentRepo[] = JSON.parse(
          localStorage.getItem(RECENT_REPOS_KEY) ?? "[]"
        );
        const updated = [
          recent,
          ...existing.filter((r) => r.localPath !== repoPath),
        ].slice(0, MAX_RECENT);
        localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(updated));
        set({ recentRepos: updated });
      }

      // 3. Count keys in batches (each call is a single Rust IPC: read + parse)
      await countKeysBatched(files, repoPath, (batch) => {
        set((s) => {
          const updated = s.files.map(
            (f) => batch.find((b) => b.absolutePath === f.absolutePath) ?? f
          );
          return { files: updated, sourceFile: detectSourceFile(updated) };
        });
      });
    } catch (e) {
      set({
        isScanning: false,
        error: e instanceof Error ? e.message : "Failed to open folder",
      });
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
    const normalizedRepo = repoPath ? repoPath.replace(/\\/g, "/") : null;
    const prefix = normalizedRepo ? normalizedRepo + "/" : null;
    const skipped: string[] = [];

    for (const absPath of paths) {
      const normalized = absPath.replace(/\\/g, "/");

      // Reject files outside the repo — their relative path would be meaningless
      // for all subsequent git and FS operations.
      if (!prefix || !normalized.startsWith(prefix)) {
        skipped.push(normalized.split("/").pop() ?? normalized);
        continue;
      }

      const relPath = normalized.slice(prefix.length);
      const locale = (await tauriDiscovery.detectLocale(relPath)) ?? "unknown";

      newFiles.push({
        absolutePath: normalized,
        relativePath: relPath,
        locale,
        keyCount: 0,
      });
    }

    if (skipped.length > 0) {
      set({ error: `Files outside the repository were skipped: ${skipped.join(", ")}` });
    }

    const existing = get().files;
    const merged = [
      ...existing,
      ...newFiles.filter(
        (nf) => !existing.some((e) => e.absolutePath === nf.absolutePath)
      ),
    ];
    set({ files: merged, sourceFile: detectSourceFile(merged) });

    await countKeysBatched(newFiles, repoPath!, (batch) => {
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
      if (!stored) return;
      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed)) throw new Error("unexpected shape");
      const valid = parsed.filter(
        (r): r is RecentRepo =>
          typeof r === "object" &&
          r !== null &&
          typeof (r as RecentRepo).localPath === "string" &&
          typeof (r as RecentRepo).owner === "string" &&
          typeof (r as RecentRepo).repo === "string" &&
          typeof (r as RecentRepo).lastOpenedAt === "string"
      );
      set({ recentRepos: valid });
    } catch {
      // Corrupt or schema-mismatched data — reset to avoid a broken state.
      localStorage.removeItem(RECENT_REPOS_KEY);
    }
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
