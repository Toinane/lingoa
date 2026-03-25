import type { TranslationFile } from "../types";

/** Return all locales that could be translation targets (i.e. not the source). */
export function getTargetLocales(
  files: TranslationFile[],
  sourceLocale: string
): string[] {
  const result = new Set<string>();
  for (const f of files) {
    if (f.locale !== sourceLocale) result.add(f.locale);
  }
  return [...result];
}
