import { create } from "zustand";
import { getTargetRepo } from "../types";
import type {
  TranslationFile,
  TranslationKeyWithState,
  KeyState,
} from "../types";
import type { TranslationValue } from "../types";
import { tauriFs, tauriGit, tauriParsers, tauriGitHub } from "../lib/tauri";
import {
  deriveTargetPath,
  buildBranchName,
  ensureBranchAndPush,
} from "../lib/git";
import { createPR } from "../lib/github";
import { usePRStore } from "./prStore";
import { useRepoStore } from "./repoStore";
import { useSettingsStore } from "./settingsStore";

const SECONDARY_LOCALE_KEY = "lingoa:secondary-source-locale";

interface EditorState {
  sourceFile: TranslationFile | null;
  targetLocale: string | null;
  targetRelPath: string | null;
  currentUser: string | null;
  repoPath: string | null;

  /** Flat source key → TranslationValue (for serialization) */
  sourceKeys: Record<string, TranslationValue>;

  keys: TranslationKeyWithState[];
  filteredKeys: TranslationKeyWithState[];
  searchQuery: string;

  selectedIndex: number;
  selectedKey: TranslationKeyWithState | null;

  editBuffer: string;
  isDirty: boolean;
  isLoading: boolean;
  error: string | null;

  /** Optional second reference locale shown alongside the primary source. */
  secondaryLocale: string | null;
  /** Flat key → text for the secondary locale file. null = not loaded yet. */
  secondaryTranslations: Record<string, string> | null;
  setSecondaryLocale: (locale: string | null) => Promise<void>;

  loadEditor: (
    sourceFile: TranslationFile,
    targetLocale: string,
    currentUser: string | null,
    repoPath: string,
  ) => Promise<void>;
  selectKey: (index: number) => Promise<void>;
  nextKey: () => Promise<void>;
  prevKey: () => Promise<void>;
  setEditBuffer: (value: string) => void;
  saveCurrentKey: () => Promise<void>;
  saveAndNext: () => Promise<void>;
  setSearchQuery: (query: string) => Promise<void>;
  submitPR: (userNote: string) => Promise<string>;
}

function fileFormat(path: string): string {
  return /\.ya?ml$/i.test(path) ? "yaml" : "json";
}

/** Pure derivation of filtered keys from the full key list and a search query.
 *  Keeping this as a standalone function ensures every code path that updates
 *  `keys` or `searchQuery` derives `filteredKeys` consistently. */
/**
 * Derives the display state for a key given the current edit-buffer text.
 * Used on save — differs from load-time derivation because it works with the
 * in-flight buffer value rather than persisted head/local translations.
 */
function deriveKeyState(
  k: TranslationKeyWithState,
  text: string,
  ownPRNumbers: Set<number>,
): KeyState {
  if (text && text === k.headTranslation) return "translated";
  if (text) return "own-pending";
  if (k.proposals.some((p) => !ownPRNumbers.has(p.prNumber)))
    return "other-pending";
  return "untranslated";
}

function computeFiltered(
  keys: TranslationKeyWithState[],
  query: string,
): TranslationKeyWithState[] {
  if (!query) return keys;
  const q = query.toLowerCase();
  return keys.filter(
    (k) =>
      k.key.toLowerCase().includes(q) || k.source.toLowerCase().includes(q),
  );
}

function buildProgressBar(translated: number, total: number): string {
  if (total === 0) return "░".repeat(16);
  const filled = Math.round((translated / total) * 16);
  return "█".repeat(filled) + "░".repeat(16 - filled);
}

