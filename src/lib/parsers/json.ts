import type { TranslationValue } from "../../types";

type RawNode = string | { text: string; context?: string } | Record<string, unknown>;

/** Flatten a nested JSON i18n object into dot-notation key → TranslationValue pairs. */
export function parseJsonFlat(content: string): Record<string, TranslationValue> {
  const raw = JSON.parse(content) as Record<string, RawNode>;
  return flattenObject(raw);
}

function flattenObject(
  obj: Record<string, RawNode>,
  prefix = ""
): Record<string, TranslationValue> {
  const result: Record<string, TranslationValue> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === "string") {
      result[fullKey] = { text: value };
    } else if (
      value !== null &&
      typeof value === "object" &&
      "text" in value &&
      typeof (value as Record<string, unknown>).text === "string"
    ) {
      const structured = value as { text: string; context?: string };
      result[fullKey] = { text: structured.text, context: structured.context };
    } else if (value !== null && typeof value === "object") {
      Object.assign(
        result,
        flattenObject(value as Record<string, RawNode>, fullKey)
      );
    }
  }

  return result;
}

/**
 * Serialize translated strings back to a nested JSON structure.
 * Preserves context from the source structure where applicable.
 */
export function serializeJson(
  translations: Record<string, string>,
  sourceStructure: Record<string, TranslationValue>
): string {
  const result: Record<string, unknown> = {};

  for (const [flatKey, text] of Object.entries(translations)) {
    if (!text) continue;
    const parts = flatKey.split(".");
    let current = result;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) current[parts[i]] = {};
      current = current[parts[i]] as Record<string, unknown>;
    }

    const lastKey = parts[parts.length - 1];
    const src = sourceStructure[flatKey];

    if (src?.context) {
      current[lastKey] = { text, context: src.context };
    } else {
      current[lastKey] = text;
    }
  }

  return JSON.stringify(result, null, 2);
}
