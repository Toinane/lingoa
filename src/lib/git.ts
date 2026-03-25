import { tauriGit } from "./tauri";

export async function getRemoteUrl(repoPath: string): Promise<string | null> {
  return tauriGit.getRemoteUrl(repoPath);
}

export function parseGithubUrl(
  url: string
): { owner: string; repo: string } | null {
  // Also handles SSH aliases like git@github.com-work:owner/repo.git
  const match = url.match(/github\.com[^/:]*[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/);
  return match ? { owner: match[1], repo: match[2] } : null;
}

export function encodePathForBranch(filePath: string): string {
  // Two-pass percent-encoding: encode '%' first to avoid double-encoding,
  // then encode '/' which is the only character invalid in a branch segment.
  // This is bijective and collision-free regardless of '--' in the file path.
  return filePath.replace(/%/g, "%25").replace(/\//g, "%2F");
}

export function buildBranchName(locale: string, filePath: string): string {
  return `translate/${locale}/${encodePathForBranch(filePath)}`;
}

export function decodePathFromBranch(encoded: string): string {
  // Reverse order: decode path separators first, then literal percent signs.
  return encoded.replace(/%2F/gi, "/").replace(/%25/gi, "%");
}

/**
 * Idempotent branch-and-push: creates the branch if it doesn't exist, or
 * switches to it if it does (amendment flow). Always force-pushes with lease
 * so subsequent "submit PR" calls after more edits work correctly.
 * Ignores "nothing to commit" so the push still runs even when the diff is empty.
 */
export async function ensureBranchAndPush(
  repoPath: string,
  branchName: string,
  relativeFilePath: string,
  commitMessage: string
): Promise<void> {
  const exists = await tauriGit.branchExists(repoPath, branchName);
  if (exists) {
    await tauriGit.checkout(repoPath, branchName);
  } else {
    await tauriGit.checkoutNewBranch(repoPath, branchName);
  }
  await tauriGit.addFile(repoPath, relativeFilePath);
  try {
    await tauriGit.commit(repoPath, commitMessage);
  } catch (e) {
    // "nothing to commit" is expected when re-submitting unchanged content.
    // Any other error is a real failure.
    if (!String(e).toLowerCase().includes("nothing to commit")) throw e;
  }
  await tauriGit.pushBranchForce(repoPath, branchName);
}

/**
 * Derive the target locale file path from a source file path.
 *
 * Strategy (in order of precedence):
 * 1. Replace the locale code inside the filename (e.g. messages.en.json → messages.fr.json).
 * 2. Replace the nearest directory component that matches the locale exactly
 *    (e.g. src/locales/en/common.json → src/locales/fr/common.json).
 *
 * This component-based approach is more predictable than a single regex replacement:
 * the replacement point is explicit and it handles the case where the same locale
 * code appears in both a directory name and the filename without ambiguity.
 */
export function deriveTargetPath(
  sourcePath: string,
  sourceLocale: string,
  targetLocale: string
): string {
  const parts = sourcePath.split("/");

  // 1. Try filename substitution first
  const filename = parts[parts.length - 1];
  const newFilename = replaceLocaleInSegment(filename, sourceLocale, targetLocale);
  if (newFilename !== filename) {
    return [...parts.slice(0, -1), newFilename].join("/");
  }

  // 2. Walk inward from the deepest directory — prefer the nearest locale component
  for (let i = parts.length - 2; i >= 0; i--) {
    if (parts[i] === sourceLocale) {
      return [...parts.slice(0, i), targetLocale, ...parts.slice(i + 1)].join("/");
    }
  }

  // No substitution found — return the source path unchanged.
  // The caller is responsible for surfacing this to the user.
  return sourcePath;
}

/** Replace a locale boundary within a single path segment (filename or directory). */
function replaceLocaleInSegment(
  segment: string,
  sourceLocale: string,
  targetLocale: string
): string {
  const escaped = sourceLocale.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return segment.replace(
    new RegExp(`(^|[._-])${escaped}([._-]|$)`),
    `$1${targetLocale}$2`
  );
}
