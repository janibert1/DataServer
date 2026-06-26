use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::Emitter;
use walkdir::WalkDir;

// ── Types ──────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderConfig {
    pub path: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Config {
    pub server_url: String,
    pub api_token: String,
    pub source_name: String,
    pub folders: Vec<FolderConfig>,
    pub excludes: Vec<String>,
    pub auto_sync_minutes: u32,
    pub last_sync: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncProgress {
    pub current: u64,
    pub total: u64,
    pub current_file: String,
    pub errors: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncResult {
    pub uploaded: u64,
    pub skipped: u64,
    pub errors: u64,
}

// ── Paths ──────────────────────────────────────────────────────────────────

fn config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("dataserver-backup")
}

fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

fn state_db_path() -> PathBuf {
    config_dir().join("state.db")
}

// ── Helpers ────────────────────────────────────────────────────────────────

fn open_state_db() -> Result<rusqlite::Connection, String> {
    let path = state_db_path();
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS synced_files (
            path     TEXT PRIMARY KEY,
            checksum TEXT NOT NULL,
            synced_at TEXT NOT NULL
        );",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn should_exclude(name: &str, excludes: &[String]) -> bool {
    // Hard-coded defaults
    const ALWAYS: &[&str] = &[
        "node_modules", ".git", "__pycache__", ".DS_Store",
        "target", ".cargo", ".cache", "Thumbs.db",
    ];
    if ALWAYS.contains(&name) {
        return true;
    }
    for pattern in excludes {
        if pattern.starts_with('*') {
            if name.ends_with(&pattern[1..]) {
                return true;
            }
        } else if name == pattern.as_str() {
            return true;
        }
    }
    false
}

fn checksum_file(path: &std::path::Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let mut h = Sha256::new();
    h.update(&bytes);
    Ok(hex::encode(h.finalize()))
}

// ── Tauri commands ─────────────────────────────────────────────────────────

#[tauri::command]
async fn load_config() -> Result<Option<Config>, String> {
    let p = config_path();
    if !p.exists() {
        return Ok(None);
    }
    let s = tokio::fs::read_to_string(&p).await.map_err(|e| e.to_string())?;
    let cfg: Config = serde_json::from_str(&s).map_err(|e| e.to_string())?;
    Ok(Some(cfg))
}

#[tauri::command]
async fn save_config(config: Config) -> Result<(), String> {
    let p = config_path();
    tokio::fs::create_dir_all(p.parent().unwrap())
        .await
        .map_err(|e| e.to_string())?;
    let s = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    tokio::fs::write(&p, s).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_hostname() -> String {
    hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "my-computer".to_string())
}

#[tauri::command]
async fn test_connection(server_url: String, api_token: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{}/api/backup", server_url.trim_end_matches('/'));
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_token))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    match resp.status().as_u16() {
        200 | 204 => Ok("ok".to_string()),
        401 => Err("Invalid API token".to_string()),
        403 => Err("Access denied".to_string()),
        code => Err(format!("Server returned {}", code)),
    }
}

#[tauri::command]
async fn count_files(folders: Vec<String>, excludes: Vec<String>) -> Result<u64, String> {
    tokio::task::spawn_blocking(move || {
        let mut total = 0u64;
        for folder in &folders {
            for entry in WalkDir::new(folder)
                .into_iter()
                .filter_entry(|e| !should_exclude(&e.file_name().to_string_lossy(), &excludes))
                .flatten()
            {
                if entry.file_type().is_file() {
                    total += 1;
                }
            }
        }
        Ok(total)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn sync_now(
    app: tauri::AppHandle,
    server_url: String,
    api_token: String,
    source_name: String,
    folders: Vec<String>,
    excludes: Vec<String>,
) -> Result<SyncResult, String> {
    // Count total files first for progress reporting
    let total = count_files(folders.clone(), excludes.clone()).await?;

    tokio::task::spawn_blocking(move || {
        let db = open_state_db()?;
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .map_err(|e| e.to_string())?;

        let upload_url = format!("{}/api/backup/upload", server_url.trim_end_matches('/'));
        let mut uploaded = 0u64;
        let mut skipped = 0u64;
        let mut errors = 0u64;
        let mut current = 0u64;

        for folder in &folders {
            let excl = excludes.clone();
            for entry in WalkDir::new(folder)
                .into_iter()
                .filter_entry(|e| !should_exclude(&e.file_name().to_string_lossy(), &excl))
                .flatten()
            {
                if !entry.file_type().is_file() {
                    continue;
                }

                let path = entry.path();
                let path_str = path.to_string_lossy().to_string();
                current += 1;

                let _ = app.emit(
                    "sync-progress",
                    SyncProgress {
                        current,
                        total,
                        current_file: path_str.clone(),
                        errors,
                    },
                );

                // Checksum
                let checksum = match checksum_file(path) {
                    Ok(c) => c,
                    Err(_) => {
                        errors += 1;
                        continue;
                    }
                };

                // Check state db
                let existing: Option<String> = db
                    .query_row(
                        "SELECT checksum FROM synced_files WHERE path = ?1",
                        rusqlite::params![&path_str],
                        |row| row.get(0),
                    )
                    .ok();

                if existing.as_deref() == Some(&checksum) {
                    skipped += 1;
                    continue;
                }

                // Read & upload
                let bytes = match std::fs::read(path) {
                    Ok(b) => b,
                    Err(_) => {
                        errors += 1;
                        continue;
                    }
                };

                let file_name = entry.file_name().to_string_lossy().to_string();
                let part = match reqwest::blocking::multipart::Part::bytes(bytes)
                    .file_name(file_name)
                    .mime_str("application/octet-stream")
                {
                    Ok(p) => p,
                    Err(_) => {
                        errors += 1;
                        continue;
                    }
                };

                let form = reqwest::blocking::multipart::Form::new()
                    .part("file", part)
                    .text("remotePath", path_str.clone())
                    .text("source", source_name.clone());

                match client
                    .post(&upload_url)
                    .header("Authorization", format!("Bearer {}", api_token))
                    .multipart(form)
                    .send()
                {
                    Ok(resp) if resp.status().is_success() => {
                        let now = chrono_now();
                        let _ = db.execute(
                            "INSERT OR REPLACE INTO synced_files (path, checksum, synced_at) \
                             VALUES (?1, ?2, ?3)",
                            rusqlite::params![&path_str, &checksum, &now],
                        );
                        uploaded += 1;
                    }
                    _ => {
                        errors += 1;
                    }
                }
            }
        }

        Ok(SyncResult { uploaded, skipped, errors })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Format as ISO 8601 without external dep
    let (y, mo, d, h, mi, s) = secs_to_datetime(secs);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, mo, d, h, mi, s)
}

fn secs_to_datetime(secs: u64) -> (u64, u64, u64, u64, u64, u64) {
    let s = secs % 60;
    let total_min = secs / 60;
    let mi = total_min % 60;
    let total_h = total_min / 60;
    let h = total_h % 24;
    let total_days = total_h / 24;
    // Approximate — good enough for a "synced_at" timestamp
    let y = 1970 + total_days / 365;
    let rem = total_days % 365;
    let mo = rem / 30 + 1;
    let d = rem % 30 + 1;
    (y, mo, d, h, mi, s)
}

// ── App entry ──────────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            get_hostname,
            test_connection,
            count_files,
            sync_now,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