function buildPRBody(
  sourceFile: TranslationFile,
  targetLocale: string,
  keys: TranslationKeyWithState[],
  userNote: string,
  prTipEnabled: boolean,
): string {
  const fileName =
    sourceFile.relativePath.split("/").pop() ?? sourceFile.relativePath;
  const total = keys.length;
  const translated = keys.filter((k) => k.editorTranslation !== null).length;
  const newKeys = keys.filter(
    (k) => k.editorTranslation !== null && k.headTranslation === undefined,
  ).length;
  const updatedKeys = keys.filter(
    (k) =>
      k.editorTranslation !== null &&
      k.headTranslation !== undefined &&
      k.editorTranslation !== k.headTranslation,
  ).length;
  const pct = total > 0 ? Math.round((translated / total) * 100) : 0;
  const bar = buildProgressBar(translated, total);

  const lines: string[] = [];
  lines.push(`## \`${fileName}\` translations`);
  lines.push("");

  if (userNote.trim()) {
    lines.push(userNote.trim());
    lines.push("");
    lines.push("#");
    lines.push("");
  }

  lines.push("### Stats");
  lines.push("");
  lines.push(`${translated} / ${total} keys translated \`${bar}\` **${pct}%**`);
  lines.push("");
  lines.push("| | |");
  lines.push("|---|---|");
  lines.push(`| Target locale | \`${targetLocale}\` |`);
  if (newKeys > 0) lines.push(`| Translated | ${newKeys} keys |`);
  if (updatedKeys > 0) lines.push(`| Updated | ${updatedKeys} keys |`);

  if (prTipEnabled) {
    lines.push("");
    lines.push("#");
    lines.push("");
    lines.push("> [!TIP]");
    lines.push(
      "> For an easier review, open this PR in [Lingoa app](https://github.com/Toinane/lingoa). Each key is shown alongside the source string and previous translation.",
    );
  }

  return lines.join("\n");
}

