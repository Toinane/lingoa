use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use smallvec::SmallVec;

/// Maximum accepted file size. Protects against memory exhaustion from
/// pathologically large inputs passed through the IPC bridge.
const MAX_CONTENT_BYTES: usize = 10 * 1024 * 1024; // 10 MiB

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct TranslationValue {
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
}

/// Flatten a JSON/YAML Value into a dot-notation IndexMap of TranslationValue.
/// Uses IndexMap to preserve source file key order across parse → serialize round-trips.
pub fn parse_content(
    content: &str,
    is_yaml: bool,
) -> Result<IndexMap<String, TranslationValue>, String> {
    let value: Value = if is_yaml {
        serde_yml::from_str(content).map_err(|e| e.to_string())?
    } else {
        serde_json::from_str(content).map_err(|e| e.to_string())?
    };
    let mut map = IndexMap::new();
    flatten_value(&value, &mut map);
    Ok(map)
}

/// Iterative (non-recursive) depth-first flattening using an explicit stack.
/// Children are pushed in reverse order so LIFO pops produce document-order output,
/// preserving the IndexMap's insertion-order semantics.
///
/// Benefits over the previous recursive version:
/// - No stack overflow risk regardless of nesting depth
/// - No depth-limit constant to tune or accidentally hit
/// - One less parameter makes the call sites cleaner
fn flatten_value(root: &Value, map: &mut IndexMap<String, TranslationValue>) {
    // Stack: (prefix, &Value).  Empty prefix = root level.
    let mut stack: Vec<(String, &Value)> = vec![("".to_string(), root)];

    while let Some((prefix, value)) = stack.pop() {
        match value {
            Value::String(s) if !prefix.is_empty() => {
                map.insert(
                    prefix,
                    TranslationValue {
                        text: s.clone(),
                        context: None,
                    },
                );
            }
            // Preserve numeric and boolean i18n values as strings.
            // Arrays and null are silently skipped — no meaningful flat representation.
            Value::Number(n) if !prefix.is_empty() => {
                map.insert(
                    prefix,
                    TranslationValue {
                        text: n.to_string(),
                        context: None,
                    },
                );
            }
            Value::Bool(b) if !prefix.is_empty() => {
                map.insert(
                    prefix,
                    TranslationValue {
                        text: b.to_string(),
                        context: None,
                    },
                );
            }
            Value::Object(obj) => {
                // Detect a structured { text: string, context?: string } leaf node
                let has_text = obj.get("text").map(|v| v.is_string()).unwrap_or(false);
                let only_valid = obj.keys().all(|k| k == "text" || k == "context");
                if has_text && only_valid && !prefix.is_empty() {
                    let text = obj["text"].as_str().unwrap().to_string();
                    let context = obj
                        .get("context")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    map.insert(prefix, TranslationValue { text, context });
                } else {
                    // Push children in REVERSE order so forward-order pops preserve
                    // the original document order in the resulting IndexMap.
                    for (k, v) in obj.iter().rev() {
                        let new_prefix = if prefix.is_empty() {
                            k.clone()
                        } else {
                            format!("{}.{}", prefix, k)
                        };
                        stack.push((new_prefix, v));
                    }
                }
            }
            _ => {} // empty prefix scalars, arrays, null — skip
        }
    }
}

/// Rebuild a nested JSON/YAML structure from flat translations + source (for context preservation).
pub fn serialize_content(
    translations: &IndexMap<String, String>,
    source: &IndexMap<String, TranslationValue>,
    is_yaml: bool,
) -> Result<String, String> {
    let mut root = serde_json::Map::new();

    for (flat_key, text) in translations {
        // SmallVec avoids a heap allocation for keys with ≤ 16 dot-separated components,
        // which covers virtually all real i18n keys (e.g. "a.b.c" → 3 components).
        let parts: SmallVec<[&str; 16]> = flat_key.split('.').collect();
        let context = source
            .get(flat_key)
            .and_then(|v| v.context.as_deref())
            .map(|s| s.to_string());

        let value = if let Some(ctx) = context {
            serde_json::json!({ "text": text, "context": ctx })
        } else {
            Value::String(text.clone())
        };
        set_nested(&mut root, &parts, value);
    }

    let obj = Value::Object(root);
    if is_yaml {
        serde_yml::to_string(&obj).map_err(|e| e.to_string())
    } else {
        serde_json::to_string_pretty(&obj).map_err(|e| e.to_string())
    }
}

