//! Fork patch: start-up housekeeping and the cache limits set in Settings → Storage.
//! - Removes the installers that past in-app updates left behind. The updater
//!   unpacks each one into `%TEMP%\Psysonic-<version>-updater-<random>\` and runs
//!   it after the app exits, so it cannot delete it itself.
//! - Cache limits live in `<app data>/fork-settings.json` (Rust cannot read the
//!   webview's storage). The cover cache is trimmed here, before it is opened,
//!   least recently written covers first; the background clips limit is read by
//!   `fork_clips` whenever a clip is saved.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;

use tauri::Manager;

const MB: u64 = 1024 * 1024;
/// 0 = no limit.
static COVER_LIMIT_MB: AtomicU64 = AtomicU64::new(0);
static CLIPS_LIMIT_MB: AtomicU64 = AtomicU64::new(600);

pub(crate) fn clips_limit_bytes() -> u64 {
    CLIPS_LIMIT_MB.load(Ordering::Relaxed) * MB
}

fn settings_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("fork-settings.json"))
}

/// Runs first in `setup`, before the cover cache is opened.
pub(crate) fn run(app: &tauri::AppHandle) {
    remove_old_update_installers();
    let saved = settings_file(app)
        .and_then(|f| std::fs::read_to_string(f).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
    if let Some(v) = saved {
        if let Some(mb) = v["coverCacheMb"].as_u64() {
            COVER_LIMIT_MB.store(mb, Ordering::Relaxed);
        }
        if let Some(mb) = v["clipsCacheMb"].as_u64() {
            CLIPS_LIMIT_MB.store(mb, Ordering::Relaxed);
        }
    }
    let cover_limit = COVER_LIMIT_MB.load(Ordering::Relaxed) * MB;
    if cover_limit > 0 {
        if let Ok(root) = crate::cover_cache::cover_cache_root(app) {
            trim_cover_cache(&root, cover_limit);
        }
    }
}

/// Save the limits (MB; covers 0 = no limit). Covers are trimmed on the next start, clips right away.
#[tauri::command]
#[specta::specta]
pub(crate) fn fork_set_cache_limits(app: tauri::AppHandle, cover_mb: u32, clips_mb: u32) -> Result<(), String> {
    COVER_LIMIT_MB.store(u64::from(cover_mb), Ordering::Relaxed);
    let clips_mb = clips_mb.max(50); // 0 would re-download every clip on each view
    CLIPS_LIMIT_MB.store(u64::from(clips_mb), Ordering::Relaxed);
    let file = settings_file(&app).ok_or("no app data folder")?;
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let body = serde_json::json!({ "coverCacheMb": cover_mb, "clipsCacheMb": clips_mb });
    std::fs::write(&file, body.to_string()).map_err(|e| e.to_string())?;
    crate::fork_clips::evict_clips(&app);
    Ok(())
}

/// The webview's own caches (web cache, compiled scripts, GPU shaders); never
/// its storage, which holds the settings.
const WEBVIEW_CACHES: [&str; 3] = ["Cache", "Code Cache", "GPUCache"];

fn webview_profile(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("EBWebView").join("Default"))
}

fn dir_size(dir: &Path) -> u64 {
    let Ok(read) = std::fs::read_dir(dir) else { return 0 };
    read.flatten()
        .map(|e| match e.metadata() {
            Ok(m) if m.is_dir() => dir_size(&e.path()),
            Ok(m) => m.len(),
            Err(_) => 0,
        })
        .sum()
}

/// Bytes of the webview caches that "Clear browser cache" removes.
#[tauri::command]
#[specta::specta]
pub(crate) fn fork_webview_cache_size(app: tauri::AppHandle) -> Result<u64, String> {
    let profile = webview_profile(&app)?;
    Ok(WEBVIEW_CACHES.iter().map(|d| dir_size(&profile.join(d))).sum())
}

/// The webview keeps its cache files open while the app runs, so a small script
/// waits for Psysonic to close, deletes the caches and starts it again; the app
/// then quits. Windows only (the other platforms keep their caches elsewhere).
#[tauri::command]
#[specta::specta]
pub(crate) fn fork_clear_webview_cache(app: tauri::AppHandle) -> Result<(), String> {
    clear_webview_cache(&app)
}

