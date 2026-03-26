import { tauriGitHub, type PRReviewFile, type ReviewComment } from "./tauri";
import type { PRIndex, TranslationPR } from "../types";

export async function fetchCurrentUser(): Promise<string> {
  return tauriGitHub.getUser();
}

export async function detectFork(
  owner: string,
  repo: string,
): Promise<{ upstreamOwner: string; upstreamRepo: string } | null> {
  return tauriGitHub.detectFork(owner, repo);
}

export async function fetchTranslationPRs(
  owner: string,
  repo: string,
): Promise<{ prs: TranslationPR[]; index: PRIndex }> {
  return tauriGitHub.listTranslationPRs(owner, repo);
}

export async function createPR(
  owner: string,
  repo: string,
  title: string,
  headOwner: string,
  branch: string,
  body: string,
): Promise<string> {
  return tauriGitHub.createPR(owner, repo, title, headOwner, branch, body);
}

export async function submitReview(
  owner: string,
  repo: string,
  prNumber: number,
  commitId: string,
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  body: string,
  comments: ReviewComment[],
): Promise<void> {
  return tauriGitHub.submitReview(
    owner,
    repo,
    prNumber,
    commitId,
    event,
    body,
    comments,
  );
}

/** Fetch PR files and return pre-parsed key comparison rows (done in Rust). */
export async function fetchPRReviewData(
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string,
  baseBranch: string,
  sourcePath: string,
): Promise<PRReviewFile[]> {
  return tauriGitHub.fetchPRReviewData(
    owner,
    repo,
    prNumber,
    headSha,
    baseBranch,
    sourcePath,
  );
}
