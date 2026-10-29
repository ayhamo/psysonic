//! Fork patch: animated covers.
//! - `fork_set_animated_covers` switches the animated WebP covers in the cover
//!   cache on or off (see `cover_cache::fork_animated`).
//! - `fork_song_background_clip` fetches a song's background clip
//!   (`<song file name>.background.mp4`, served next to the song at
//!   `<server>/rest/x-clip/<folder>/<file>` behind Navidrome's login) and keeps
//!   it on disk, so each clip crosses the network once per device. A missing
//!   clip is remembered for a week; the folder is capped at the limit set in
//!   Settings → Storage (`fork_startup::clips_limit_bytes`), oldest played first out.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use psysonic_core::server_http::ServerHttpRegistry;
use psysonic_integration::navidrome::queries::nd_get_song_internal;
use psysonic_integration::navidrome::{nd_apply_request, nd_bulk_http_client};
use tauri::{Manager, State};

const MISS_TTL: Duration = Duration::from_secs(7 * 24 * 3600);

#[tauri::command]
#[specta::specta]
pub(crate) fn fork_set_animated_covers(enabled: bool) -> Result<(), String> {
    crate::cover_cache::fork_animated::set_enabled(enabled);
    Ok(())
}

/// FNV-1a: a stable file name for a server + song, across app updates.
fn cache_key(server_url: &str, song_id: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in server_url.trim_end_matches('/').bytes().chain([0u8]).chain(song_id.bytes()) {
        h ^= u64::from(b);
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{h:016x}")
}

/// `/music/Youtube FLAC/001-Song.flac` -> `["Youtube FLAC", "001-Song.background.mp4"]`.
fn clip_segments(song_path: &str) -> Option<[String; 2]> {
    let mut parts = song_path.split(['/', '\\']).filter(|p| !p.is_empty()).rev();
    let file = parts.next()?;
    let folder = parts.next()?;
    let stem = file.rsplit_once('.').map_or(file, |(s, _)| s);
    Some([folder.to_string(), format!("{stem}.background.mp4")])
}

fn is_fresh_miss(marker: &Path) -> bool {
    marker
        .metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| SystemTime::now().duration_since(t).ok())
        .is_some_and(|age| age < MISS_TTL)
}

/// Remove the least recently played clips until the folder fits the limit. The
/// most recent one (the clip just saved or now showing) is always kept, even
/// when it alone is over the limit.
fn evict(dir: &Path) {
    let limit = crate::fork_startup::clips_limit_bytes();
    let Ok(read) = std::fs::read_dir(dir) else { return };
    let mut clips: Vec<(SystemTime, u64, PathBuf)> = read
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "mp4"))
        .filter_map(|e| {
            let m = e.metadata().ok()?;
            Some((m.modified().ok()?, m.len(), e.path()))
        })
        .collect();
    let mut total: u64 = clips.iter().map(|c| c.1).sum();
    clips.sort();
    clips.pop();
    for (_, len, path) in clips {
        if total <= limit {
            break;
        }
        if std::fs::remove_file(&path).is_ok() {
            total -= len;
        }
    }
}

fn clips_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("fork-clips"))
}

/// Apply a new limit right away.
pub(crate) fn evict_clips(app: &tauri::AppHandle) {
    if let Ok(dir) = clips_dir(app) {
        evict(&dir);
    }
}

/// Bytes of background clips kept on disk (Settings shows it next to Clear).
#[tauri::command]
#[specta::specta]
pub(crate) fn fork_background_clips_size(app: tauri::AppHandle) -> Result<u64, String> {
    let Ok(read) = std::fs::read_dir(clips_dir(&app)?) else { return Ok(0) };
    Ok(read.flatten().filter_map(|e| e.metadata().ok()).map(|m| m.len()).sum())
}

