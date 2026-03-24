import { tauriGit } from "./tauri";

export async function getRemoteUrl(repoPath: string): Promise<string | null> {
  try {
    return await tauriGit.run(["remote", "get-url", "origin"], repoPath);
  } catch {
    return null;
  }
}

export function parseGithubUrl(
  url: string
): { owner: string; repo: string } | null {
  // Also handles SSH aliases like git@github.com-work:owner/repo.git
  const match = url.match(/github\.com[^/:]*[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/);
  return match ? { owner: match[1], repo: match[2] } : null;
}

export async function getCurrentBranch(repoPath: string): Promise<string> {
  return tauriGit.run(["rev-parse", "--abbrev-ref", "HEAD"], repoPath);
}

export function encodePathForBranch(filePath: string): string {
  return filePath.replace(/\//g, "--");
}

export function buildBranchName(locale: string, filePath: string): string {
  return `translate/${locale}/${encodePathForBranch(filePath)}`;
}

export function decodePathFromBranch(encoded: string): string {
  return encoded.replace(/--/g, "/");
}

/** Create a branch, stage a file, commit, and push to origin. */
export async function createBranchAndPush(
  repoPath: string,
  branchName: string,
  relativeFilePath: string,
  commitMessage: string
): Promise<void> {
  await tauriGit.run(["checkout", "-b", branchName], repoPath);
  await tauriGit.run(["add", relativeFilePath], repoPath);
  await tauriGit.run(["commit", "-m", commitMessage], repoPath);
  await tauriGit.run(["push", "origin", branchName], repoPath);
}

/** Derive the target locale file path from a source file path. */
export function deriveTargetPath(
  sourcePath: string,
  sourceLocale: string,
  targetLocale: string
): string {
  // Replace the locale segment (surrounded by path separators, dots, or string boundaries)
  const escaped = sourceLocale.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return sourcePath.replace(
    new RegExp(`(^|[/._-])${escaped}($|[/._-])`),
    `$1${targetLocale}$2`
  );
}
