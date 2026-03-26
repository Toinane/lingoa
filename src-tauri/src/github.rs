use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures::future::join_all;
use reqwest::{
    header::{HeaderValue, ACCEPT, AUTHORIZATION},
    Client,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Semaphore;

// ─── Managed HTTP client ──────────────────────────────────────────────────────

/// Shared reqwest connection pool — built once at startup, injected into every
/// GitHub command via Tauri managed state.  Auth headers are added per-command
/// because the token can change across logout / login cycles.
pub struct GitHubHttp(pub Client);

impl GitHubHttp {
    pub fn new() -> Result<Self, String> {
        Client::builder()
            .user_agent("lingoa/0.1.0")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map(GitHubHttp)
            .map_err(|e| e.to_string())
    }
}

// ─── Per-command API handle ───────────────────────────────────────────────────

/// Lightweight per-command wrapper that attaches auth + GitHub API headers to
/// every request.  Cloning is cheap: `reqwest::Client` wraps an `Arc`.
#[derive(Clone)]
struct GitHubApi {
    client: Client,
    auth: HeaderValue,
}

impl GitHubApi {
    fn new(http: &GitHubHttp, token: &str) -> Result<Self, String> {
        Ok(GitHubApi {
            client: http.0.clone(),
            // Do not include the token in the error string — it would leak via the IPC channel.
            auth: HeaderValue::from_str(&format!("Bearer {token}")).map_err(|_| {
                "Invalid token format — token must contain only printable ASCII characters"
                    .to_string()
            })?,
        })
    }

    fn get(&self, url: impl reqwest::IntoUrl) -> reqwest::RequestBuilder {
        self.client
            .get(url)
            .header(AUTHORIZATION, self.auth.clone())
            .header(
                ACCEPT,
                HeaderValue::from_static("application/vnd.github+json"),
            )
            .header(
                "X-GitHub-Api-Version",
                HeaderValue::from_static("2022-11-28"),
            )
    }

    fn post(&self, url: impl reqwest::IntoUrl) -> reqwest::RequestBuilder {
        self.client
            .post(url)
            .header(AUTHORIZATION, self.auth.clone())
            .header(
                ACCEPT,
                HeaderValue::from_static("application/vnd.github+json"),
            )
            .header(
                "X-GitHub-Api-Version",
                HeaderValue::from_static("2022-11-28"),
            )
    }
}

// ─── GitHub API response types (snake_case from GitHub) ──────────────────────

#[derive(Deserialize)]
struct GhUser {
    login: String,
}

#[derive(Deserialize)]
struct GhRepo {
    default_branch: String,
    fork: Option<bool>,
    parent: Option<GhRepoParent>,
}

#[derive(Deserialize)]
struct GhRepoParent {
    full_name: String,
}

#[derive(Deserialize)]
struct GhPR {
    number: u64,
    title: String,
    html_url: String,
    draft: Option<bool>,
    created_at: String,
    head: GhRef,
    base: GhRef,
    user: Option<GhActor>,
}

#[derive(Deserialize)]
struct GhRef {
    sha: String,
    #[serde(rename = "ref")]
    ref_name: String,
}

#[derive(Deserialize)]
struct GhActor {
    login: String,
    avatar_url: String,
}

#[derive(Deserialize)]
struct GhPRFile {
    filename: String,
}

#[derive(Deserialize)]
struct GhContent {
    content: Option<String>,
    #[serde(rename = "type")]
    kind: Option<String>,
}

// ─── IPC return types (camelCase for TypeScript) ──────────────────────────────

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TranslationPR {
    number: u64,
    title: String,
    author: String,
    author_avatar_url: String,
    branch_name: String,
    locale: String,
    encoded_file_path: String,
    url: String,
    is_draft: bool,
    created_at: String,
    head_sha: String,
    base_branch: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PRProposal {
    key: String,
    value: String,
    pr_number: u64,
    pr_title: String,
    author: String,
    author_avatar_url: String,
    pr_url: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FetchPRsResult {
    prs: Vec<TranslationPR>,
    index: HashMap<String, HashMap<String, Vec<PRProposal>>>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KeyRow {
    key: String,
    /// Source language text (e.g. English).
    source: String,
    /// Previous translation from the base branch. None when the target file
    /// is brand-new (created by this PR) or when the key didn't exist before.
    previous: Option<String>,
    /// New translation introduced by this PR.
    translated: String,
    /// 1-indexed line in the translated file on the RIGHT side of the diff.
    /// 0 means the line could not be located (e.g. multi-line YAML value).
    line: u32,
    /// Raw content of that line including indentation (empty when line == 0).
    raw_line: String,
    /// File path — needed to target inline review comments.
    path: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PRReviewFile {
    filename: String,
    /// True when the target file did not exist on the base branch before this PR.
    is_new_file: bool,
    rows: Vec<KeyRow>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ForkInfo {
    upstream_owner: String,
    upstream_repo: String,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRANCH_PREFIX: &str = "translate/";

/// Maximum number of items returned by any paginated endpoint.
/// A response that keeps returning `Link: rel="next"` would otherwise loop forever.
const MAX_PAGINATED_RESULTS: usize = 10_000;

/// Maximum number of concurrent GitHub API requests in a single command.
const MAX_CONCURRENT: usize = 10;

/// Read the GitHub PAT from the OS keychain. Returns an error if not set.
fn get_token() -> Result<String, String> {
    let entry = keyring::Entry::new("lingoa", "github-token").map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| match e {
        keyring::Error::NoEntry => "Not authenticated — please add a GitHub token".to_string(),
        other => other.to_string(),
    })
}

// ─── Pagination ───────────────────────────────────────────────────────────────

/// Parse the `Link` header and return the URL for the next page, if any.
fn extract_next_link(link_header: &str) -> Option<String> {
    // Format: `<https://...?page=2>; rel="next", <...>; rel="last"`
    for part in link_header.split(',') {
        let mut url_opt: Option<String> = None;
        let mut is_next = false;
        for segment in part.split(';') {
            let s = segment.trim();
            if s.starts_with('<') && s.ends_with('>') {
                url_opt = Some(s[1..s.len() - 1].to_string());
            } else if s.contains(r#"rel="next""#) {
                is_next = true;
            }
        }
        if is_next {
            return url_opt;
        }
    }
    None
}

/// Fetch all pages of a GitHub list endpoint, following `Link: rel="next"` headers.
/// Stops after `MAX_PAGINATED_RESULTS` items to prevent infinite loops from a
/// misbehaving or malicious API response.
async fn get_paginated<T: serde::de::DeserializeOwned>(
    api: &GitHubApi,
    initial_url: &str,
) -> Result<Vec<T>, String> {
    let mut results: Vec<T> = Vec::new();
    let mut next_url: Option<String> = Some(initial_url.to_string());

    while let Some(current_url) = next_url.take() {
        if results.len() >= MAX_PAGINATED_RESULTS {
            break;
        }
        let resp = api
            .get(&current_url)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if resp.status() == 429 {
            let retry = resp
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .map(|s| format!("; retry after {} seconds", s))
                .unwrap_or_default();
            return Err(format!("GitHub rate limit exceeded{}", retry));
        }
        if !resp.status().is_success() {
            return Err(format!("GitHub API error: {}", resp.status()));
        }
        next_url = resp
            .headers()
            .get("link")
            .and_then(|v| v.to_str().ok())
            .and_then(extract_next_link);
        let page: Vec<T> = resp.json().await.map_err(|e| e.to_string())?;
        results.extend(page);
    }
    Ok(results)
}

/// Find the 1-indexed line number and raw content of a translation key in a file.
/// Matches the leaf key name + value (for JSON) to handle duplicate leaf keys
/// in different namespaces. YAML matching uses only the leaf key due to value
/// encoding complexity. Returns None when the line cannot be located.
fn find_key_line(raw: &str, flat_key: &str, value: &str, is_yaml: bool) -> Option<(u32, String)> {
    let leaf = flat_key.rsplit('.').next().unwrap_or(flat_key);
    for (i, line) in raw.lines().enumerate() {
        let trimmed = line.trim();
        let matched = if is_yaml {
            trimmed.starts_with(&format!("{}: ", leaf)) || trimmed == format!("{}:", leaf).as_str()
        } else {
            // Escape the value as it would appear inside a JSON string.
            let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
            trimmed.starts_with(&format!("\"{}\": \"{}\"", leaf, escaped))
        };
        if matched {
            return Some((i as u32 + 1, line.to_string()));
        }
    }
    None
}

fn decode_base64(content: &str) -> Result<String, String> {
    let clean = content.replace('\n', "");
    let bytes = STANDARD.decode(&clean).map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

fn is_translation_file(filename: &str) -> bool {
    let lower = filename.to_lowercase();
    lower.ends_with(".json") || lower.ends_with(".yaml") || lower.ends_with(".yml")
}

async fn fetch_file_at_ref(
    api: &GitHubApi,
    owner: &str,
    repo: &str,
    path: &str,
    git_ref: &str,
) -> Option<String> {
    // Build the URL with proper percent-encoding for each path segment and the ref parameter,
    // so file names containing spaces, '#', '?', '+', etc. are handled correctly.
    let base = format!("https://api.github.com/repos/{}/{}/contents/", owner, repo);
    let mut url = reqwest::Url::parse(&base).ok()?;
    {
        let mut segs = url.path_segments_mut().ok()?;
        for seg in path.split('/') {
            segs.push(seg);
        }
    }
    url.query_pairs_mut().append_pair("ref", git_ref);

    let resp = api.get(url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let data: GhContent = resp.json().await.ok()?;
    if data.kind.as_deref() != Some("file") {
        return None;
    }
    decode_base64(&data.content?).ok()
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

/// Validate an explicit token and return the authenticated GitHub login.
/// Used only during token setup — the token is not yet in the keychain.
/// All other GitHub commands read the token from the keychain internally.
#[tauri::command]
pub async fn github_validate_token(
    http: tauri::State<'_, GitHubHttp>,
    token: String,
) -> Result<String, String> {
    let api = GitHubApi::new(&http, &token)?;
    let resp = api
        .get("https://api.github.com/user")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("GitHub auth error: {}", resp.status()));
    }
    let user: GhUser = resp.json().await.map_err(|e| e.to_string())?;
    Ok(user.login)
}

/// Return the authenticated user's login using the token stored in the OS keychain.
#[tauri::command]
pub async fn github_get_user(http: tauri::State<'_, GitHubHttp>) -> Result<String, String> {
    let api = GitHubApi::new(&http, &get_token()?)?;
    let resp = api
        .get("https://api.github.com/user")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("GitHub auth error: {}", resp.status()));
    }
    let user: GhUser = resp.json().await.map_err(|e| e.to_string())?;
    Ok(user.login)
}

/// Fetch all open translation PRs and build the key proposal index.
#[tauri::command]
pub async fn github_list_translation_prs(
    http: tauri::State<'_, GitHubHttp>,
    owner: String,
    repo: String,
) -> Result<FetchPRsResult, String> {
    crate::util::validate_github_owner(&owner)?;
    crate::util::validate_github_repo(&repo)?;
    let api = GitHubApi::new(&http, &get_token()?)?;

    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls?state=open&per_page=100",
        owner, repo
    );
    let all_prs: Vec<GhPR> = get_paginated(&api, &url)
        .await
        .map_err(|e| format!("Failed to list PRs: {e}"))?;

    // Filter to translation PRs and extract metadata before any async work.
    struct PrMeta {
        pr: GhPR,
        locale: String,
        encoded_file_path: String,
        author: String,
        author_avatar: String,
    }

    let metas: Vec<PrMeta> = all_prs
        .into_iter()
        .filter_map(|pr| {
            let without_prefix = pr.head.ref_name.strip_prefix(BRANCH_PREFIX)?;
            let slash_idx = without_prefix.find('/')?;
            let locale = without_prefix[..slash_idx].to_string();
            let encoded_file_path = without_prefix[slash_idx + 1..].to_string();
            let author = pr
                .user
                .as_ref()
                .map(|u| u.login.clone())
                .unwrap_or_else(|| "unknown".to_string());
            let author_avatar = pr
                .user
                .as_ref()
                .map(|u| u.avatar_url.clone())
                .unwrap_or_default();
            Some(PrMeta {
                pr,
                locale,
                encoded_file_path,
                author,
                author_avatar,
            })
        })
        .collect();

    // Fetch all PR file lists concurrently (bounded by the shared semaphore).
    let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT));

    let file_list_futures = metas.iter().map(|m| {
        let url = format!(
            "https://api.github.com/repos/{}/{}/pulls/{}/files?per_page=100",
            owner, repo, m.pr.number
        );
        let api = api.clone();
        let sem = semaphore.clone();
        async move {
            let _permit = sem.acquire_owned().await.ok()?;
            get_paginated::<GhPRFile>(&api, &url).await.ok()
        }
    });
    let file_lists: Vec<Option<Vec<GhPRFile>>> = join_all(file_list_futures).await;

    // For each PR, fetch all translation file contents concurrently (same semaphore).
    // Tuple: (pr_number, filename, locale, content)
    type ContentTuple = (u64, String, String, String);
    let content_futures = metas.iter().zip(file_lists.iter()).flat_map(|(m, files)| {
        let files = match files {
            Some(f) => f,
            None => return vec![],
        };
        files
            .iter()
            .filter(|f| is_translation_file(&f.filename))
            .map(|f| {
                let pr_number = m.pr.number;
                let filename = f.filename.clone();
                let locale = m.locale.clone();
                let sha = m.pr.head.sha.clone();
                let api = api.clone();
                let o = owner.clone();
                let r = repo.clone();
                let sem = semaphore.clone();
                async move {
                    let _permit = sem.acquire_owned().await.ok()?;
                    let content = fetch_file_at_ref(&api, &o, &r, &filename, &sha).await?;
                    Some((pr_number, filename, locale, content))
                }
            })
            .collect::<Vec<_>>()
    });
    let contents: Vec<Option<ContentTuple>> = join_all(content_futures).await;

    // Build output — prs Vec and proposal index — no more async work below.
    let meta_by_number: HashMap<u64, &PrMeta> = metas.iter().map(|m| (m.pr.number, m)).collect();

    let prs: Vec<TranslationPR> = metas
        .iter()
        .map(|m| TranslationPR {
            number: m.pr.number,
            title: m.pr.title.clone(),
            author: m.author.clone(),
            author_avatar_url: m.author_avatar.clone(),
            branch_name: m.pr.head.ref_name.clone(),
            locale: m.locale.clone(),
            encoded_file_path: m.encoded_file_path.clone(),
            url: m.pr.html_url.clone(),
            is_draft: m.pr.draft.unwrap_or(false),
            created_at: m.pr.created_at.clone(),
            head_sha: m.pr.head.sha.clone(),
            base_branch: m.pr.base.ref_name.clone(),
        })
        .collect();

    let mut index: HashMap<String, HashMap<String, Vec<PRProposal>>> = HashMap::new();

    for (pr_number, filename, locale, content) in contents.into_iter().flatten() {
        let m = match meta_by_number.get(&pr_number) {
            Some(m) => m,
            None => continue,
        };
        let is_yaml = crate::parsers::is_yaml_path(&filename);
        let parsed = match crate::parsers::parse_content(&content, is_yaml) {
            Ok(p) => p,
            Err(_) => continue,
        };
        let locale_idx = index.entry(locale).or_default();
        for (key, val) in parsed {
            let proposals = locale_idx.entry(key.clone()).or_default();
            if !proposals.iter().any(|p| p.pr_number == pr_number) {
                proposals.push(PRProposal {
                    key,
                    value: val.text,
                    pr_number,
                    pr_title: m.pr.title.clone(),
                    author: m.author.clone(),
                    author_avatar_url: m.author_avatar.clone(),
                    pr_url: m.pr.html_url.clone(),
                });
            }
        }
    }

    Ok(FetchPRsResult { prs, index })
}

/// Detect if a repository is a fork and return the upstream owner/repo.
/// Returns None if the repo is not a fork or the API call fails.
#[tauri::command]
pub async fn github_detect_fork(
    http: tauri::State<'_, GitHubHttp>,
    owner: String,
    repo: String,
) -> Result<Option<ForkInfo>, String> {
    crate::util::validate_github_owner(&owner)?;
    crate::util::validate_github_repo(&repo)?;
    let api = GitHubApi::new(&http, &get_token()?)?;
    let url = format!("https://api.github.com/repos/{}/{}", owner, repo);
    let resp = match api.get(&url).send().await {
        Ok(r) if r.status().is_success() => r,
        _ => return Ok(None),
    };
    let gh_repo: GhRepo = match resp.json().await {
        Ok(r) => r,
        Err(_) => return Ok(None),
    };
    if gh_repo.fork != Some(true) {
        return Ok(None);
    }
    let parent = match gh_repo.parent {
        Some(p) => p,
        None => return Ok(None),
    };
    let mut parts = parent.full_name.splitn(2, '/');
    let upstream_owner = parts.next().unwrap_or("").to_string();
    let upstream_repo = parts.next().unwrap_or("").to_string();
    if upstream_owner.is_empty() || upstream_repo.is_empty() {
        return Ok(None);
    }
    Ok(Some(ForkInfo {
        upstream_owner,
        upstream_repo,
    }))
}

/// Create a pull request. Detects the default branch automatically.
/// `head_owner` is the owner of the branch being merged — for cross-fork PRs this
/// is the fork owner, so GitHub receives `"head": "forkowner:branchname"`.
#[tauri::command]
pub async fn github_create_pr(
    http: tauri::State<'_, GitHubHttp>,
    owner: String,
    repo: String,
    title: String,
    head_owner: String,
    branch: String,
    body: String,
) -> Result<String, String> {
    crate::util::validate_github_owner(&owner)?;
    crate::util::validate_github_repo(&repo)?;
    crate::util::validate_github_owner(&head_owner)?;
    crate::util::validate_branch_name(&branch)?;
    let api = GitHubApi::new(&http, &get_token()?)?;

    // Detect the default branch
    let repo_url = format!("https://api.github.com/repos/{}/{}", owner, repo);
    let base_branch = match api.get(&repo_url).send().await {
        Ok(r) if r.status().is_success() => r
            .json::<GhRepo>()
            .await
            .map(|r| r.default_branch)
            .unwrap_or_else(|_| "main".to_string()),
        _ => "main".to_string(),
    };

    // For cross-fork PRs, head must be "forkowner:branchname"; for same-repo PRs it's just "branchname"
    let head_ref = if head_owner == owner {
        branch.clone()
    } else {
        format!("{}:{}", head_owner, branch)
    };

    let url = format!("https://api.github.com/repos/{}/{}/pulls", owner, repo);
    let payload = serde_json::json!({
        "title": title,
        "head": head_ref,
        "base": base_branch,
        "body": body,
    });

    let resp = api
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        // Extract the `message` field from GitHub's standard error shape rather than
        // dumping the raw body (which may include OAuth scope details).
        let err_body: serde_json::Value = resp.json().await.unwrap_or_default();
        let msg = err_body["message"]
            .as_str()
            .unwrap_or("unknown error")
            .to_string();
        return Err(format!("Failed to create PR ({status}): {msg}"));
    }

    let pr: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    pr["html_url"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Missing PR URL in response".to_string())
}

/// Inline review comment for a specific line in a PR file.
/// `line` must be > 0; entries with line == 0 are silently skipped.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewComment {
    pub path: String,
    pub line: u32,
    pub body: String,
}

/// Review event type. Serde rejects any value outside this set at deserialization
/// time, so no manual allowlist check is needed in the function body.
#[derive(serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub(crate) enum ReviewEvent {
    Approve,
    Comment,
    RequestChanges,
}