export const useEditorStore = create<EditorState>((set, get) => ({
  sourceFile: null,
  targetLocale: null,
  targetRelPath: null,
  currentUser: null,
  repoPath: null,
  sourceKeys: {},
  keys: [],
  filteredKeys: [],
  searchQuery: "",
  selectedIndex: 0,
  selectedKey: null,
  editBuffer: "",
  isDirty: false,
  isLoading: false,
  error: null,
  secondaryLocale: null,
  secondaryTranslations: null,

  setSecondaryLocale: async (locale) => {
    if (!locale) {
      localStorage.removeItem(SECONDARY_LOCALE_KEY);
      set({ secondaryLocale: null, secondaryTranslations: null });
      return;
    }
    const { sourceFile, repoPath } = get();
    if (!sourceFile || !repoPath) return;
    const secondaryPath = deriveTargetPath(
      sourceFile.relativePath,
      sourceFile.locale,
      locale,
    );
    const fmt = fileFormat(secondaryPath);
    try {
      const content = await tauriFs.readFile(repoPath, secondaryPath);
      const parsed = await tauriParsers.parse(content, fmt);
      const translations: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) translations[k] = v.text;
      localStorage.setItem(SECONDARY_LOCALE_KEY, locale);
      set({ secondaryLocale: locale, secondaryTranslations: translations });
    } catch {
      // File doesn't exist for this locale — store locale anyway, show blanks
      localStorage.setItem(SECONDARY_LOCALE_KEY, locale);
      set({ secondaryLocale: locale, secondaryTranslations: {} });
    }
  },

  loadEditor: async (sourceFile, targetLocale, currentUser, repoPath) => {
    set({ isLoading: true, error: null });
    try {
      const fmt = fileFormat(sourceFile.relativePath);
      const targetRelPath = deriveTargetPath(
        sourceFile.relativePath,
        sourceFile.locale,
        targetLocale,
      );

      // Fire all three read+parse chains concurrently — they are fully independent.
      // Total latency = max(source, target, HEAD) instead of their sum.
      const empty = {} as Record<string, TranslationValue>;
      const [sourceKeys, localKeys, headKeys] = await Promise.all([
        tauriFs
          .readFile(repoPath, sourceFile.relativePath)
          .then((c) => tauriParsers.parse(c, fmt)),
        tauriFs
          .readFile(repoPath, targetRelPath)
          .then((c) => tauriParsers.parse(c, fmt))
          .catch(() => empty),
        tauriGit
          .showFileAtHead(repoPath, targetRelPath)
          .then((c) => tauriParsers.parse(c, fmt))
          .catch(() => empty),
      ]);

      useRepoStore.getState().registerTargetFile({
        absolutePath: `${repoPath}/${targetRelPath}`,
        relativePath: targetRelPath,
        locale: targetLocale,
        keyCount: 0,
      });

      // 4. Build key list with states
      const { index, openPRs } = usePRStore.getState();
      const ownPRNumbers = new Set(
        openPRs
          .filter((pr) => pr.author === currentUser)
          .map((pr) => pr.number),
      );
      const localeProposals = index[targetLocale] ?? {};

      const keys: TranslationKeyWithState[] = Object.entries(sourceKeys).map(
        ([key, value]) => {
          const headTranslation = headKeys[key]?.text;
          const localTranslation = localKeys[key]?.text;
          const proposals = localeProposals[key] ?? [];
          const ownProposal = proposals.find((p) =>
            ownPRNumbers.has(p.prNumber),
          );
          const hasOtherProposal = proposals.some(
            (p) => !ownPRNumbers.has(p.prNumber),
          );

          let state: KeyState;
          if (headTranslation !== undefined) {
            state = "translated";
          } else if (localTranslation !== undefined) {
            state = "own-pending";
          } else if (ownProposal) {
            state = "own-pending";
          } else if (hasOtherProposal) {
            state = "other-pending";
          } else {
            state = "untranslated";
          }

          return {
            key,
            source: value.text,
            context: value.context,
            headTranslation,
            // null = never set; "" = explicitly set to empty (valid in some i18n formats)
            editorTranslation:
              localTranslation ?? headTranslation ?? ownProposal?.value ?? null,
            state,
            proposals,
          };
        },
      );

      // Sort alphabetically so sidebar order and arrow-key navigation are consistent
      keys.sort((a, b) => a.key.localeCompare(b.key));

      set({
        sourceFile,
        targetLocale,
        targetRelPath,
        currentUser,
        repoPath,
        sourceKeys,
        keys,
        // searchQuery is "" at load time so computeFiltered returns the full list.
        // Always derive via computeFiltered to keep filteredKeys consistent.
        filteredKeys: computeFiltered(keys, ""),
        searchQuery: "",
        selectedIndex: 0,
        selectedKey: keys[0] ?? null,
        editBuffer: keys[0]?.editorTranslation ?? "",
        isDirty: false,
        isLoading: false,
        secondaryTranslations: null,
      });

      // Restore persisted secondary source locale (non-blocking)
      const persisted = localStorage.getItem(SECONDARY_LOCALE_KEY);
      if (persisted) {
        get()
          .setSecondaryLocale(persisted)
          .catch((e: unknown) => {
            console.debug("[lingoa] Failed to restore secondary locale:", e);
          });
      } else {
        set({ secondaryLocale: null });
      }
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : "Failed to load editor",
      });
    }
  },

  selectKey: async (index) => {
    const { filteredKeys, isDirty } = get();
    // Persist any in-flight edit before moving away from the current key.
    if (isDirty) await get().saveCurrentKey();
    const key = filteredKeys[index] ?? null;
    set({
      selectedIndex: index,
      selectedKey: key,
      editBuffer: key?.editorTranslation ?? "",
      isDirty: false,
    });
  },

  nextKey: async () => {
    const { selectedIndex, filteredKeys } = get();
    if (selectedIndex < filteredKeys.length - 1) {
      await get().selectKey(selectedIndex + 1);
    }
  },

  prevKey: async () => {
    const { selectedIndex } = get();
    if (selectedIndex > 0) await get().selectKey(selectedIndex - 1);
  },

  setEditBuffer: (value) => set({ editBuffer: value, isDirty: true }),

  saveCurrentKey: async () => {
    const {
      selectedKey,
      editBuffer,
      keys,
      repoPath,
      targetRelPath,
      sourceKeys,
      currentUser,
      searchQuery,
    } = get();
    if (!selectedKey || !repoPath || !targetRelPath) return;
    // Don't write anything when the buffer is empty and the key was never set.
    // This distinguishes "never touched" (null) from "explicitly cleared" ("").
    if (editBuffer === "" && selectedKey.editorTranslation === null) return;

    // Re-derive state from the full context so that clearing a buffer correctly
    // reverts to "other-pending" when third-party PR proposals still exist,
    // rather than always falling through to "untranslated".
    const ownPRNumbers = new Set(
      usePRStore
        .getState()
        .openPRs.filter((p) => p.author === currentUser)
        .map((p) => p.number),
    );

    const updater = (k: TranslationKeyWithState) =>
      k.key === selectedKey.key
        ? {
            ...k,
            editorTranslation: editBuffer,
            state: deriveKeyState(k, editBuffer, ownPRNumbers),
          }
        : k;

    const updatedKeys = keys.map(updater);
    // Derive filteredKeys from updatedKeys + searchQuery — never sync manually.
    const updatedFiltered = computeFiltered(updatedKeys, searchQuery);

    // Build translation map and serialize via Rust.
    // Include explicit empty strings (null means "never set" and is excluded).
    const translations: Record<string, string> = {};
    for (const k of updatedKeys) {
      if (k.editorTranslation !== null)
        translations[k.key] = k.editorTranslation;
    }

    const content = await tauriParsers.serialize(
      translations,
      sourceKeys,
      fileFormat(targetRelPath),
    );
    await tauriFs.writeFile(repoPath, targetRelPath, content);

    set({ keys: updatedKeys, filteredKeys: updatedFiltered, isDirty: false });

    // Persist session so Home can offer a Resume card
    const { sourceFile: sf, targetLocale: tl, repoPath: rp } = get();
    if (sf && tl && rp) {
      const repoInfo = useRepoStore.getState().repoInfo;
      const repoLabel = repoInfo
        ? `${repoInfo.owner}/${repoInfo.repo}`
        : (rp.split("/").pop() ?? rp);
      localStorage.setItem(
        "lingoa:last-session",
        JSON.stringify({
          repoPath: rp,
          sourceFilePath: sf.relativePath,
          sourceLocale: sf.locale,
          targetLocale: tl,
          repoLabel,
          translatedCount: updatedKeys.filter(
            (k) => k.editorTranslation !== null,
          ).length,
          totalCount: updatedKeys.length,
        }),
      );
    }
  },

  saveAndNext: async () => {
    await get().saveCurrentKey();
    get().nextKey();
  },

  setSearchQuery: async (query) => {
    const { keys, selectedKey, editBuffer, isDirty } = get();
    const filteredKeys = computeFiltered(keys, query);

    const keepIdx = selectedKey
      ? filteredKeys.findIndex((k) => k.key === selectedKey.key)
      : -1;
    const newIndex = keepIdx >= 0 ? keepIdx : 0;
    const newKey = filteredKeys[newIndex] ?? null;
    const willSwitchKey = newKey?.key !== selectedKey?.key;

    // Save any in-flight edit before moving to a different key.
    if (isDirty && willSwitchKey) {
      await get().saveCurrentKey();
    }

    const newBuffer = willSwitchKey
      ? (newKey?.editorTranslation ?? "")
      : editBuffer;

    set({
      searchQuery: query,
      filteredKeys,
      selectedIndex: newIndex,
      selectedKey: newKey,
      editBuffer: newBuffer,
    });
  },

  submitPR: async (userNote) => {
    const { sourceFile, targetLocale, targetRelPath, repoPath, keys } = get();
    if (!sourceFile || !targetLocale || !targetRelPath || !repoPath) {
      throw new Error("Editor not fully loaded");
    }

    const repoInfo = useRepoStore.getState().repoInfo;
    if (!repoInfo) throw new Error("No repo info available");

    // PR targets the upstream repo (or same repo if not forked).
    const { owner: prOwner, repo: prRepo } = getTargetRepo(repoInfo);
    // For cross-fork PRs, GitHub needs "head": "forkOwner:branch".
    const headOwner = repoInfo.owner;
    const branchName = buildBranchName(targetLocale, sourceFile.relativePath);

    // Idempotent: creates the branch on first submit, switches to it on amendment.
    await ensureBranchAndPush(
      repoPath,
      branchName,
      targetRelPath,
      `translate: ${targetLocale} - ${sourceFile.relativePath}`,
    );

    // Check whether a PR already exists for this branch (amendment case).
    const existingUrl = await tauriGitHub.findPRForBranch(
      prOwner,
      prRepo,
      headOwner,
      branchName,
    );
    if (existingUrl) {
      localStorage.removeItem("lingoa:last-session");
      return existingUrl;
    }

    const { prTipEnabled } = useSettingsStore.getState();
    const body = buildPRBody(
      sourceFile,
      targetLocale,
      keys,
      userNote,
      prTipEnabled,
    );

    const url = await createPR(
      prOwner,
      prRepo,
      `[Translation] ${targetLocale} — ${sourceFile.relativePath}`,
      headOwner,
      branchName,
      body,
    );
    localStorage.removeItem("lingoa:last-session");
    return url;
  },
}));
