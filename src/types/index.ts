// ─── Key states ──────────────────────────────────────────────────────────────

/** Green = in HEAD, Yellow = own PR pending, Blue = other PR pending, Red = untranslated */
export type KeyState = "translated" | "own-pending" | "other-pending" | "untranslated";

// ─── Translation values ───────────────────────────────────────────────────────

/** Supports both flat `"key": "value"` and structured `"key": { text, context }` */
export interface TranslationValue {
  text: string;
  context?: string;
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

export interface TranslationKeyWithState {
  key: string;
  source: string;
  context?: string;
  /** Translation currently in the target locale file on disk (git HEAD) */
  headTranslation?: string;
  /** Working value in the editor (may differ from headTranslation) */
  editorTranslation: string;
  state: KeyState;
  proposals: PRProposal[];
}

// ─── PR index ─────────────────────────────────────────────────────────────────

export interface PRProposal {
  key: string;
  value: string;
  prNumber: number;
  prTitle: string;
  author: string;
  authorAvatarUrl: string;
  prUrl: string;
}

/** Nested map: locale → key → list of proposals from open PRs */
export type PRIndex = Record<string, Record<string, PRProposal[]>>;

// ─── Files ────────────────────────────────────────────────────────────────────

export interface TranslationFile {
  /** Absolute path on local disk */
  absolutePath: string;
  /** Relative path from repo root (forward slashes) */
  relativePath: string;
  locale: string;
  keyCount: number;
}

// ─── Repo ─────────────────────────────────────────────────────────────────────

export interface RepoInfo {
  owner: string;
  repo: string;
  localPath: string;
  /** True if local folder is a fork; use upstream for PR creation */
  isForked: boolean;
  upstreamOwner?: string;
  upstreamRepo?: string;
}

// ─── PRs ──────────────────────────────────────────────────────────────────────

export interface TranslationPR {
  number: number;
  title: string;
  author: string;
  authorAvatarUrl: string;
  branchName: string;
  locale: string;
  /** Encoded file path (-- separators) */
  encodedFilePath: string;
  url: string;
  isDraft: boolean;
  createdAt: string;
  headSha: string;
  baseBranch: string;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export type AppView = "loading" | "token-setup" | "home" | "editor" | "review";

export interface RecentRepo {
  localPath: string;
  owner: string;
  repo: string;
  lastOpenedAt: string;
}
