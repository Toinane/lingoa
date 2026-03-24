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
  autoSaveOnSwitch: boolean;

  loadSettings: () => void;
  setTheme: (theme: Theme) => void;
  setLanguage: (lang: Language) => void;
  setSpellCheckDefault: (v: boolean) => void;
  setAutoSaveOnSwitch: (v: boolean) => void;
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

function load(): Partial<SettingsState> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function save(state: SettingsState) {
  const { theme, language, spellCheckDefault, autoSaveOnSwitch } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    theme, language, spellCheckDefault, autoSaveOnSwitch,
  }));
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: "dark",
  language: "en",
  spellCheckDefault: false,
  autoSaveOnSwitch: false,

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

  setAutoSaveOnSwitch: (autoSaveOnSwitch) => {
    set({ autoSaveOnSwitch });
    save({ ...get(), autoSaveOnSwitch });
  },
}));
