import { create } from "zustand";

export type Theme = "dark" | "light" | "system" | "solarized-light";
export type Language = "en" | "fr";

/**
 * Theme registry — to add a new theme:
 *   1. Add an entry here
 *   2. Add "my-theme" to the Theme union above
 *   3. Add [data-theme="my-theme"] overrides in index.css
 */
export interface ThemeDefinition {
  id: Theme;
  label: string;
  icon: string;
}

export const THEME_REGISTRY: ThemeDefinition[] = [
  { id: "dark",            label: "Dark",      icon: "🌙" },
  { id: "light",           label: "Light",     icon: "☀️" },
  { id: "solarized-light", label: "Solarized", icon: "📄" },
  { id: "system",          label: "System",    icon: "💻" },
];

interface SettingsState {
  theme: Theme;
  language: Language;
  spellCheckDefault: boolean;

  loadSettings: () => void;
  setTheme: (theme: Theme) => void;
  setLanguage: (lang: Language) => void;
  setSpellCheckDefault: (v: boolean) => void;
}

const STORAGE_KEY = "lingoa:settings";

// Module-level handle for the system-theme MediaQuery listener
let _mql: MediaQueryList | null = null;
let _mqlListener: (() => void) | null = null;

function getSystemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: Theme) {
  // Tear down any previous system listener
  if (_mqlListener && _mql) {
    _mql.removeEventListener("change", _mqlListener);
    _mqlListener = null;
    _mql = null;
  }

  if (theme === "system") {
    const effective = getSystemDark() ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", effective);
    _mql = window.matchMedia("(prefers-color-scheme: dark)");
    _mqlListener = () => {
      document.documentElement.setAttribute("data-theme", _mql!.matches ? "dark" : "light");
    };
    _mql.addEventListener("change", _mqlListener);
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

function load(): Partial<Pick<SettingsState, "theme" | "language" | "spellCheckDefault">> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (typeof raw !== "object" || raw === null) return {};
    const r = raw as Record<string, unknown>;
    // Only accept known primitive keys — never let stored data overwrite store methods.
    const safe: Partial<Pick<SettingsState, "theme" | "language" | "spellCheckDefault">> = {};
    if (typeof r.theme === "string") safe.theme = r.theme as Theme;
    if (typeof r.language === "string") safe.language = r.language as Language;
    if (typeof r.spellCheckDefault === "boolean") safe.spellCheckDefault = r.spellCheckDefault;
    return safe;
  } catch {
    return {};
  }
}

function save(state: SettingsState) {
  const { theme, language, spellCheckDefault } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, language, spellCheckDefault }));
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: "dark",
  language: "en",
  spellCheckDefault: false,

  loadSettings: () => {
    const saved = load();
    const merged: SettingsState = { ...get(), ...saved };
    set(merged);
    applyTheme(merged.theme);
  },

  setTheme: (theme) => {
    set({ theme });
    applyTheme(theme);
    save({ ...get(), theme });
  },

  setLanguage: (language) => {
    set({ language });
    save({ ...get(), language });
  },

  setSpellCheckDefault: (spellCheckDefault) => {
    set({ spellCheckDefault });
    save({ ...get(), spellCheckDefault });
  },
}));
