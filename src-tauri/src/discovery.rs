use regex::Regex;
use serde::Serialize;
use std::sync::OnceLock;
use walkdir::WalkDir;

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredFile {
    pub absolute_path: String,
    pub relative_path: String,
    pub locale: String,
}

const I18N_DIRS: &[&str] = &[
    "i18n", "locales", "translations", "lang", "l10n", "locale", "intl",
];

/// Directories that are never useful to descend into.
/// Pruned at the boundary with `filter_entry` so WalkDir never opens them.
const SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".parcel-cache",
    "coverage",
    "__pycache__",
    ".cache",
    "vendor",
];

fn filename_patterns() -> &'static [Regex] {
    static P: OnceLock<Vec<Regex>> = OnceLock::new();
    P.get_or_init(|| {
        vec![
            // en.json, en-US.yaml
            Regex::new(r"(?i)^([a-z]{2}(?:[_-][A-Z]{2})?)\.(?:json|ya?ml)$").unwrap(),
            // messages.fr.json, messages_fr.yaml
            Regex::new(r"(?i)^messages[._-]([a-z]{2}(?:[_-][A-Z]{2})?)\.(?:json|ya?ml)$").unwrap(),
            // strings_de.json
            Regex::new(r"(?i)^strings[._-]([a-z]{2}(?:[_-][A-Z]{2})?)\.(?:json|ya?ml)$").unwrap(),
            // translation-ja.json
            Regex::new(r"(?i)^translation[._-]([a-z]{2}(?:[_-][A-Z]{2})?)\.(?:json|ya?ml)$").unwrap(),
        ]
    })
}

fn locale_dir_pat() -> &'static Regex {
    static P: OnceLock<Regex> = OnceLock::new();
    P.get_or_init(|| Regex::new(r"^[a-z]{2}(?:[_-][A-Z]{2})?$").unwrap())
}

fn i18n_ext_pat() -> &'static Regex {
    static P: OnceLock<Regex> = OnceLock::new();
    P.get_or_init(|| Regex::new(r"(?i)\.(json|ya?ml)$").unwrap())
}

pub fn detect_locale_from_path(rel: &str) -> Option<String> {
    let parts: Vec<&str> = rel.split('/').collect();
    let filename = *parts.last()?;

    for pattern in filename_patterns() {
        if let Some(cap) = pattern.captures(filename) {
            return Some(cap[1].replace('_', "-"));
        }
    }

    if parts.len() >= 2 {
        let parent = parts[parts.len() - 2];
        if locale_dir_pat().is_match(parent) {
            return Some(parent.to_string());
        }
    }

    None
}

fn is_in_i18n_dir(rel: &str) -> bool {
    rel.split('/')
        .any(|p| I18N_DIRS.contains(&p.to_lowercase().as_str()))
}

/// Walk `root` and return all i18n files with detected locales.
/// Uses `filter_entry` to prune SKIP_DIRS at directory boundaries, so WalkDir
/// never descends into `.git`, `node_modules`, etc. — a 100–1000× speed-up on
/// typical repos compared to visiting every file and then checking path components.
#[tauri::command]
pub fn discover_i18n_files(root: String) -> Result<Vec<DiscoveredFile>, String> {
    let root = root.trim_end_matches(['/', '\\']).to_string();
    let mut files = Vec::new();

    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            // Prune whole subtrees for known non-i18n directories.
            if e.file_type().is_dir() {
                let name = e.file_name().to_string_lossy().to_lowercase();
                !SKIP_DIRS.contains(&name.as_str())
            } else {
                true
            }
        })
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let path = entry.path();

        let rel = match path.strip_prefix(&root) {
            Ok(r) => r.to_string_lossy().replace('\\', "/"),
            Err(_) => continue,
        };
        let rel = rel.trim_start_matches('/').to_string();

        if !i18n_ext_pat().is_match(&rel) {
            continue;
        }

        let parts: Vec<&str> = rel.split('/').collect();
        let filename = match parts.last() {
            Some(f) => *f,
            None => continue,
        };
        let in_i18n_dir = is_in_i18n_dir(&rel);

        let mut locale = detect_locale_from_path(&rel);

        // Inside an i18n dir with no locale detected → first subdirectory is the locale
        if locale.is_none() && in_i18n_dir {
            let i18n_idx = parts
                .iter()
                .position(|p| I18N_DIRS.contains(&p.to_lowercase().as_str()));
            if let Some(idx) = i18n_idx {
                if let Some(first_sub) = parts.get(idx + 1) {
                    if *first_sub != filename {
                        locale = Some(first_sub.to_string());
                    }
                }
            }
        }

        let locale = match locale {
            Some(l) => l,
            None => continue,
        };

        // Files outside i18n dirs must have locale in filename or locale parent dir
        if !in_i18n_dir {
            let locale_in_filename = filename_patterns().iter().any(|p| p.is_match(filename));
            let parent_is_locale = parts.len() >= 2
                && locale_dir_pat().is_match(parts[parts.len() - 2]);
            if !locale_in_filename && !parent_is_locale {
                continue;
            }
        }

        let abs = format!("{}/{}", root, rel);
        files.push(DiscoveredFile {
            absolute_path: abs,
            relative_path: rel,
            locale,
        });
    }

    Ok(files)
}

/// Detect a locale code from a relative file path.
/// Exposed as a Tauri command so the frontend doesn't duplicate the detection logic.
#[tauri::command]
pub fn detect_locale(rel_path: String) -> Option<String> {
    detect_locale_from_path(&rel_path)
}
