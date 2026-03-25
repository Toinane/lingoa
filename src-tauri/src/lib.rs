use std::process::Command;

mod discovery;
mod git;
mod github;
mod parsers;
mod util;

/// Run a git command with a fixed argv, returning trimmed stdout or stderr as Err.
fn run_git_cmd(args: &[&str], cwd: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to execute git: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Create and switch to a new branch (git checkout -b <branch>).
#[tauri::command]
fn git_checkout_new_branch(repo_path: String, branch: String) -> Result<String, String> {
    run_git_cmd(&["checkout", "-b", &branch], &repo_path)
}

/// Stage a single file relative to the repo root (git add -- <rel_path>).
/// The `--` separator ensures the path is never misinterpreted as a git flag.
#[tauri::command]
fn git_add_file(repo_path: String, rel_path: String) -> Result<String, String> {
    run_git_cmd(&["add", "--", &rel_path], &repo_path)
}

/// Create a commit with the given message (git commit -m <message>).
#[tauri::command]
fn git_commit(repo_path: String, message: String) -> Result<String, String> {
    run_git_cmd(&["commit", "-m", &message], &repo_path)
}

/// Push a branch to origin (git push origin -- <branch>).
/// The `--` separator ensures the branch name is never misinterpreted as a git flag.
#[tauri::command]
fn git_push_branch(repo_path: String, branch: String) -> Result<String, String> {
    run_git_cmd(&["push", "origin", "--", &branch], &repo_path)
}

/// Push a branch with --force-with-lease (safe force push for amendment workflows).
#[tauri::command]
fn git_push_branch_force(repo_path: String, branch: String) -> Result<String, String> {
    run_git_cmd(&["push", "--force-with-lease", "origin", "--", &branch], &repo_path)
}

/// Return true if a local branch with the given name already exists.
#[tauri::command]
fn git_branch_exists(repo_path: String, branch: String) -> Result<bool, String> {
    Ok(run_git_cmd(
        &["rev-parse", "--verify", &format!("refs/heads/{}", branch)],
        &repo_path,
    )
    .is_ok())
}

/// Switch to an existing local branch (git checkout <branch>).
#[tauri::command]
fn git_checkout(repo_path: String, branch: String) -> Result<String, String> {
    run_git_cmd(&["checkout", &branch], &repo_path)
}

/// Open a URL in the system default browser.
/// Only http:// and https:// URLs are accepted to prevent local file / protocol handler abuse.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err(format!("Rejected non-http URL: {url}"));
    }
    open::that(&url).map_err(|e| e.to_string())
}

/// Read a repo-relative file as UTF-8. `rel_path` must be relative and within `repo_path`.
#[tauri::command]
fn read_repo_file(repo_path: String, rel_path: String) -> Result<String, String> {
    let target = util::resolve_repo_path(&repo_path, &rel_path)?;
    std::fs::read_to_string(&target).map_err(|e| e.to_string())
}

/// Write content to a repo-relative path, creating parent directories as needed.
/// `rel_path` must be relative and within `repo_path`.
#[tauri::command]
fn write_repo_file(repo_path: String, rel_path: String, content: String) -> Result<(), String> {
    let target = util::resolve_repo_path(&repo_path, &rel_path)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&target, content).map_err(|e| e.to_string())
}

/// Store the GitHub PAT in the OS keychain and verify it was persisted.
#[tauri::command]
fn store_token(token: String) -> Result<(), String> {
    let entry = keyring::Entry::new("lingoa", "github-token").map_err(|e| e.to_string())?;
    entry.set_password(&token).map_err(|e| e.to_string())?;
    // Verify the write actually persisted — catches silent failures on some keychain backends.
    let read_back = entry
        .get_password()
        .map_err(|e| format!("Token written but unreadable: {e}"))?;
    if read_back != token {
        return Err("Keychain write verification failed (value mismatch)".to_string());
    }
    Ok(())
}

/// Returns true if a token is currently stored in the OS keychain.
/// Does not return the token value — safe to expose to the frontend.
#[tauri::command]
fn token_is_stored() -> bool {
    keyring::Entry::new("lingoa", "github-token")
        .ok()
        .and_then(|e| e.get_password().ok())
        .is_some()
}