impl ReviewEvent {
    fn as_str(&self) -> &'static str {
        match self {
            ReviewEvent::Approve => "APPROVE",
            ReviewEvent::Comment => "COMMENT",
            ReviewEvent::RequestChanges => "REQUEST_CHANGES",
        }
    }
}

/// Submit a PR review with optional inline comments (suggestions or plain comments).
/// `event` must be one of APPROVE / COMMENT / REQUEST_CHANGES.
/// `comments` entries with `line == 0` are silently skipped (line not in diff).
/// `commit_id` is only included in the payload when there are valid inline comments.
#[allow(clippy::too_many_arguments)] // Tauri commands receive each IPC field as a separate argument
#[tauri::command]
pub async fn github_submit_review(
    http: tauri::State<'_, GitHubHttp>,
    owner: String,
    repo: String,
    pr_number: u64,
    commit_id: String,
    event: ReviewEvent,
    body: String,
    comments: Vec<ReviewComment>,
) -> Result<(), String> {
    crate::util::validate_github_owner(&owner)?;
    crate::util::validate_github_repo(&repo)?;
    if !commit_id.is_empty() {
        crate::util::validate_git_sha(&commit_id)?;
    }
    for comment in &comments {
        if comment.path.is_empty() || comment.path.len() > 4096 {
            return Err("Review comment path must be 1-4096 characters".to_string());
        }
        if comment.path.contains("..") {
            return Err("Review comment path must not contain '..'".to_string());
        }
        if comment.body.len() > 65536 {
            return Err("Review comment body must not exceed 65536 characters".to_string());
        }
    }
    let api = GitHubApi::new(&http, &get_token()?)?;
    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{}/reviews",
        owner, repo, pr_number
    );

    let inline: Vec<serde_json::Value> = comments
        .iter()
        .filter(|c| c.line > 0)
        .map(|c| {
            serde_json::json!({
                "path": c.path,
                "line": c.line,
                "side": "RIGHT",
                "body": c.body,
            })
        })
        .collect();

    let mut payload = serde_json::json!({
        "event": event.as_str(),
        "body": body,
    });
    if !inline.is_empty() {
        payload["commit_id"] = serde_json::Value::String(commit_id);
        payload["comments"] = serde_json::Value::Array(inline);
    }

    let resp = api
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_body: serde_json::Value = resp.json().await.unwrap_or_default();
        let msg = err_body["message"]
            .as_str()
            .unwrap_or("unknown error")
            .to_string();
        return Err(format!("Failed to submit review ({status}): {msg}"));
    }
    Ok(())
}

