import { invoke } from "@tauri-apps/api/core";
import type { TranslationPR, PRIndex, TranslationValue } from "../types";

// ─── Shared types ─────────────────────────────────────────────────────────────

export type { TranslationValue };

export interface KeyRow {
  key: string;
  /** Source language text (e.g. English). */
  source: string;
  /** Previous translation from base branch. null when file is new or key didn't exist. */
  previous: string | null;
  /** New translation introduced by this PR. */
  translated: string;
  /** 1-indexed line in the translated file; 0 = not located. */
  line: number;
  /** Raw content of that line (for pre-populating suggestions). Empty when line=0. */
  rawLine: string;
  /** File path — needed to post inline review comments. */
  path: string;
}

export interface ReviewComment {
  path: string;
  line: number;
  body: string;
}

export interface PRReviewFile {
  filename: string;
  /** True when the target file did not exist before this PR. */
  isNewFile: boolean;
  rows: KeyRow[];
}

// ─── Shell ───────────────────────────────────────────────────────────────────

/** Open a URL in the system default browser. */
export const openExternal = (url: string) => invoke<void>("open_url", { url });

// ─── Core FS ─────────────────────────────────────────────────────────────────

export const tauriFs = {
  /** Read a file under repoPath. relPath must be relative and within the repo. */
  readFile: (repoPath: string, relPath: string) =>
    invoke<string>("read_repo_file", { repoPath, relPath }),
  /** Write a file under repoPath. relPath must be relative and within the repo. */
  writeFile: (repoPath: string, relPath: string, content: string) =>
    invoke<void>("write_repo_file", { repoPath, relPath, content }),
};

// ─── Git ─────────────────────────────────────────────────────────────────────

export const tauriGit = {
  // ── Shell-based: typed write ops (need credential helpers / SSH agent) ──
  checkoutNewBranch: (repoPath: string, branch: string) =>
    invoke<string>("git_checkout_new_branch", { repoPath, branch }),
  /** Switch to an existing local branch. */
  checkout: (repoPath: string, branch: string) =>
    invoke<string>("git_checkout", { repoPath, branch }),
  /** Returns true if a local branch with this name already exists. */
  branchExists: (repoPath: string, branch: string) =>
    invoke<boolean>("git_branch_exists", { repoPath, branch }),
  addFile: (repoPath: string, relPath: string) =>
    invoke<string>("git_add_file", { repoPath, relPath }),
  commit: (repoPath: string, message: string) =>
    invoke<string>("git_commit", { repoPath, message }),
  pushBranch: (repoPath: string, branch: string) =>
    invoke<string>("git_push_branch", { repoPath, branch }),
  /** Force-push with lease — safe for amendment workflows. */
  pushBranchForce: (repoPath: string, branch: string) =>
    invoke<string>("git_push_branch_force", { repoPath, branch }),
  // ── git2-based: fast, no binary dependency ──────────────────────────────
  getRemoteUrl: (repoPath: string) =>
    invoke<string | null>("git_get_remote_url", { repoPath }),
  getUpstreamRemoteUrl: (repoPath: string) =>
    invoke<string | null>("git_get_upstream_remote_url", { repoPath }),
  showFileAtHead: (repoPath: string, relPath: string) =>
    invoke<string>("git_show_file_at_head", { repoPath, relPath }),
};

// ─── Keychain ────────────────────────────────────────────────────────────────

export const tauriKeychain = {
  store: (token: string) => invoke<void>("store_token", { token }),
  delete: () => invoke<void>("delete_token"),
  /** Returns true if a token is in the keychain — never returns the value itself. */
  isStored: () => invoke<boolean>("token_is_stored"),
};

// ─── Parsers ─────────────────────────────────────────────────────────────────

export const tauriParsers = {
  parse: (content: string, format: string) =>
    invoke<Record<string, TranslationValue>>("parse_translation_file", {
      content,
      format,
    }),
  serialize: (
    translations: Record<string, string>,
    source: Record<string, TranslationValue>,
    format: string,
  ) =>
    invoke<string>("serialize_translation_file", {
      translations,
      source,
      format,
    }),
  countKeys: (repoPath: string, relPath: string) =>
    invoke<number>("count_translation_keys", { repoPath, relPath }),
};

// ─── Discovery ───────────────────────────────────────────────────────────────

/** Raw shape returned by Rust — keyCount is added by the store after a separate count pass. */
export interface DiscoveredFile {
  absolutePath: string;
  relativePath: string;
  locale: string;
}

export const tauriDiscovery = {
  discover: (root: string) =>
    invoke<DiscoveredFile[]>("discover_i18n_files", { root }),
  /** Detect a locale code from a relative file path. Single source of truth — mirrors discovery.rs. */
  detectLocale: (relPath: string) =>
    invoke<string | null>("detect_locale", { relPath }),
};

// ─── GitHub ──────────────────────────────────────────────────────────────────

export const tauriGitHub = {
  /**
   * Validate a token explicitly (used only during token setup, before the token
   * is stored in the keychain). Returns the GitHub login on success.
   */
  validateToken: (token: string) =>
    invoke<string>("github_validate_token", { token }),
  /** Return the current user using the token stored in the OS keychain. */
  getUser: () => invoke<string>("github_get_user"),

  detectFork: (owner: string, repo: string) =>
    invoke<{ upstreamOwner: string; upstreamRepo: string } | null>(
      "github_detect_fork",
      { owner, repo },
    ),

  listTranslationPRs: (owner: string, repo: string) =>
    invoke<{ prs: TranslationPR[]; index: PRIndex }>(
      "github_list_translation_prs",
      { owner, repo },
    ),

  createPR: (
    owner: string,
    repo: string,
    title: string,
    headOwner: string,
    branch: string,
    body: string,
  ) =>
    invoke<string>("github_create_pr", {
      owner,
      repo,
      title,
      headOwner,
      branch,
      body,
    }),

  /** Find an open PR for a branch. Returns the PR URL, or null if none exists. */
  findPRForBranch: (
    owner: string,
    repo: string,
    headOwner: string,
    branch: string,
  ) =>
    invoke<string | null>("github_find_pr_for_branch", {
      owner,
      repo,
      headOwner,
      branch,
    }),

  submitReview: (
    owner: string,
    repo: string,
    prNumber: number,
    commitId: string,
    event: string,
    body: string,
    comments: ReviewComment[],
  ) =>
    invoke<void>("github_submit_review", {
      owner,
      repo,
      prNumber,
      commitId,
      event,
      body,
      comments,
    }),

  fetchPRReviewData: (
    owner: string,
    repo: string,
    prNumber: number,
    headSha: string,
    baseBranch: string,
    sourcePath: string,
  ) =>
    invoke<PRReviewFile[]>("github_fetch_pr_review_data", {
      owner,
      repo,
      prNumber,
      headSha,
      baseBranch,
      sourcePath,
    }),
};
