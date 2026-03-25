import { create } from "zustand";
import type { PRIndex, TranslationPR } from "../types";
import { fetchTranslationPRs } from "../lib/github";

/** Re-use cached PR data if the same repo was fetched less than this many ms ago. */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface PRState {
  index: PRIndex;
  openPRs: TranslationPR[];
  isLoading: boolean;
  error: string | null;
  lastFetchedRepo: string | null;
  lastFetchedAt: number | null;
  reviewedPRs: Set<number>;

  /** Fetch PRs for the given repo. Skips the network if fresh cached data exists.
   *  Pass `force = true` to bypass the cache (e.g. manual refresh). */
  fetchPRs: (owner: string, repo: string, force?: boolean) => Promise<void>;
  getProposals: (locale: string, key: string) => PRIndex[string][string];
  markReviewed: (prNumber: number) => void;
}

export const usePRStore = create<PRState>((set, get) => ({
  index: {},
  openPRs: [],
  isLoading: false,
  error: null,
  lastFetchedRepo: null,
  lastFetchedAt: null,
  reviewedPRs: new Set<number>(),

  fetchPRs: async (owner, repo, force = false) => {
    const repoKey = `${owner}/${repo}`;
    const { lastFetchedRepo, lastFetchedAt } = get();
    if (
      !force &&
      lastFetchedRepo === repoKey &&
      lastFetchedAt !== null &&
      Date.now() - lastFetchedAt < CACHE_TTL_MS
    ) {
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const { prs, index } = await fetchTranslationPRs(owner, repo);
      set({
        openPRs: prs,
        index,
        isLoading: false,
        lastFetchedRepo: repoKey,
        lastFetchedAt: Date.now(),
      });
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : "Failed to fetch PRs",
      });
    }
  },

  getProposals: (locale, key) => get().index[locale]?.[key] ?? [],

  markReviewed: (prNumber) =>
    set((s) => ({ reviewedPRs: new Set([...s.reviewedPRs, prNumber]) })),
}));
