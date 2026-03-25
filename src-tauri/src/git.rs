use git2::Repository;

fn find_remote_url(repo: &Repository, name: &str) -> Result<Option<String>, String> {
    match repo.find_remote(name) {
        Ok(remote) => Ok(remote.url().map(|s| s.to_string())),
        Err(_) => Ok(None),
    }
}

/// Get the `origin` remote URL from a local git repository.
#[tauri::command]
pub fn git_get_remote_url(repo_path: String) -> Result<Option<String>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
    find_remote_url(&repo, "origin")
}

/// Get the `upstream` remote URL from a local git repository.
/// Returns None if no remote named "upstream" exists (not a fork with upstream configured).
#[tauri::command]
pub fn git_get_upstream_remote_url(repo_path: String) -> Result<Option<String>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
    find_remote_url(&repo, "upstream")
}

/// Read a file's content at HEAD from the local git repository.
/// `rel_path` must use forward slashes (git-native format).
#[tauri::command]
pub fn git_show_file_at_head(repo_path: String, rel_path: String) -> Result<String, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let commit = head.peel_to_commit().map_err(|e| e.to_string())?;
    let tree = commit.tree().map_err(|e| e.to_string())?;

    // git2 expects forward-slash paths for tree lookups
    let path = std::path::Path::new(&rel_path);
    let entry = tree.get_path(path).map_err(|e| e.to_string())?;
    let blob = repo.find_blob(entry.id()).map_err(|e| e.to_string())?;

    std::str::from_utf8(blob.content())
        .map(|s| s.to_string())
        .map_err(|e| e.to_string())
}
