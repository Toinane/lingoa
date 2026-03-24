import { create } from "zustand";
import type { PRIndex, TranslationPR } from "../types";
import { fetchTranslationPRs } from "../lib/github";

interface PRState {
  index: PRIndex;
  openPRs: TranslationPR[];
  isLoading: boolean;
  error: string | null;
  lastFetchedRepo: string | null;

  fetchPRs: (owner: string, repo: string) => Promise<void>;
  getProposals: (locale: string, key: string) => PRIndex[string][string];
}

export const usePRStore = create<PRState>((set, get) => ({
  index: {},
  openPRs: [],
  isLoading: false,
  error: null,
  lastFetchedRepo: null,

  fetchPRs: async (owner, repo) => {
    const repoKey = `${owner}/${repo}`;
    set({ isLoading: true, error: null });
    try {
      const { prs, index } = await fetchTranslationPRs(owner, repo);
      set({ openPRs: prs, index, isLoading: false, lastFetchedRepo: repoKey });
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : "Failed to fetch PRs",
      });
    }
  },

  getProposals: (locale, key) => get().index[locale]?.[key] ?? [],
}));
