use std::path::Path;
use std::process::Command;

/// Run a git command in the given working directory.
#[tauri::command]
fn run_git(args: Vec<String>, cwd: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(&args)
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to execute git: {e}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Read a file's content as a UTF-8 string.
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Write content to a file, creating parent directories as needed.
#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Recursively list all files under root, returning forward-slash relative paths.
/// Skips the .git directory.
#[tauri::command]
fn list_files_recursive(root: String) -> Result<Vec<String>, String> {
    use walkdir::WalkDir;
    let mut files = Vec::new();
    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let path = entry.path();
        // Skip anything inside .git
        if path
            .components()
            .any(|c| c.as_os_str() == ".git" || c.as_os_str() == "node_modules")
        {
            continue;
        }
        if let Ok(rel) = path.strip_prefix(&root) {
            files.push(rel.to_string_lossy().replace('\\', "/"));
        }
    }
    Ok(files)
}

/// Store the GitHub PAT in the OS keychain.
#[tauri::command]
fn store_token(token: String) -> Result<(), String> {
    let entry = keyring::Entry::new("lingoa", "github-token").map_err(|e| e.to_string())?;
    entry.set_password(&token).map_err(|e| e.to_string())
}

/// Retrieve the GitHub PAT from the OS keychain. Returns None if not set.
#[tauri::command]
fn get_token() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new("lingoa", "github-token").map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Remove the GitHub PAT from the OS keychain.
#[tauri::command]
fn delete_token() -> Result<(), String> {
    let entry = keyring::Entry::new("lingoa", "github-token").map_err(|e| e.to_string())?;
    entry.delete_credential().map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            run_git,
            read_file,
            write_file,
            list_files_recursive,
            store_token,
            get_token,
            delete_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
