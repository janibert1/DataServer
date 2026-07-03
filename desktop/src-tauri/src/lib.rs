use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::{Emitter, Manager};

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
    #[serde(default = "default_true")]
    pub sync_on_startup: bool,
    #[serde(default)]
    pub max_file_size_mb: u64,
    #[serde(default = "default_smart_excludes")]
    pub smart_excludes: Vec<String>,
}

fn default_true() -> bool { true }
fn default_smart_excludes() -> Vec<String> {
    vec!["package_caches".into(), "build_artifacts".into(), "caches_temp".into()]
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SmartExcludeCategory {
    pub id: String,
    pub label: String,
    pub description: String,
    pub icon: String,
    pub patterns: Vec<String>,
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

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceAuthUser {
    pub email: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceAuthPollResult {
    pub status: String,
    pub token: Option<String>,
    pub user: Option<DeviceAuthUser>,
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

// Read config synchronously (for background threads)
fn read_config() -> Result<Config, String> {
    let p = config_path();
    if !p.exists() {
        return Err("No config file".into());
    }
    let s = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
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

fn should_exclude(path: &std::path::Path, name: &str, excludes: &[String]) -> bool {
    const ALWAYS: &[&str] = &[
        "node_modules", ".git", "__pycache__", ".DS_Store",
        "target", ".cargo", ".cache", "Thumbs.db",
    ];
    if ALWAYS.contains(&name) {
        return true;
    }

    let home = dirs::home_dir().unwrap_or_default();
    let path_str = path.to_string_lossy();

    for pattern in excludes {
        if pattern.starts_with('/') {
            if path_str.starts_with(pattern.as_str()) {
                return true;
            }
            continue;
        }
        if pattern.starts_with('~') {
            let expanded = home.join(&pattern[2..]);
            if path.starts_with(&expanded) {
                return true;
            }
            continue;
        }
        if pattern.starts_with('*') {
            if name.ends_with(&pattern[1..]) {
                return true;
            }
            continue;
        }
        if pattern.contains('/') {
            if path_str.contains(pattern.as_str()) {
                return true;
            }
        } else {
            for component in path.components() {
                if component.as_os_str().to_string_lossy() == pattern.as_str() {
                    return true;
                }
            }
        }
    }
    false
}

fn expand_smart_excludes(active_ids: &[String]) -> Vec<String> {
    let cats = smart_exclude_categories();
    let mut patterns: Vec<String> = Vec::new();
    for cat in &cats {
        if active_ids.contains(&cat.id) {
            patterns.extend(cat.patterns.clone());
        }
    }
    patterns
}

fn smart_exclude_categories() -> Vec<SmartExcludeCategory> {
    vec![
        SmartExcludeCategory {
            id: "package_caches".into(),
            label: "Package Caches".into(),
            description: "node_modules, pip, cargo registry, gems, etc.".into(),
            icon: "📦".into(),
            patterns: vec![
                "node_modules".into(), ".npm".into(), "__pycache__".into(),
                "*.pyc".into(), ".cargo/registry".into(), ".cargo/git".into(),
                ".rustup/toolchains".into(), "*.egg-info".into(), ".tox".into(),
                "venv".into(), ".venv".into(), ".gradle".into(), ".m2".into(),
            ],
        },
        SmartExcludeCategory {
            id: "build_artifacts".into(),
            label: "Build Artifacts".into(),
            description: "Compiled output: target/, dist/, .next/, etc.".into(),
            icon: "🔨".into(),
            patterns: vec![
                "target".into(), "dist".into(), "build".into(), ".next".into(),
                "out".into(), ".nuxt".into(), ".output".into(), "*.class".into(),
                ".cache".into(), ".parcel-cache".into(), ".turbo".into(),
            ],
        },
        SmartExcludeCategory {
            id: "games_apps".into(),
            label: "Games & Large Apps".into(),
            description: "Steam, Flatpak app data, Lutris, game files".into(),
            icon: "🎮".into(),
            patterns: vec![
                ".steam".into(), "Steam".into(), ".local/share/Steam".into(),
                ".var/app".into(), "snap".into(), "*.AppImage".into(),
                ".local/share/lutris".into(), "Games".into(),
                ".local/share/bottles".into(),
            ],
        },
        SmartExcludeCategory {
            id: "caches_temp".into(),
            label: "Caches & Temp".into(),
            description: "Browser caches, thumbnails, trash, temp files".into(),
            icon: "🗑️".into(),
            patterns: vec![
                ".cache".into(), "Cache".into(), "Caches".into(),
                ".Trash".into(), ".thumbnails".into(), "tmp".into(),
                "Temp".into(), "*.tmp".into(), ".DS_Store".into(),
                "thumbs.db".into(), ".local/share/recently-used.xbel".into(),
            ],
        },
        SmartExcludeCategory {
            id: "downloads".into(),
            label: "Downloads Folder".into(),
            description: "Skip ~/Downloads entirely".into(),
            icon: "📥".into(),
            patterns: vec!["Downloads".into()],
        },
    ]
}

fn checksum_file(path: &std::path::Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let mut h = Sha256::new();
    h.update(&bytes);
    Ok(hex::encode(h.finalize()))
}

// ── Core sync logic ────────────────────────────────────────────────────────

async fn do_sync(
    app: tauri::AppHandle,
    server_url: String,
    api_token: String,
    source_name: String,
    folders: Vec<String>,
    all_excludes: Vec<String>,
    max_file_size_mb: u64,
) -> Result<SyncResult, String> {
    let count_excludes = all_excludes.clone();
    let count_folders = folders.clone();
    let total: u64 = tokio::task::spawn_blocking(move || {
        let mut t = 0u64;
        for folder in &count_folders {
            for entry in WalkDir::new(folder)
                .into_iter()
                .filter_entry(|e| !should_exclude(e.path(), &e.file_name().to_string_lossy(), &count_excludes))
                .flatten()
            {
                if entry.file_type().is_file() { t += 1; }
            }
        }
        t
    })
    .await
    .map_err(|e| e.to_string())?;

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
            let excl = all_excludes.clone();
            for entry in WalkDir::new(folder)
                .into_iter()
                .filter_entry(|e| !should_exclude(e.path(), &e.file_name().to_string_lossy(), &excl))
                .flatten()
            {
                if !entry.file_type().is_file() { continue; }

                let path = entry.path();
                let path_str = path.to_string_lossy().to_string();
                current += 1;

                let _ = app.emit(
                    "sync-progress",
                    SyncProgress { current, total, current_file: path_str.clone(), errors },
                );

                if max_file_size_mb > 0 {
                    if let Ok(meta) = std::fs::metadata(path) {
                        if meta.len() > max_file_size_mb * 1024 * 1024 {
                            skipped += 1;
                            continue;
                        }
                    }
                }

                let checksum = match checksum_file(path) {
                    Ok(c) => c,
                    Err(_) => { errors += 1; continue; }
                };

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

                let bytes = match std::fs::read(path) {
                    Ok(b) => b,
                    Err(_) => { errors += 1; continue; }
                };

                let file_name = entry.file_name().to_string_lossy().to_string();
                let part = match reqwest::blocking::multipart::Part::bytes(bytes)
                    .file_name(file_name)
                    .mime_str("application/octet-stream")
                {
                    Ok(p) => p,
                    Err(_) => { errors += 1; continue; }
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
                    _ => { errors += 1; }
                }
            }
        }

        Ok(SyncResult { uploaded, skipped, errors })
    })
    .await
    .map_err(|e| e.to_string())?
}

// Background sync loop — runs as a tokio task from setup
fn start_background_sync(app: tauri::AppHandle) {
    tokio::spawn(async move {
        // Wait 30s after startup before first sync
        tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
        loop {
            let config = match read_config() {
                Ok(c) => c,
                Err(_) => {
                    tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
                    continue;
                }
            };
            if config.sync_on_startup && config.auto_sync_minutes > 0 {
                let enabled: Vec<String> = config.folders.iter()
                    .filter(|f| f.enabled)
                    .map(|f| f.path.clone())
                    .collect();
                if !enabled.is_empty() {
                    let mut all_excl = config.excludes.clone();
                    all_excl.extend(expand_smart_excludes(&config.smart_excludes));
                    let _ = do_sync(
                        app.clone(),
                        config.server_url.clone(),
                        config.api_token.clone(),
                        config.source_name.clone(),
                        enabled,
                        all_excl,
                        config.max_file_size_mb,
                    ).await;
                    // Save last_sync timestamp
                    if let Ok(mut cfg) = read_config() {
                        cfg.last_sync = Some(chrono_now());
                        if let Ok(s) = serde_json::to_string_pretty(&cfg) {
                            let _ = std::fs::write(config_path(), s);
                        }
                    }
                }
                let minutes = config.auto_sync_minutes;
                tokio::time::sleep(tokio::time::Duration::from_secs(minutes as u64 * 60)).await;
            } else {
                tokio::time::sleep(tokio::time::Duration::from_secs(300)).await;
            }
        }
    });
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
fn get_home_dir() -> String {
    dirs::home_dir()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
fn get_smart_exclude_categories() -> Vec<SmartExcludeCategory> {
    smart_exclude_categories()
}

#[tauri::command]
async fn setup_autostart() -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let autostart_dir = home.join(".config").join("autostart");
    tokio::fs::create_dir_all(&autostart_dir).await.map_err(|e| e.to_string())?;
    let desktop_file = autostart_dir.join("dataserver-backup.desktop");
    let content = "[Desktop Entry]\nType=Application\nName=DataServer Backup\nExec=/usr/bin/dataserver-backup\nHidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=true\nComment=Automatically back up folders to DataServer\n";
    tokio::fs::write(&desktop_file, content).await.map_err(|e| e.to_string())?;
    Ok(())
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
async fn poll_device_auth(server_url: String, code: String) -> Result<DeviceAuthPollResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "{}/api/tokens/device/{}/poll",
        server_url.trim_end_matches('/'),
        code
    );
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Server returned {}", resp.status().as_u16()));
    }

    resp.json::<DeviceAuthPollResult>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn count_files(folders: Vec<String>, excludes: Vec<String>) -> Result<u64, String> {
    tokio::task::spawn_blocking(move || {
        let mut total = 0u64;
        for folder in &folders {
            for entry in WalkDir::new(folder)
                .into_iter()
                .filter_entry(|e| !should_exclude(e.path(), &e.file_name().to_string_lossy(), &excludes))
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
    max_file_size_mb: u64,
    smart_excludes: Vec<String>,
) -> Result<SyncResult, String> {
    let mut all_excludes = excludes.clone();
    all_excludes.extend(expand_smart_excludes(&smart_excludes));
    do_sync(app, server_url, api_token, source_name, folders, all_excludes, max_file_size_mb).await
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
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
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // If config exists and is complete, start hidden + begin background sync
            if let Ok(config) = read_config() {
                if !config.server_url.is_empty() && !config.api_token.is_empty() {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.hide();
                    }
                    start_background_sync(app.handle().clone());
                }
            }

            // System tray
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

            let open = MenuItem::with_id(app, "open", "Open DataServer Backup", true, None::<&str>)?;
            let sync = MenuItem::with_id(app, "sync", "Sync Now", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &sync, &quit])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("DataServer Backup")
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "sync" => {
                        if let Ok(config) = read_config() {
                            let app2 = app.clone();
                            let enabled: Vec<String> = config.folders.iter()
                                .filter(|f| f.enabled)
                                .map(|f| f.path.clone())
                                .collect();
                            if !enabled.is_empty() {
                                let mut all_excl = config.excludes.clone();
                                all_excl.extend(expand_smart_excludes(&config.smart_excludes));
                                tokio::spawn(async move {
                                    let _ = do_sync(
                                        app2,
                                        config.server_url,
                                        config.api_token,
                                        config.source_name,
                                        enabled,
                                        all_excl,
                                        config.max_file_size_mb,
                                    ).await;
                                });
                            }
                        }
                    }
                    "quit" => { app.exit(0); }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            get_hostname,
            get_home_dir,
            get_smart_exclude_categories,
            setup_autostart,
            test_connection,
            poll_device_auth,
            count_files,
            sync_now,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