/// Remove the GitHub PAT from the OS keychain.
#[tauri::command]
fn delete_token() -> Result<(), String> {
    let entry = keyring::Entry::new("lingoa", "github-token").map_err(|e| e.to_string())?;
    entry.delete_credential().map_err(|e| e.to_string())
}

pub fn run() {
    // Build the shared HTTP client once. The connection pool is reused across all
    // GitHub commands; auth headers are added per-command (token can change).
    let http = github::GitHubHttp::new().expect("failed to build HTTP client");

    tauri::Builder::default()
        .manage(http)
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::Manager;
            let window = app
                .get_webview_window("main")
                .ok_or("main window not found")?;
            window.set_icon(tauri::include_image!("icons/128x128@2x.png"))?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // ── Shell ────────────────────────────────────────────────────────
            open_url,
            // ── Core FS (sandboxed to repo path) ─────────────────────────────
            read_repo_file,
            write_repo_file,
            // ── Keychain ─────────────────────────────────────────────────────
            store_token,
            delete_token,
            token_is_stored,
            // ── Git (shell: typed write ops needing credential helpers) ─────
            git_checkout_new_branch,
            git_checkout,
            git_branch_exists,
            git_add_file,
            git_commit,
            git_push_branch,
            git_push_branch_force,
            // ── Git (git2: fast read ops, no binary dependency) ──────────────
            git::git_get_remote_url,
            git::git_get_upstream_remote_url,
            git::git_show_file_at_head,
            // ── Parsers ───────────────────────────────────────────────────────
            parsers::parse_translation_file,
            parsers::serialize_translation_file,
            parsers::count_translation_keys,
            // ── Discovery ────────────────────────────────────────────────────
            discovery::discover_i18n_files,
            discovery::detect_locale,
            // ── GitHub API ───────────────────────────────────────────────────
            github::github_validate_token,
            github::github_get_user,
            github::github_detect_fork,
            github::github_list_translation_prs,
            github::github_create_pr,
            github::github_submit_review,
            github::github_find_pr_for_branch,
            github::github_fetch_pr_review_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}

#[cfg(test)]
mod tests {
    /// Full keychain round-trip: write → read → delete.
    /// Uses a dedicated test entry so the real token is never touched.
    /// Run with: cargo test --lib
    #[test]
    fn keychain_roundtrip() {
        let entry = keyring::Entry::new("lingoa-test", "keychain-roundtrip")
            .expect("failed to create keyring entry");

        // Clean up any leftover from a previous failed run
        let _ = entry.delete_credential();

        entry
            .set_password("canary-value-12345")
            .expect("failed to write to keychain");

        let read_back = entry
            .get_password()
            .expect("failed to read from keychain");

        assert_eq!(
            read_back, "canary-value-12345",
            "keychain round-trip value mismatch"
        );

        entry
            .delete_credential()
            .expect("failed to delete from keychain");

        // Confirm the entry is truly gone
        assert!(
            matches!(entry.get_password(), Err(keyring::Error::NoEntry)),
            "keychain entry should be gone after delete"
        );
    }

    /// Visibility test: writes a credential and LEAVES IT so you can verify
    /// it appears in Windows Credential Manager before the next test cleans it up.
    /// Run with: cargo test --lib keychain_visible -- --nocapture
    /// Then open Credential Manager > Windows Credentials > Generic Credentials
    /// and look for "lingoa-visible". Run the cleanup test afterward.
    #[test]
    fn keychain_visible() {
        let entry = keyring::Entry::new("lingoa-visible", "check-me")
            .expect("failed to create keyring entry");
        let _ = entry.delete_credential();
        entry
            .set_password("hello-from-lingoa")
            .expect("failed to write");
        let v = entry.get_password().expect("failed to read back");
        println!("\n=== Keychain entry written ===");
        println!("Service : lingoa-visible");
        println!("Account : check-me");
        println!("Value   : {v}");
        println!("Now open Credential Manager and look for 'lingoa-visible'");
        println!("Run keychain_visible_cleanup to remove it.");
    }

    #[test]
    fn keychain_visible_cleanup() {
        let entry = keyring::Entry::new("lingoa-visible", "check-me")
            .expect("failed to create keyring entry");
        let _ = entry.delete_credential();
        println!("Cleaned up lingoa-visible entry.");
    }
}