fn set_nested(map: &mut serde_json::Map<String, Value>, parts: &[&str], value: Value) {
    if parts.is_empty() {
        return;
    }
    if parts.len() == 1 {
        map.insert(parts[0].to_string(), value);
        return;
    }
    let entry = map
        .entry(parts[0].to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    // If a prior key set a scalar at this path component (key conflict), replace it
    // with an object so that deeper keys can still be inserted. This prevents silent
    // data loss when a flat key and a namespace share the same prefix (e.g. both
    // "a.b" and "a.b.c" are present in the translation map).
    if !entry.is_object() {
        *entry = Value::Object(serde_json::Map::new());
    }
    if let Value::Object(child) = entry {
        set_nested(child, &parts[1..], value);
    }
}

pub fn is_yaml_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".yaml") || lower.ends_with(".yml")
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

/// Parse a JSON or YAML i18n file into a flat dot-notation map.
/// Returns an IndexMap so key order matches the source file.
#[tauri::command]
pub fn parse_translation_file(
    content: String,
    format: String,
) -> Result<IndexMap<String, TranslationValue>, String> {
    if content.len() > MAX_CONTENT_BYTES {
        return Err(format!(
            "File too large ({} bytes). Maximum is {} MiB.",
            content.len(),
            MAX_CONTENT_BYTES / 1024 / 1024
        ));
    }
    parse_content(&content, format == "yaml" || format == "yml")
}

/// Serialize flat translations back into a nested JSON or YAML string.
#[tauri::command]
pub fn serialize_translation_file(
    translations: IndexMap<String, String>,
    source: IndexMap<String, TranslationValue>,
    format: String,
) -> Result<String, String> {
    serialize_content(&translations, &source, format == "yaml" || format == "yml")
}

