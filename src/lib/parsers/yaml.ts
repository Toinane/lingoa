import yaml from "js-yaml";
import type { TranslationValue } from "../../types";
import { parseJsonFlat, serializeJson } from "./json";

/** Parse a YAML i18n file into flat dot-notation key → TranslationValue pairs. */
export function parseYaml(content: string): Record<string, TranslationValue> {
  const raw = yaml.load(content) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") return {};
  // Reuse the JSON flattener since the structure is the same
  return parseJsonFlat(JSON.stringify(raw));
}

/**
 * Serialize translated strings back to YAML.
 * Builds a nested object first, then dumps to YAML.
 */
export function serializeYaml(
  translations: Record<string, string>,
  sourceStructure: Record<string, TranslationValue>
): string {
  // Build a nested JSON object first
  const json = serializeJson(translations, sourceStructure);
  const obj = JSON.parse(json) as Record<string, unknown>;
  return yaml.dump(obj, { indent: 2, lineWidth: 120 });
}
