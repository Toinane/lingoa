/// Resolve `rel_path` under `repo_path` and verify the result stays within the repo.
/// Handles path traversal attempts (e.g. `../../etc/passwd`).
/// Works even if the target file does not yet exist (lexically normalises the joined path).
/// If the resolved path already exists, it is canonicalized to resolve symlinks and the
/// containment check is repeated — this prevents a symlink inside the repo from escaping
/// to a target outside it.
pub fn resolve_repo_path(repo_path: &str, rel_path: &str) -> Result<std::path::PathBuf, String> {
    let rel = std::path::Path::new(rel_path);
    if rel.is_absolute() {
        return Err("rel_path must be relative".to_string());
    }
    let canonical_repo =
        std::fs::canonicalize(repo_path).map_err(|e| format!("Invalid repo path: {e}"))?;
    let joined = canonical_repo.join(rel);
    let mut normalized = std::path::PathBuf::new();
    for component in joined.components() {
        match component {
            std::path::Component::ParentDir => {
                normalized.pop();
            }
            std::path::Component::CurDir => {}
            c => normalized.push(c),
        }
    }
    if !normalized.starts_with(&canonical_repo) {
        return Err("Path traversal detected".to_string());
    }
    // If the path already exists, canonicalize it to resolve any symlinks and
    // re-verify containment. Without this a symlink placed inside the repo
    // (e.g. `repo/evil -> /etc`) would pass the lexical check above but would
    // allow reads/writes to its real target outside the repo.
    if normalized.exists() {
        let canonical_target = std::fs::canonicalize(&normalized)
            .map_err(|e| format!("Failed to resolve path: {e}"))?;
        if !canonical_target.starts_with(&canonical_repo) {
            return Err("Path traversal via symlink detected".to_string());
        }
    }
    Ok(normalized)
}
