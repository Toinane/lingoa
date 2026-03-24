import type { TranslationFile } from "../types";

const I18N_DIRS = new Set([
  "i18n", "locales", "translations", "lang", "l10n", "locale", "intl",
]);

/** Locale file name patterns. Group 1 must capture the locale code. */
const LOCALE_FILENAME_PATTERNS: RegExp[] = [
  /^([a-z]{2}(?:[_-][A-Z]{2})?)\.(?:json|ya?ml)$/,        // en.json, en-US.json
  /^messages[._-]([a-z]{2}(?:[_-][A-Z]{2})?)\.(?:json|ya?ml)$/, // messages.fr.json
  /^strings[._-]([a-z]{2}(?:[_-][A-Z]{2})?)\.(?:json|ya?ml)$/, // strings_de.json
  /^translation[._-]([a-z]{2}(?:[_-][A-Z]{2})?)\.(?:json|ya?ml)$/, // translation.ja.json
];

const LOCALE_DIR_PATTERN = /^[a-z]{2}(?:[_-][A-Z]{2})?$/;

export function detectLocaleFromPath(relativePath: string): string | null {
  const parts = relativePath.split("/");
  const filename = parts[parts.length - 1];

  // Check filename patterns
  for (const pattern of LOCALE_FILENAME_PATTERNS) {
    const m = filename.match(pattern);
    if (m) return m[1].replace("_", "-");
  }

  // Check if immediate parent directory is a locale code
  if (parts.length >= 2) {
    const parent = parts[parts.length - 2];
    if (LOCALE_DIR_PATTERN.test(parent)) return parent;
  }

  return null;
}

function isInI18nDirectory(relativePath: string): boolean {
  return relativePath.split("/").some((p) => I18N_DIRS.has(p.toLowerCase()));
}

/**
 * Given a list of relative file paths, return the ones that look like i18n files.
 */
export function discoverI18nFiles(
  relativePaths: string[],
  repoRoot: string
): TranslationFile[] {
  const files: TranslationFile[] = [];

  for (const rel of relativePaths) {
    if (!/\.(json|ya?ml)$/i.test(rel)) continue;

    const parts = rel.split("/");
    const filename = parts[parts.length - 1];
    const inI18nDir = isInI18nDirectory(rel);

    let locale = detectLocaleFromPath(rel);

    // If inside an i18n dir and no locale detected yet, use the first subdirectory
    // name as the locale — this allows any folder name (old_en, backup_fr, etc.)
    if (!locale && inI18nDir) {
      const i18nIdx = parts.findIndex((p) => I18N_DIRS.has(p.toLowerCase()));
      const firstSub = parts[i18nIdx + 1];
      if (firstSub && firstSub !== filename) {
        locale = firstSub;
      }
    }

    if (!locale) continue;

    // For files outside i18n dirs, still require locale in filename or locale parent dir
    if (!inI18nDir) {
      const localeInFilename = LOCALE_FILENAME_PATTERNS.some((p) => p.test(filename));
      const parentIsLocale = parts.length >= 2 && LOCALE_DIR_PATTERN.test(parts[parts.length - 2]);
      if (!localeInFilename && !parentIsLocale) continue;
    }

    files.push({
      absolutePath: `${repoRoot}/${rel}`.replace(/\\/g, "/"),
      relativePath: rel,
      locale,
      keyCount: 0,
    });
  }

  return files;
}

/** Pick the source locale file: prefer 'en', then 'en-US', then highest key count. */
export function detectSourceFile(
  files: TranslationFile[]
): TranslationFile | null {
  return (
    files.find((f) => f.locale === "en") ??
    files.find((f) => f.locale === "en-US") ??
    [...files].sort((a, b) => b.keyCount - a.keyCount)[0] ??
    null
  );
}

/** Return all locales that could be translation targets (i.e. not the source). */
export function getTargetLocales(
  files: TranslationFile[],
  sourceLocale: string
): string[] {
  return [...new Set(files.map((f) => f.locale).filter((l) => l !== sourceLocale))];
}
