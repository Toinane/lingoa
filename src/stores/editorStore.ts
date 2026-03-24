import { create } from "zustand";
import type { TranslationFile, TranslationKeyWithState, KeyState, TranslationValue } from "../types";
import { tauriFs, tauriGit } from "../lib/tauri";
import { parseJsonFlat, serializeJson } from "../lib/parsers/json";
import { parseYaml, serializeYaml } from "../lib/parsers/yaml";
import { deriveTargetPath, buildBranchName, createBranchAndPush } from "../lib/git";
import { createPR } from "../lib/github";
import { usePRStore } from "./prStore";
import { useRepoStore } from "./repoStore";
import { useSettingsStore } from "./settingsStore";

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
  navigateCount: number;

  loadEditor: (
    sourceFile: TranslationFile,
    targetLocale: string,
    currentUser: string | null,
    repoPath: string
  ) => Promise<void>;
  selectKey: (index: number) => void;
  /** Like selectKey but auto-saves first when the setting is enabled. */
  switchKey: (index: number) => void;
  nextKey: () => void;
  prevKey: () => void;
  setEditBuffer: (value: string) => void;
  saveCurrentKey: () => Promise<void>;
  saveAndNext: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  submitPR: () => Promise<string>;
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
  navigateCount: 0,

  loadEditor: async (sourceFile, targetLocale: string, currentUser: string | null, repoPath) => {
    set({ isLoading: true, error: null });
    try {
      // 1. Parse source file
      const sourceContent = await tauriFs.readFile(sourceFile.absolutePath);
      const isYaml = /\.ya?ml$/i.test(sourceFile.relativePath);
      const sourceKeys = isYaml
        ? parseYaml(sourceContent)
        : parseJsonFlat(sourceContent);

      // 2. Parse target file (working copy — may not exist yet)
      const targetRelPath = deriveTargetPath(
        sourceFile.relativePath,
        sourceFile.locale,
        targetLocale
      );
      const targetAbsPath = `${repoPath}/${targetRelPath}`;
      let localKeys: Record<string, TranslationValue> = {};
      try {
        const targetContent = await tauriFs.readFile(targetAbsPath);
        localKeys = isYaml ? parseYaml(targetContent) : parseJsonFlat(targetContent);
      } catch {
        // Target file doesn't exist yet
      }

      // 2b. Parse the committed (HEAD) version of the target file
      // Keys present in HEAD = truly "Done"; keys only on disk = locally saved, not committed
      let headKeys: Record<string, TranslationValue> = {};
      try {
        const headContent = await tauriGit.run(["show", `HEAD:${targetRelPath}`], repoPath);
        headKeys = isYaml ? parseYaml(headContent) : parseJsonFlat(headContent);
      } catch {
        // File not in HEAD yet (new locale or new file)
      }

      // Register the target file in repoStore so locale selectors stay in sync
      useRepoStore.getState().registerTargetFile({
        absolutePath: targetAbsPath,
        relativePath: targetRelPath,
        locale: targetLocale,
        keyCount: 0,
      });

      // 3. Get PR index and own PRs
      const { index, openPRs } = usePRStore.getState();
      const ownPRNumbers = new Set(
        openPRs.filter((pr) => pr.author === currentUser).map((pr) => pr.number)
      );
      const localeProposals = index[targetLocale] ?? {};

      // 4. Build key list with states
      const keys: TranslationKeyWithState[] = Object.entries(sourceKeys).map(
        ([key, value]) => {
          const headTranslation = headKeys[key]?.text;    // committed to git
          const localTranslation = localKeys[key]?.text;  // saved on disk
          const proposals = localeProposals[key] ?? [];
          const ownProposal = proposals.find((p) => ownPRNumbers.has(p.prNumber));
          const hasOtherProposal = proposals.some(
            (p) => !ownPRNumbers.has(p.prNumber)
          );

          let state: KeyState;
          if (headTranslation !== undefined) {
            state = "translated";
          } else if (localTranslation !== undefined) {
            // Saved locally but not yet committed
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
            editorTranslation: localTranslation ?? headTranslation ?? ownProposal?.value ?? "",
            state,
            proposals,
          };
        }
      );

      set({
        sourceFile,
        targetLocale,
        targetRelPath,
        currentUser,
        repoPath,
        sourceKeys,
        keys,
        filteredKeys: keys,
        selectedIndex: 0,
        selectedKey: keys[0] ?? null,
        editBuffer: keys[0]?.editorTranslation ?? "",
        isDirty: false,
        isLoading: false,
      });
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : "Failed to load editor",
      });
    }
  },

  switchKey: (index) => {
    const { isDirty } = get();
    if (isDirty && useSettingsStore.getState().autoSaveOnSwitch) {
      get().saveCurrentKey(); // fire-and-forget; values captured before selectKey runs
    }
    get().selectKey(index);
  },

  selectKey: (index) => {
    const { filteredKeys, navigateCount } = get();
    const key = filteredKeys[index] ?? null;
    set({
      selectedIndex: index,
      selectedKey: key,
      editBuffer: key?.editorTranslation ?? "",
      isDirty: false,
      navigateCount: navigateCount + 1,
    });
  },

  nextKey: () => {
    const { selectedIndex, filteredKeys } = get();
    if (selectedIndex < filteredKeys.length - 1) {
      get().selectKey(selectedIndex + 1);
    }
  },

  prevKey: () => {
    const { selectedIndex } = get();
    if (selectedIndex > 0) {
      get().selectKey(selectedIndex - 1);
    }
  },

  setEditBuffer: (value) => set({ editBuffer: value, isDirty: true }),

  saveCurrentKey: async () => {
    const { selectedKey, editBuffer, keys, filteredKeys, repoPath, targetRelPath, sourceKeys } = get();
    if (!selectedKey || !repoPath || !targetRelPath) return;

    // Update key in both arrays
    // Locally saved translations are "own-pending" (user draft, not yet in HEAD).
    // Only mark "translated" if the HEAD already had a translation.
    const updater = (k: TranslationKeyWithState) =>
      k.key === selectedKey.key
        ? {
            ...k,
            editorTranslation: editBuffer,
            state: editBuffer
              ? (k.headTranslation !== undefined ? "translated" : "own-pending") as KeyState
              : k.state,
          }
        : k;

    const updatedKeys = keys.map(updater);
    const updatedFiltered = filteredKeys.map(updater);

    // Build translation map and persist to disk
    const translations: Record<string, string> = {};
    for (const k of updatedKeys) {
      if (k.editorTranslation) translations[k.key] = k.editorTranslation;
    }

    const isYaml = /\.ya?ml$/i.test(targetRelPath);
    const content = isYaml
      ? serializeYaml(translations, sourceKeys)
      : serializeJson(translations, sourceKeys);

    await tauriFs.writeFile(`${repoPath}/${targetRelPath}`, content);

    set({ keys: updatedKeys, filteredKeys: updatedFiltered, isDirty: false });
  },

  saveAndNext: async () => {
    await get().saveCurrentKey();
    get().nextKey();
  },

  setSearchQuery: (query) => {
    const { keys, selectedKey, editBuffer } = get();
    const q = query.toLowerCase();
    const filteredKeys = q
      ? keys.filter(
          (k) =>
            k.key.toLowerCase().includes(q) ||
            k.source.toLowerCase().includes(q)
        )
      : keys;

    // Keep current key selected if still in results — avoids de-syncing editBuffer
    // and prevents spurious focus changes while typing/erasing in the search box.
    const keepIdx = selectedKey
      ? filteredKeys.findIndex((k) => k.key === selectedKey.key)
      : -1;
    const newIndex = keepIdx >= 0 ? keepIdx : 0;
    const newKey = filteredKeys[newIndex] ?? null;
    const newBuffer = newKey && newKey.key !== selectedKey?.key
      ? (newKey.editorTranslation ?? "")
      : editBuffer;

    set({ searchQuery: query, filteredKeys, selectedIndex: newIndex, selectedKey: newKey, editBuffer: newBuffer });
  },

  submitPR: async () => {
    const { sourceFile, targetLocale, targetRelPath, repoPath } = get();
    if (!sourceFile || !targetLocale || !targetRelPath || !repoPath) {
      throw new Error("Editor not fully loaded");
    }

    const repoInfo = useRepoStore.getState().repoInfo;
    if (!repoInfo) throw new Error("No repo info available");

    const owner = repoInfo.upstreamOwner ?? repoInfo.owner;
    const repo = repoInfo.upstreamRepo ?? repoInfo.repo;
    const branchName = buildBranchName(targetLocale, sourceFile.relativePath);

    await createBranchAndPush(
      repoPath,
      branchName,
      targetRelPath,
      `translate: ${targetLocale} - ${sourceFile.relativePath}`
    );

    const prUrl = await createPR(
      owner,
      repo,
      `[Translation] ${targetLocale} — ${sourceFile.relativePath}`,
      branchName,
      `Translation of \`${sourceFile.relativePath}\` to \`${targetLocale}\`.\n\n_Created with [Lingoa](https://github.com/gh-translate/gh-translate)_`
    );

    return prUrl;
  },
}));
