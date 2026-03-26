import type { KeyState, TranslationKeyWithState } from "../types";

export const STATE_COLORS: Record<KeyState, string> = {
  translated: "#3fb950",
  "own-pending": "#d29922",
  "other-pending": "#58a6ff",
  untranslated: "#f85149",
};

/** Numeric priority — lower = worse. Used for O(n) single-pass worst detection. */
export const STATE_RANK: Record<KeyState, number> = {
  untranslated: 0,
  "other-pending": 1,
  "own-pending": 2,
  translated: 3,
};

const RANK_TO_STATE: KeyState[] = [
  "untranslated",
  "other-pending",
  "own-pending",
  "translated",
];

/** Return the worst (lowest-ranked) state in a group.
 *  Single O(n) pass with an early-exit when the floor is reached. */
export function worstStateOf(keys: TranslationKeyWithState[]): KeyState {
  let worst = 3; // start optimistic
  for (const k of keys) {
    const r = STATE_RANK[k.state];
    if (r < worst) {
      worst = r;
      if (worst === 0) break; // "untranslated" is the floor
    }
  }
  return RANK_TO_STATE[worst];
}
