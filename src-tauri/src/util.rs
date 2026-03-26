/// Validate a GitHub username or organisation name.
/// Allows: [a-zA-Z0-9-], 1–39 characters, cannot start or end with a hyphen.
pub fn validate_github_owner(owner: &str) -> Result<(), String> {
    if owner.is_empty() || owner.len() > 39 {
        return Err("GitHub owner must be 1-39 characters".to_string());
    }
    if !owner.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("GitHub owner contains invalid characters".to_string());
    }
    if owner.starts_with('-') || owner.ends_with('-') {
        return Err("GitHub owner cannot start or end with a hyphen".to_string());
    }
    Ok(())
}

/// Validate a GitHub repository name.
/// Allows: [a-zA-Z0-9._-], 1–100 characters.
pub fn validate_github_repo(repo: &str) -> Result<(), String> {
    if repo.is_empty() || repo.len() > 100 {
        return Err("GitHub repo name must be 1-100 characters".to_string());
    }
    if !repo.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.') {
        return Err("GitHub repo name contains invalid characters".to_string());
    }
    Ok(())
}

/// Validate a git branch name against the rules from git-check-ref-format.
/// Allows: alphanumeric, `-`, `_`, `.`, `/`, `%` (URL-encoded path segments used
/// by the translate/* branch scheme).  Rejects known-bad patterns.
pub fn validate_branch_name(branch: &str) -> Result<(), String> {
    if branch.is_empty() || branch.len() > 255 {
        return Err("Branch name must be 1-255 characters".to_string());
    }
    if branch.starts_with('-') {
        return Err("Branch name cannot start with '-'".to_string());
    }
    if branch.contains("..") || branch.contains("@{") {
        return Err("Branch name contains invalid sequence".to_string());
    }
    if branch.ends_with(".lock") || branch.ends_with('.') || branch.ends_with('/') {
        return Err("Branch name has invalid suffix".to_string());
    }
    if branch
        .chars()
        .any(|c| matches!(c, ' ' | '~' | '^' | ':' | '?' | '*' | '[' | '\\'))
    {
        return Err("Branch name contains invalid characters".to_string());
    }
    Ok(())
}

/// Validate a full-length git commit SHA (exactly 40 hex characters).
pub fn validate_git_sha(sha: &str) -> Result<(), String> {
    if sha.len() != 40 || !sha.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid commit SHA — expected 40 hex characters".to_string());
    }
    Ok(())
}

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

#[cfg(test)]
mod tests {
    use super::*;

    // ── validate_github_owner ──────────────────────────────────────────────────

    #[test]
    fn owner_valid() {
        assert!(validate_github_owner("Toinane").is_ok());
        assert!(validate_github_owner("my-org").is_ok());
        assert!(validate_github_owner("a").is_ok());
        assert!(validate_github_owner(&"x".repeat(39)).is_ok());
    }

    #[test]
    fn owner_empty() {
        assert!(validate_github_owner("").is_err());
    }

    #[test]
    fn owner_too_long() {
        assert!(validate_github_owner(&"a".repeat(40)).is_err());
    }

    #[test]
    fn owner_leading_hyphen() {
        assert!(validate_github_owner("-start").is_err());
    }

    #[test]
    fn owner_trailing_hyphen() {
        assert!(validate_github_owner("end-").is_err());
    }

    #[test]
    fn owner_invalid_chars() {
        assert!(validate_github_owner("with space").is_err());
        assert!(validate_github_owner("with/slash").is_err());
        assert!(validate_github_owner("with.dot").is_err());
        assert!(validate_github_owner("with@at").is_err());
    }

    // ── validate_github_repo ──────────────────────────────────────────────────

    #[test]
    fn repo_valid() {
        assert!(validate_github_repo("lingoa").is_ok());
        assert!(validate_github_repo("my.repo-name_v2").is_ok());
        assert!(validate_github_repo(&"a".repeat(100)).is_ok());
    }

    #[test]
    fn repo_empty() {
        assert!(validate_github_repo("").is_err());
    }

    #[test]
    fn repo_too_long() {
        assert!(validate_github_repo(&"a".repeat(101)).is_err());
    }

    #[test]
    fn repo_invalid_chars() {
        assert!(validate_github_repo("has space").is_err());
        assert!(validate_github_repo("has/slash").is_err());
        assert!(validate_github_repo("has@at").is_err());
    }

    // ── validate_branch_name ──────────────────────────────────────────────────

    #[test]
    fn branch_valid() {
        assert!(validate_branch_name("main").is_ok());
        assert!(validate_branch_name("feature/my-feature").is_ok());
        assert!(validate_branch_name("translate/fr/src%2Fi18n%2Fen.json").is_ok());
        assert!(validate_branch_name("v1.2.3").is_ok());
    }

    #[test]
    fn branch_empty() {
        assert!(validate_branch_name("").is_err());
    }

    #[test]
    fn branch_leading_hyphen() {
        assert!(validate_branch_name("-start").is_err());
    }

    #[test]
    fn branch_double_dot() {
        assert!(validate_branch_name("has..double").is_err());
    }

    #[test]
    fn branch_at_brace() {
        assert!(validate_branch_name("ref@{upstream}").is_err());
    }

    #[test]
    fn branch_lock_suffix() {
        assert!(validate_branch_name("packed-refs.lock").is_err());
    }

    #[test]
    fn branch_invalid_chars() {
        assert!(validate_branch_name("has space").is_err());
        assert!(validate_branch_name("has~tilde").is_err());
        assert!(validate_branch_name("has^caret").is_err());
        assert!(validate_branch_name("has:colon").is_err());
        assert!(validate_branch_name("has?question").is_err());
        assert!(validate_branch_name("has*star").is_err());
        assert!(validate_branch_name("has[bracket").is_err());
        assert!(validate_branch_name("has\\backslash").is_err());
    }

    // ── validate_git_sha ──────────────────────────────────────────────────────

    #[test]
    fn sha_valid() {
        assert!(validate_git_sha("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2").is_ok());
        assert!(validate_git_sha("0000000000000000000000000000000000000000").is_ok());
        assert!(validate_git_sha("ABCDEF1234567890abcdef1234567890abcdef12").is_ok());
    }

    #[test]
    fn sha_empty() {
        assert!(validate_git_sha("").is_err());
    }

    #[test]
    fn sha_too_short() {
        assert!(validate_git_sha("abc123").is_err());
        assert!(validate_git_sha(&"a".repeat(39)).is_err());
    }

    #[test]
    fn sha_too_long() {
        assert!(validate_git_sha(&"a".repeat(41)).is_err());
    }

    #[test]
    fn sha_non_hex() {
        assert!(validate_git_sha("g1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2").is_err());
        assert!(validate_git_sha("z1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2").is_err());
    }
}