/// Find an open PR for a specific branch. Returns the PR HTML URL, or None if not found.
/// `head_owner` is the fork owner (or same as `owner` for non-fork repos).
#[tauri::command]
pub async fn github_find_pr_for_branch(
    http: tauri::State<'_, GitHubHttp>,
    owner: String,
    repo: String,
    head_owner: String,
    branch: String,
) -> Result<Option<String>, String> {
    crate::util::validate_github_owner(&owner)?;
    crate::util::validate_github_repo(&repo)?;
    crate::util::validate_github_owner(&head_owner)?;
    crate::util::validate_branch_name(&branch)?;
    let api = GitHubApi::new(&http, &get_token()?)?;
    // GitHub's `head` filter always expects "owner:branch" format.
    let head_spec = format!("{}:{}", head_owner, branch);
    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls?state=open&head={}&per_page=1",
        owner, repo, head_spec
    );
    let resp = match api.get(&url).send().await {
        Ok(r) if r.status().is_success() => r,
        _ => return Ok(None),
    };
    let prs: Vec<serde_json::Value> = resp.json().await.unwrap_or_default();
    Ok(prs
        .first()
        .and_then(|pr| pr["html_url"].as_str().map(|s| s.to_string())))
}

/// Fetch all changed files in a PR and return parsed key comparison rows.
/// `source_path` is the source-language file path (e.g. `src/i18n/locales/en.json`)
/// used to populate the "Source" column. Pass an empty string if unknown.
#[tauri::command]
pub async fn github_fetch_pr_review_data(
    http: tauri::State<'_, GitHubHttp>,
    owner: String,
    repo: String,
    pr_number: u64,
    head_sha: String,
    base_branch: String,
    source_path: String,
) -> Result<Vec<PRReviewFile>, String> {
    crate::util::validate_github_owner(&owner)?;
    crate::util::validate_github_repo(&repo)?;
    crate::util::validate_git_sha(&head_sha)?;
    crate::util::validate_branch_name(&base_branch)?;
    let api = GitHubApi::new(&http, &get_token()?)?;

    let files_url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{}/files?per_page=100",
        owner, repo, pr_number
    );
    let files: Vec<GhPRFile> = get_paginated(&api, &files_url)
        .await
        .map_err(|e| format!("Failed to fetch PR files: {e}"))?;

    // Fetch the source-language file once (used as the "Source" column for all rows).
    let source_is_yaml = crate::parsers::is_yaml_path(&source_path);
    let source_keys = if !source_path.is_empty() {
        fetch_file_at_ref(&api, &owner, &repo, &source_path, &base_branch)
            .await
            .and_then(|c| crate::parsers::parse_content(&c, source_is_yaml).ok())
            .unwrap_or_default()
    } else {
        Default::default()
    };

    let mut result = Vec::new();

    for file in files.iter().filter(|f| is_translation_file(&f.filename)) {
        let is_yaml = crate::parsers::is_yaml_path(&file.filename);

        // Fetch previous (base branch) and new (head SHA) concurrently.
        let (prev_content, translated_content) = tokio::join!(
            fetch_file_at_ref(&api, &owner, &repo, &file.filename, &base_branch),
            fetch_file_at_ref(&api, &owner, &repo, &file.filename, &head_sha),
        );

        // If the PR's version can't be fetched, skip the file entirely.
        let translated_content = match translated_content {
            Some(c) => c,
            None => continue,
        };

        let is_new_file = prev_content.is_none();
        let prev_keys = prev_content
            .and_then(|c| crate::parsers::parse_content(&c, is_yaml).ok())
            .unwrap_or_default();
        let translated_keys =
            crate::parsers::parse_content(&translated_content, is_yaml).unwrap_or_default();

        let rows: Vec<KeyRow> = translated_keys
            .into_iter()
            .map(|(key, val)| {
                let source = source_keys
                    .get(&key)
                    .map(|v| v.text.clone())
                    .unwrap_or_default();
                let previous = prev_keys.get(&key).map(|v| v.text.clone());
                let (line, raw_line) = find_key_line(&translated_content, &key, &val.text, is_yaml)
                    .unwrap_or((0, String::new()));
                KeyRow {
                    key,
                    source,
                    previous,
                    translated: val.text,
                    line,
                    raw_line,
                    path: file.filename.clone(),
                }
            })
            .collect();

        result.push(PRReviewFile {
            filename: file.filename.clone(),
            is_new_file,
            rows,
        });
    }

    Ok(result)
}