/// Read a repo-relative file and count its translation keys in one call.
/// `rel_path` is sandboxed to `repo_path` via the shared path resolver.
#[tauri::command]
pub fn count_translation_keys(repo_path: String, rel_path: String) -> Result<u32, String> {
    let target = crate::util::resolve_repo_path(&repo_path, &rel_path)?;
    let content = std::fs::read_to_string(&target).map_err(|e| e.to_string())?;
    if content.len() > MAX_CONTENT_BYTES {
        return Err(format!(
            "File too large ({} bytes). Maximum is {} MiB.",
            content.len(),
            MAX_CONTENT_BYTES / 1024 / 1024
        ));
    }
    let map = parse_content(&content, is_yaml_path(&rel_path))?;
    Ok(map.len() as u32)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn tv(text: &str) -> TranslationValue {
        TranslationValue {
            text: text.to_string(),
            context: None,
        }
    }

    fn tv_ctx(text: &str, ctx: &str) -> TranslationValue {
        TranslationValue {
            text: text.to_string(),
            context: Some(ctx.to_string()),
        }
    }

    // ── parse_content ─────────────────────────────────────────────────────────

    #[test]
    fn flat_json() {
        let json = r#"{"hello": "world", "bye": "ciao"}"#;
        let m = parse_content(json, false).unwrap();
        assert_eq!(m["hello"], tv("world"));
        assert_eq!(m["bye"], tv("ciao"));
    }

    #[test]
    fn nested_json_dot_notation() {
        let json = r#"{"a": {"b": {"c": "deep"}}}"#;
        let m = parse_content(json, false).unwrap();
        assert_eq!(m["a.b.c"], tv("deep"));
    }

    #[test]
    fn structured_leaf_text_context() {
        let json = r#"{"btn": {"text": "Click me", "context": "submit button"}}"#;
        let m = parse_content(json, false).unwrap();
        assert_eq!(m["btn"], tv_ctx("Click me", "submit button"));
    }

    #[test]
    fn structured_leaf_text_only() {
        // {text: "..."} with no other keys IS a leaf, not a namespace
        let json = r#"{"x": {"text": "hello"}}"#;
        let m = parse_content(json, false).unwrap();
        assert_eq!(m["x"].text, "hello");
        assert!(m["x"].context.is_none());
    }

    #[test]
    fn object_with_text_and_extra_key_is_namespace() {
        // {text: "...", extra: "..."} must be treated as a namespace, not a leaf
        let json = r#"{"x": {"text": "hello", "extra": "oops"}}"#;
        let m = parse_content(json, false).unwrap();
        // "x" itself should NOT appear as a key; "x.text" and "x.extra" should
        assert!(!m.contains_key("x"));
        assert_eq!(m["x.text"], tv("hello"));
        assert_eq!(m["x.extra"], tv("oops"));
    }

    #[test]
    fn number_and_bool_values_are_strings() {
        let json = r#"{"count": 42, "flag": true}"#;
        let m = parse_content(json, false).unwrap();
        assert_eq!(m["count"].text, "42");
        assert_eq!(m["flag"].text, "true");
    }

    #[test]
    fn array_values_are_skipped() {
        let json = r#"{"items": ["a", "b"], "ok": "yes"}"#;
        let m = parse_content(json, false).unwrap();
        assert!(!m.contains_key("items"));
        assert_eq!(m["ok"], tv("yes"));
    }

    #[test]
    fn key_order_json_alphabetical() {
        // serde_json's default Value::Object is a BTreeMap, so JSON keys come out
        // in alphabetical order regardless of document order.  This is expected and
        // acceptable — enabling the "preserve_order" serde_json feature would change it.
        let json = r#"{"z": "last", "a": "first", "m": "middle"}"#;
        let m = parse_content(json, false).unwrap();
        let keys: Vec<&str> = m.keys().map(|s| s.as_str()).collect();
        assert_eq!(keys, ["a", "m", "z"]); // BTreeMap alphabetical
    }

    #[test]
    fn key_order_yaml_alphabetical() {
        // serde_yml converts through serde_json::Value (BTreeMap) so YAML keys also
        // come out alphabetically sorted.  Enabling serde_json "preserve_order" would
        // change this; until then, both formats are consistently alphabetical.
        let yaml = "z: last\na: first\nm: middle\n";
        let m = parse_content(yaml, true).unwrap();
        let keys: Vec<&str> = m.keys().map(|s| s.as_str()).collect();
        assert_eq!(keys, ["a", "m", "z"]); // BTreeMap alphabetical
    }

    #[test]
    fn yaml_round_trip() {
        let yaml = "greeting: hello\nfarewell: goodbye\n";
        let m = parse_content(yaml, true).unwrap();
        assert_eq!(m["greeting"], tv("hello"));
        assert_eq!(m["farewell"], tv("goodbye"));
    }

    // ── serialize_content ─────────────────────────────────────────────────────

    #[test]
    fn serialize_flat() {
        let mut t: IndexMap<String, String> = IndexMap::new();
        t.insert("a".into(), "hello".into());
        t.insert("b".into(), "world".into());
        let src: IndexMap<String, TranslationValue> = IndexMap::new();
        let out = serialize_content(&t, &src, false).unwrap();
        let back = parse_content(&out, false).unwrap();
        assert_eq!(back["a"].text, "hello");
        assert_eq!(back["b"].text, "world");
    }

    #[test]
    fn round_trip_nested() {
        let json = r#"{"a": {"b": "hello"}, "c": "world"}"#;
        let flat = parse_content(json, false).unwrap();
        let translations: IndexMap<String, String> = flat
            .iter()
            .map(|(k, v)| (k.clone(), v.text.clone()))
            .collect();
        let restored = serialize_content(&translations, &flat, false).unwrap();
        let back = parse_content(&restored, false).unwrap();
        assert_eq!(flat, back);
    }

    #[test]
    fn round_trip_preserves_context() {
        let json = r#"{"save": {"text": "Save", "context": "toolbar button"}}"#;
        let flat = parse_content(json, false).unwrap();
        let translations: IndexMap<String, String> = flat
            .iter()
            .map(|(k, v)| (k.clone(), v.text.clone()))
            .collect();
        let restored = serialize_content(&translations, &flat, false).unwrap();
        let back = parse_content(&restored, false).unwrap();
        assert_eq!(back["save"].context.as_deref(), Some("toolbar button"));
    }

    #[test]
    fn key_collision_no_silent_data_loss() {
        // "a.b" (leaf) AND "a.b.c" (deeper) — set_nested must not drop either.
        // The leaf at "a.b" is promoted to a namespace so "a.b.c" can be stored.
        let mut translations: IndexMap<String, String> = IndexMap::new();
        translations.insert("a.b".into(), "leaf".into());
        translations.insert("a.b.c".into(), "deeper".into());
        let src: IndexMap<String, TranslationValue> = IndexMap::new();
        let out = serialize_content(&translations, &src, false).unwrap();
        let back = parse_content(&out, false).unwrap();
        // "a.b.c" must survive
        assert!(back.contains_key("a.b.c"), "a.b.c should not be dropped");
    }

    // ── size guard ────────────────────────────────────────────────────────────

    #[test]
    fn size_guard_json() {
        let huge = "x".repeat(11 * 1024 * 1024);
        assert!(
            parse_translation_file(huge, "json".into()).is_err(),
            "should reject content > 10 MiB"
        );
    }

    #[test]
    fn size_guard_yaml() {
        let huge = "x".repeat(11 * 1024 * 1024);
        assert!(parse_translation_file(huge, "yaml".into()).is_err());
    }
}