/// Delete every kept clip and every "no clip" note.
#[tauri::command]
#[specta::specta]
pub(crate) fn fork_clear_background_clips(app: tauri::AppHandle) -> Result<(), String> {
    let dir = clips_dir(&app)?;
    if dir.is_dir() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn fork_song_background_clip(
    app: tauri::AppHandle,
    http_registry: State<'_, Arc<ServerHttpRegistry>>,
    server_url: String,
    token: String,
    song_id: String,
) -> Result<Option<String>, String> {
    let dir = clips_dir(&app)?;
    let key = cache_key(&server_url, &song_id);
    let clip = dir.join(format!("{key}.mp4"));
    let miss = dir.join(format!("{key}.miss"));
    if clip.is_file() {
        // mtime = last played, for the eviction order
        let _ = std::fs::File::options()
            .append(true)
            .open(&clip)
            .and_then(|f| f.set_modified(SystemTime::now()));
        return Ok(Some(clip.to_string_lossy().into_owned()));
    }
    if is_fresh_miss(&miss) {
        return Ok(None);
    }

    let reg = http_registry.as_ref();
    let base = server_url.trim_end_matches('/');
    let song = nd_get_song_internal(Some(reg), None, base, &token, &song_id).await?;
    let Some(segments) = song["path"].as_str().and_then(clip_segments) else {
        return Ok(None);
    };
    let mut url = url::Url::parse(base).map_err(|e| e.to_string())?;
    url.path_segments_mut()
        .map_err(|_| "server url cannot take a path".to_string())?
        .pop_if_empty()
        .extend(["rest", "x-clip", segments[0].as_str(), segments[1].as_str()]);
    let resp = nd_apply_request(
        Some(reg),
        None,
        url.as_str(),
        nd_bulk_http_client()
            .get(url.as_str())
            .timeout(Duration::from_secs(60))
            .header("X-ND-Authorization", format!("Bearer {token}")),
    )
    .send()
    .await
    .map_err(|e| e.to_string())?;

    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    match resp.status().as_u16() {
        200 => {
            let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
            // own name per download, so two at once never share a half-written file
            let nanos = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map_or(0, |d| d.as_nanos());
            let part = dir.join(format!("{key}.{}-{nanos}.part", std::process::id()));
            if let Err(e) = std::fs::write(&part, &bytes) {
                let _ = std::fs::remove_file(&part);
                return Err(e.to_string());
            }
            if let Err(e) = std::fs::rename(&part, &clip) {
                let _ = std::fs::remove_file(&part);
                return Err(e.to_string());
            }
            let _ = std::fs::remove_file(&miss);
            evict(&dir);
            Ok(Some(clip.to_string_lossy().into_owned()))
        }
        // Only the clip server's own "no such clip" is remembered: its location adds
        // Cache-Control to every answer, a 404 from a missing route has none.
        404 if resp.headers().get("cache-control").is_some_and(|v| v.as_bytes().windows(7).any(|w| w == b"max-age")) => {
            let _ = std::fs::write(&miss, b"");
            Ok(None)
        }
        // 401: the frontend logs in again once; anything else (route missing, server
        // busy) is an error too, so the frontend does not remember it and asks next time
        code => Err(format!("HTTP {code}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clip_path_is_folder_and_file_with_the_clip_suffix() {
        assert_eq!(
            clip_segments("/music/Youtube FLAC/001-A ｜ B.flac"),
            Some(["Youtube FLAC".to_string(), "001-A ｜ B.background.mp4".to_string()])
        );
        assert_eq!(
            clip_segments("Mix\\002-A.b - C.opus"),
            Some(["Mix".to_string(), "002-A.b - C.background.mp4".to_string()])
        );
        assert_eq!(clip_segments("song.flac"), None);
    }

    #[test]
    fn cache_key_is_stable_and_ignores_a_trailing_slash() {
        assert_eq!(cache_key("https://x.test/", "abc"), cache_key("https://x.test", "abc"));
        assert_ne!(cache_key("https://x.test", "abc"), cache_key("https://x.test", "abd"));
        assert_eq!(cache_key("", "").len(), 16);
    }
}