#[cfg(windows)]
fn clear_webview_cache(app: &tauri::AppHandle) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let profile = webview_profile(app)?;
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let pid = std::process::id();
    // CRLF line ends for `goto`; `ping` as the pause, since `timeout` fails without a console.
    // The paths come in as environment variables: cmd reads the file in the OEM code
    // page, so a name like "Jürgen" (or a `%`) written into the script would break.
    let mut lines = vec![
        "@echo off".to_string(),
        ":wait".to_string(),
        format!("tasklist /FI \"PID eq {pid}\" | find \"{pid}\" >nul && (ping -n 2 127.0.0.1 >nul & goto wait)"),
        "ping -n 4 127.0.0.1 >nul".to_string(),
    ];
    let mut command = std::process::Command::new("cmd");
    for (i, d) in WEBVIEW_CACHES.iter().enumerate() {
        command.env(format!("PSY_CACHE{i}"), profile.join(d));
        lines.push(format!("rmdir /s /q \"%PSY_CACHE{i}%\""));
    }
    command.env("PSY_EXE", &exe);
    lines.push("start \"\" \"%PSY_EXE%\"".to_string());
    lines.push("(goto) 2>nul & del \"%~f0\"".to_string());
    let script = lines.join("\r\n") + "\r\n";
    let file = std::env::temp_dir().join(format!("psysonic-clear-cache-{pid}.cmd"));
    std::fs::write(&file, script).map_err(|e| e.to_string())?;
    command
        .arg("/c")
        .arg(&file)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

#[cfg(not(windows))]
fn clear_webview_cache(_app: &tauri::AppHandle) -> Result<(), String> {
    Err("only on Windows".to_string())
}

fn remove_old_update_installers() {
    std::thread::spawn(|| {
        let Ok(read) = std::fs::read_dir(std::env::temp_dir()) else { return };
        for entry in read.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if is_update_folder(&name) && entry.path().is_dir() {
                let _ = std::fs::remove_dir_all(entry.path());
            }
        }
    });
}

fn is_update_folder(name: &str) -> bool {
    name.starts_with("Psysonic-") && name.contains("-updater-")
}

/// One cover (a folder of `.webp` sizes): bytes and when it was last written.
fn cover_folders(dir: &Path, out: &mut Vec<(SystemTime, u64, PathBuf)>) {
    let Ok(read) = std::fs::read_dir(dir) else { return };
    let (mut bytes, mut newest, mut has_webp) = (0u64, SystemTime::UNIX_EPOCH, false);
    for entry in read.flatten() {
        let path = entry.path();
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            cover_folders(&path, out);
        } else if path.extension().is_some_and(|x| x == "webp") {
            has_webp = true;
            bytes += meta.len();
            newest = newest.max(meta.modified().unwrap_or(SystemTime::UNIX_EPOCH));
        }
    }
    if has_webp {
        out.push((newest, bytes, dir.to_path_buf()));
    }
}

fn trim_cover_cache(root: &Path, limit: u64) {
    let mut covers = Vec::new();
    cover_folders(root, &mut covers);
    let mut total: u64 = covers.iter().map(|c| c.1).sum();
    covers.sort();
    for (_, bytes, dir) in covers {
        if total <= limit {
            break;
        }
        if std::fs::remove_dir_all(&dir).is_ok() {
            total -= bytes;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_only_updater_folders() {
        assert!(is_update_folder("Psysonic-1.56.0-updater-4qjx7u"));
        assert!(!is_update_folder("psysonic-cli.log"));
        assert!(!is_update_folder("Psysonic-1.56.0"));
        assert!(!is_update_folder("Other-1.0-updater-abc"));
    }

    #[test]
    fn trims_the_oldest_covers_until_under_the_limit() {
        let root = std::env::temp_dir().join(format!(
            "psysonic-fork-trim-{}",
            SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_nanos()
        ));
        for (name, age) in [("old", 300u64), ("mid", 200), ("new", 100)] {
            let dir = root.join("server").join("album").join(name);
            std::fs::create_dir_all(&dir).unwrap();
            let file = dir.join("128.webp");
            std::fs::write(&file, vec![0u8; 1000]).unwrap();
            let when = SystemTime::now() - std::time::Duration::from_secs(age);
            std::fs::File::options().append(true).open(&file).unwrap().set_modified(when).unwrap();
        }
        std::fs::write(root.join(".storage-layout"), b"keep").unwrap();
        trim_cover_cache(&root, 2000);
        assert!(!root.join("server/album/old").exists());
        assert!(root.join("server/album/mid").exists());
        assert!(root.join("server/album/new").exists());
        assert!(root.join(".storage-layout").exists());
        let _ = std::fs::remove_dir_all(&root);
    }
}
