import { Octokit } from "@octokit/rest";
import type { PRIndex, PRProposal, TranslationPR } from "../types";
import { parseJsonFlat } from "./parsers/json";
import { parseYaml } from "./parsers/yaml";

const BRANCH_PREFIX = "translate/";

let _octokit: Octokit | null = null;

export function initGitHub(token: string): void {
  _octokit = new Octokit({ auth: token });
}

function octokit(): Octokit {
  if (!_octokit) throw new Error("GitHub client not initialized");
  return _octokit;
}

// ─── Current user ─────────────────────────────────────────────────────────────

export async function fetchCurrentUser(): Promise<string> {
  const { data } = await octokit().users.getAuthenticated();
  return data.login;
}

// ─── Translation PRs ──────────────────────────────────────────────────────────

/**
 * Batch-fetch all open translation PRs and build the in-memory key index.
 * Called once on repo load; no per-key API calls at runtime.
 */
export async function fetchTranslationPRs(
  owner: string,
  repo: string
): Promise<{ prs: TranslationPR[]; index: PRIndex }> {
  const { data: pulls } = await octokit().pulls.list({
    owner,
    repo,
    state: "open",
    per_page: 100,
  });

  const translationPulls = pulls.filter((pr) =>
    pr.head.ref.startsWith(BRANCH_PREFIX)
  );

  const prs: TranslationPR[] = [];
  const index: PRIndex = {};

  for (const pr of translationPulls) {
    // Branch: translate/{locale}/{encoded-path}
    const withoutPrefix = pr.head.ref.slice(BRANCH_PREFIX.length);
    const slashIdx = withoutPrefix.indexOf("/");
    if (slashIdx === -1) continue;

    const locale = withoutPrefix.slice(0, slashIdx);
    const encodedFilePath = withoutPrefix.slice(slashIdx + 1);

    prs.push({
      number: pr.number,
      title: pr.title,
      author: pr.user?.login ?? "unknown",
      authorAvatarUrl: pr.user?.avatar_url ?? "",
      branchName: pr.head.ref,
      locale,
      encodedFilePath,
      url: pr.html_url,
      isDraft: pr.draft ?? false,
      createdAt: pr.created_at,
      headSha: pr.head.sha,
      baseBranch: pr.base.ref,
    });

    // Fetch changed files and parse their content to build the key index
    try {
      const { data: files } = await octokit().pulls.listFiles({
        owner,
        repo,
        pull_number: pr.number,
      });

      for (const file of files) {
        if (!/\.(json|ya?ml)$/i.test(file.filename)) continue;

        const content = await fetchFileAtRef(
          owner,
          repo,
          file.filename,
          pr.head.sha
        );
        if (!content) continue;

        const parsed = file.filename.match(/\.ya?ml$/i)
          ? parseYaml(content)
          : parseJsonFlat(content);

        if (!index[locale]) index[locale] = {};

        for (const [key, value] of Object.entries(parsed)) {
          if (!index[locale][key]) index[locale][key] = [];

          const proposal: PRProposal = {
            key,
            value: value.text,
            prNumber: pr.number,
            prTitle: pr.title,
            author: pr.user?.login ?? "unknown",
            authorAvatarUrl: pr.user?.avatar_url ?? "",
            prUrl: pr.html_url,
          };

          // Avoid duplicates from the same PR
          if (!index[locale][key].some((p) => p.prNumber === pr.number)) {
            index[locale][key].push(proposal);
          }
        }
      }
    } catch {
      // Skip PRs we can't read (permissions, network, etc.)
    }
  }

  return { prs, index };
}

// ─── PR creation ──────────────────────────────────────────────────────────────

export async function createPR(
  owner: string,
  repo: string,
  title: string,
  branch: string,
  body: string,
  base = "main"
): Promise<string> {
  // Try to detect default branch if "main" doesn't exist
  let baseBranch = base;
  try {
    const { data: repoData } = await octokit().repos.get({ owner, repo });
    baseBranch = repoData.default_branch;
  } catch {
    // Use provided base
  }

  const { data } = await octokit().pulls.create({
    owner,
    repo,
    title,
    head: branch,
    base: baseBranch,
    body,
  });

  return data.html_url;
}

// ─── PR review ────────────────────────────────────────────────────────────────

export async function submitReview(
  owner: string,
  repo: string,
  prNumber: number,
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  body: string
): Promise<void> {
  await octokit().pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    event,
    body,
  });
}

/**
 * Fetch all files changed in a PR and their content at the PR's HEAD,
 * alongside the source (base) content. Used by the Review view.
 */
export async function fetchPRFiles(
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string,
  baseBranch: string
): Promise<
  Array<{
    filename: string;
    sourceContent: string | null;
    translatedContent: string | null;
  }>
> {
  const { data: files } = await octokit().pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
  });

  return Promise.all(
    files
      .filter((f) => /\.(json|ya?ml)$/i.test(f.filename))
      .map(async (f) => ({
        filename: f.filename,
        sourceContent: await fetchFileAtRef(owner, repo, f.filename, baseBranch),
        translatedContent: await fetchFileAtRef(owner, repo, f.filename, headSha),
      }))
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchFileAtRef(
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string | null> {
  try {
    const { data } = await octokit().repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(data) || data.type !== "file" || !data.content) return null;
    // Decode base64 content with proper UTF-8 support
    const bytes = Uint8Array.from(
      atob(data.content.replace(/\n/g, "")),
      (c) => c.charCodeAt(0)
    );
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
