import { useSettingsStore } from "../stores/settingsStore";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

/** The canonical type every locale must satisfy. Derived from the English JSON. */
export type Locale = typeof en;

/**
 * All available locales. To add a new language:
 *   1. Create src/i18n/locales/xx.json  (must satisfy `Locale`)
 *   2. Import it here and add to LOCALES
 *   3. Add "xx" to the Language union in settingsStore.ts
 *   4. Add the option to the language selector in SettingsModal
 */
const LOCALES: Record<string, Locale> = {
  en,
  fr: fr as unknown as Locale,
};

/** React hook — returns the translation object for the current UI language. */
export function useT(): Locale {
  const language = useSettingsStore((s) => s.language);
  return LOCALES[language] ?? en;
}

/** Imperative accessor for use outside React components. */
export function getT(): Locale {
  return LOCALES[useSettingsStore.getState().language] ?? en;
}

/**
 * Interpolate a template string with named parameters.
 * Example: interp("{{n}} keys", { n: 5 }) → "5 keys"
 */
export function interp(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(params[k] ?? ""));
}
