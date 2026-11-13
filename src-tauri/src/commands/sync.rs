use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, bail, Result};
use chrono::{Local, Utc};
use rusqlite::{params, Connection};
use tauri::{AppHandle, Emitter, Manager};

use crate::db;
use crate::models::{AchievementSyncResult, SyncAllResult};
use crate::state::AppState;
use crate::steam;
use crate::steam::api;
use crate::util::achievement_tints;

struct GameInfo {
    appid: Option<i64>,
    work_dir: Option<String>,
}

fn game_info(conn: &Connection, game_id: &str) -> Result<GameInfo> {
    conn.query_row(
        "SELECT appid, work_dir FROM games WHERE id = ?1",
        params![game_id],
        |r| {
            Ok(GameInfo {
                appid: r.get(0)?,
                work_dir: r.get(1)?,
            })
        },
    )
    .map_err(|_| anyhow!("游戏不存在"))
}

fn appdata_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(PathBuf::from)
}

fn public_steam_dir() -> Option<PathBuf> {
    std::env::var_os("PUBLIC").map(|p| PathBuf::from(p).join("Documents").join("Steam"))
}

fn b64_decode(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(s.len() * 3 / 4 + 3);
    let mut buf: u32 = 0;
    let mut bits = 0u32;
    for c in s.chars() {
        let v = match c {
            'A'..='Z' => c as u32 - 'A' as u32,
            'a'..='z' => c as u32 - 'a' as u32 + 26,
            '0'..='9' => c as u32 - '0' as u32 + 52,
            '+' | '-' => 62,
            '/' | '_' => 63,
            '=' => break,
            c if c.is_whitespace() => continue,
            _ => return None,
        };
        buf = (buf << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Some(out)
}

fn gse_date_to_rfc(raw: &str) -> Option<String> {
    let dt = chrono::NaiveDateTime::parse_from_str(raw.trim(), "%d/%m/%Y %H:%M:%S").ok()?;
    dt.and_local_timezone(Local)
        .earliest()
        .map(|d| d.to_rfc3339())
}

fn epoch_to_rfc(ts: i64) -> Option<String> {
    if ts <= 0 {
        return None;
    }
    chrono::DateTime::<Utc>::from_timestamp(ts, 0).map(|d| d.to_rfc3339())
}

fn gse_from_json(v: &serde_json::Value) -> HashMap<String, Option<String>> {
    let mut out = HashMap::new();
    let obj = if let Some(o) = v.as_object() {
        if let Some(inner) = o.get("achievements").and_then(|x| x.as_object()) {
            inner
        } else {
            o
        }
    } else {
        return out;
    };
    for (k, val) in obj {
        match val {
            serde_json::Value::String(s) => {
                out.insert(k.clone(), gse_date_to_rfc(s));
            }
            serde_json::Value::Object(o) => {
                let earned = o
                    .get("earned")
                    .map(|x| x.as_bool().unwrap_or(false) || x.as_i64().unwrap_or(0) != 0)
                    .unwrap_or(false);
                if earned {
                    let ts = o.get("earned_time").and_then(|x| x.as_i64()).unwrap_or(0);
                    out.insert(k.clone(), epoch_to_rfc(ts));
                }
            }
            serde_json::Value::Bool(true) => {
                out.insert(k.clone(), None);
            }
            _ => {}
        }
    }
    out
}

/// GSE 的解锁文件：可能是普通 JSON，也可能是每行 base64 的 `"API": "日期"`。
fn parse_gse_file(path: &Path) -> Option<HashMap<String, Option<String>>> {
    let text = fs::read_to_string(path).ok()?;
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
        return Some(gse_from_json(&v));
    }
    let mut fragments = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let bytes = b64_decode(line)?;
        fragments.push(String::from_utf8(bytes).ok()?);
    }
    if fragments.is_empty() {
        return Some(HashMap::new());
    }
    let joined = format!("{{{}}}", fragments.join(","));
    let map: HashMap<String, String> = serde_json::from_str(&joined).ok()?;
    Some(
        map.into_iter()
            .map(|(k, v)| (k, gse_date_to_rfc(&v)))
            .collect(),
    )
}

/// RUNE/CODEX 的 achievements.ini：
/// `[SteamAchievements] Count=N` + 每个成就一个 section，`Achieved=1`、`UnlockTime=...`
fn parse_rune_file(path: &Path) -> Option<HashMap<String, Option<String>>> {
    let text = fs::read_to_string(path).ok()?;
    let mut out = HashMap::new();
    let mut current: Option<String> = None;
    let mut achieved = false;
    let mut unlock_time = 0i64;

    let flush = |out: &mut HashMap<String, Option<String>>,
                 current: &Option<String>,
                 achieved: bool,
                 unlock_time: i64| {
        if let (Some(name), true) = (current, achieved) {
            if !name.eq_ignore_ascii_case("SteamAchievements") {
                out.insert(name.clone(), epoch_to_rfc(unlock_time));
            }
        }
    };

    for line in text.lines() {
        let s = line.trim();
        if s.is_empty() || s.starts_with(';') || s.starts_with('#') {
            continue;
        }
        if s.starts_with('[') && s.ends_with(']') {
            flush(&mut out, &current, achieved, unlock_time);
            current = Some(s[1..s.len() - 1].trim().to_string());
            achieved = false;
            unlock_time = 0;
            continue;
        }
        if let Some((k, v)) = s.split_once('=') {
            let k = k.trim();
            let v = v.trim();
            if k.eq_ignore_ascii_case("Achieved") {
                achieved = v == "1" || v.eq_ignore_ascii_case("true");
            } else if k.eq_ignore_ascii_case("UnlockTime") {
                unlock_time = v.parse::<i64>().unwrap_or(0);
            }
        }
    }
    flush(&mut out, &current, achieved, unlock_time);
    Some(out)
}

/// 找本地成就文件；优先级：GSE 存档 → RUNE/CODEX 存档。
fn local_unlocks(appid: i64, _work_dir: Option<&Path>) -> Option<(String, HashMap<String, Option<String>>)> {
    if let Some(base) = appdata_dir() {
        for folder in ["GSE Saves", "Goldberg SteamEmu Saves"] {
            let root = base.join(folder).join(appid.to_string());
            for rel in ["remote/achievements.json", "achievements.json"] {
                let p = root.join(rel);
                if p.is_file() {
                    if let Some(map) = parse_gse_file(&p) {
                        return Some(("local".into(), map));
                    }
                }
            }
        }
    }
    if let Some(base) = public_steam_dir() {
        for family in ["RUNE", "CODEX"] {
            let p = base.join(family).join(appid.to_string()).join("achievements.ini");
            if p.is_file() {
                if let Some(map) = parse_rune_file(&p) {
                    return Some(("local".into(), map));
                }
            }
        }
    }
    None
}

fn has_local_layout(root: Option<&Path>) -> bool {
    let Some(root) = root.filter(|p| p.is_dir()) else { return false };
    if find_steam_settings(root).is_some() {
        return true;
    }
    let mut stack = vec![(root.to_path_buf(), 0u32)];
    while let Some((dir, depth)) = stack.pop() {
        if depth > 8 {
            continue;
        }
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let p = entry.path();
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_file() {
                if entry.file_name().to_string_lossy().eq_ignore_ascii_case("steam_emu.ini") {
                    return true;
                }
            } else if ft.is_dir() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if ["content", "saved", "intermediate", "deriveddatacache", "cache"].contains(&name.as_str()) {
                    continue;
                }
                stack.push((p, depth + 1));
            }
        }
    }
    false
}

fn find_steam_settings(root: &Path) -> Option<PathBuf> {
    let mut stack = vec![(root.to_path_buf(), 0u32)];
    while let Some((dir, depth)) = stack.pop() {
        if depth > 8 {
            continue;
        }
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let p = entry.path();
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_dir() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name == "steam_settings" {
                    return Some(p);
                }
                if [
                    "content", "saved", "intermediate", "deriveddatacache", "cache", "logs",
                    "crashes", "movies", "audio", "locales", "shadercache",
                ]
                .contains(&name.as_str())
                {
                    continue;
                }
                stack.push((p, depth + 1));
            }
        }
    }
    None
}

fn json_hidden(v: &serde_json::Value) -> bool {
    match v {
        serde_json::Value::Bool(b) => *b,
        serde_json::Value::Number(n) => n.as_i64().unwrap_or(0) != 0,
        serde_json::Value::String(s) => s == "1" || s.eq_ignore_ascii_case("true"),
        _ => false,
    }
}

struct LocalDef {
    api_name: String,
    display: String,
    description: String,
    hidden: bool,
    icon: Option<PathBuf>,
    icon_gray: Option<PathBuf>,
}

/// 只做文件读取/解析，不碰数据库。这样遍历游戏目录不会占着唯一的 DB 锁。
fn load_local_definitions(work_dir: Option<&Path>) -> Vec<LocalDef> {
    let Some(root) = work_dir.filter(|p| p.is_dir()) else {
        return Vec::new();
    };
    let Some(settings) = find_steam_settings(root) else {
        return Vec::new();
    };

    let mut defs = Vec::new();
    let json_path = settings.join("achievements.json");
    if json_path.is_file() {
        if let Ok(text) = fs::read_to_string(&json_path) {
            if let Ok(serde_json::Value::Array(arr)) = serde_json::from_str(&text) {
                for e in arr {
                    let Some(api_name) = e.get("name").and_then(|v| v.as_str()) else { continue };
                    let display = e
                        .get("displayName")
                        .and_then(|v| v.as_str())
                        .unwrap_or(api_name)
                        .to_string();
                    let description = e
                        .get("description")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let hidden = e.get("hidden").map(json_hidden).unwrap_or(false);
                    let icon = e
                        .get("icon")
                        .and_then(|v| v.as_str())
                        .map(|rel| settings.join(rel.replace('/', "\\")))
                        .filter(|p| p.is_file());
                    let icon_gray = e
                        .get("icongray")
                        .and_then(|v| v.as_str())
                        .map(|rel| settings.join(rel.replace('/', "\\")))
                        .filter(|p| p.is_file());
                    defs.push(LocalDef {
                        api_name: api_name.to_string(),
                        display,
                        description,
                        hidden,
                        icon,
                        icon_gray,
                    });
                }
            }
        }
    }

    if defs.is_empty() {
        let ini_path = settings.join("achievements.ini");
        if let Ok(text) = fs::read_to_string(&ini_path) {
            let mut section = String::new();
            for line in text.lines() {
                let s = line.trim();
                if s.starts_with('[') && s.ends_with(']') {
                    section = s[1..s.len() - 1].trim().to_string();
                } else if section.eq_ignore_ascii_case("Achievements") {
                    if let Some((k, v)) = s.split_once('=') {
                        let api_name = k.trim();
                        if api_name.is_empty() {
                            continue;
                        }
                        let display = if v.trim().is_empty() { api_name } else { v.trim() };
                        defs.push(LocalDef {
                            api_name: api_name.to_string(),
                            display: display.to_string(),
                            description: String::new(),
                            hidden: false,
                            icon: None,
                            icon_gray: None,
                        });
                    }
                }
            }
        }
    }
    defs
}

/// 本地图标在游戏安装目录里，asset 协议只放行 StarBox 数据目录。
/// 导入定义时把图标复制到数据目录缓存，再存缓存路径。
fn cache_local_icon(src: &Path, cache_root: &Path, game_id: &str) -> Option<String> {
    let name = src.file_name()?;
    let dir = cache_root.join(game_id);
    fs::create_dir_all(&dir).ok()?;
    let dest = dir.join(name);
    if !dest.is_file() {
        fs::copy(src, &dest).ok()?;
    }
    Some(dest.display().to_string())
}

fn insert_local_definitions(
    conn: &Connection,
    game_id: &str,
    defs: &[LocalDef],
    icon_cache: &Path,
) -> Result<usize> {
    let mut added = 0usize;
    for d in defs {
        let icon = d.icon.as_deref().and_then(|p| cache_local_icon(p, icon_cache, game_id));
        let icon_gray = d
            .icon_gray
            .as_deref()
            .and_then(|p| cache_local_icon(p, icon_cache, game_id));
        let (ta, tb) = achievement_tints(&d.api_name);
        added += conn
            .execute(
                "INSERT OR IGNORE INTO achievements
                 (game_id, api_name, name, description, icon_url, icon_gray_url, hidden, source, tint_a, tint_b)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,'local',?8,?9)",
                params![
                    game_id,
                    d.api_name,
                    d.display,
                    d.description,
                    icon,
                    icon_gray,
                    d.hidden as i64,
                    ta,
                    tb
                ],
            )
            .unwrap_or(0);
    }
    Ok(added)
}

/// 写回解锁状态。Steam 是权威的（未列出的会清零），本地文件只把列出的置为已解锁。
fn apply_unlocks(
    conn: &Connection,
    game_id: &str,
    unlocks: &HashMap<String, Option<String>>,
    source: &str,
) -> Result<(i64, i64, i64)> {
    let lookup: HashMap<String, Option<String>> = unlocks
        .iter()
        .map(|(k, v)| (k.to_lowercase(), v.clone()))
        .collect();
    let mut stmt = conn.prepare(
        "SELECT id, api_name, unlocked FROM achievements WHERE game_id = ?1",
    )?;
    let rows: Vec<(i64, String, i64)> = stmt
        .query_map(params![game_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);

    let mut newly = 0i64;
    for (id, api_name, was_unlocked) in &rows {
        if let Some(date) = lookup.get(&api_name.to_lowercase()) {
            if *was_unlocked == 0 {
                newly += 1;
            }
            conn.execute(
                "UPDATE achievements SET unlocked = 1, unlocked_at = ?1, source = ?2 WHERE id = ?3",
                params![date, source, id],
            )?;
        } else if source == "steam" && *was_unlocked != 0 {
            conn.execute(
                "UPDATE achievements SET unlocked = 0, unlocked_at = NULL, source = 'steam' WHERE id = ?1",
                params![id],
            )?;
        }
    }

    conn.execute(
        "UPDATE games SET ach_source = ?1 WHERE id = ?2",
        params![source, game_id],
    )?;
    let unlocked: i64 = conn.query_row(
        "SELECT COUNT(*) FROM achievements WHERE game_id = ?1 AND unlocked = 1",
        params![game_id],
        |r| r.get(0),
    )?;
    Ok((rows.len() as i64, unlocked, newly))
}

fn credentials(state: &AppState) -> (Option<String>, Option<String>) {
    let conn = state.db();
    let sid = db::get_setting(&conn, "steam_id")
        .ok()
        .flatten()
        .map(|s| s.trim().to_string())
        .filter(|s| s.len() == 17 && s.chars().all(|c| c.is_ascii_digit()));
    (sid, crate::secret::load_api_key())
}

async fn sync_game(app: &AppHandle, game_id: &str, mode: &str) -> Result<AchievementSyncResult> {
    let state = app.state::<AppState>();
    let info = {
        let conn = state.db();
        game_info(&conn, game_id)?
    };
    let appid = info
        .appid
        .ok_or_else(|| anyhow!("这款游戏没有 Steam AppID，无法同步成就"))?;
    let work = info.work_dir.as_deref().map(Path::new);

    let needs_defs = {
        let conn = state.db();
        conn.query_row(
            "SELECT COUNT(*) FROM achievements WHERE game_id = ?1",
            params![game_id],
            |r| r.get::<_, i64>(0),
        )?
            == 0
    };
    if needs_defs {
        // 文件遍历放在 DB 锁外，避免扫描游戏目录时卡住其他数据库请求。
        let defs = load_local_definitions(work);
        if !defs.is_empty() {
            let conn = state.db();
            let cache = state.data_dir.join("achievement_icons");
            let _ = insert_local_definitions(&conn, game_id, &defs, &cache);
        }
    }

    let mut local = local_unlocks(appid, work);
    if local.is_none() && has_local_layout(work) {
        // 有本地模拟器布局但还没写出解锁文件：按本地 0 条处理，不去误读 Steam 账号。
        local = Some(("local".into(), HashMap::new()));
    }
    let prefer_local = local.is_some();
    let local_nonempty = local.as_ref().map(|(_, m)| !m.is_empty()).unwrap_or(false);

    let mut used: Option<(&str, HashMap<String, Option<String>>)> = None;
    if mode != "steam" && local_nonempty {
        if let Some((_, map)) = local.as_ref() {
            used = Some(("local", map.clone()));
        }
    }

    if used.is_none() && mode != "local" && (!prefer_local || mode == "steam") {
        let (sid, key) = credentials(&state);
        match (sid, key) {
            (Some(sid), Some(key)) => {
                let list = api::fetch_player_achievements(appid, &sid, &key).await?;
                let mut map = HashMap::new();
                for a in list {
                    if a.achieved {
                        map.insert(a.api_name, a.unlock_time.and_then(epoch_to_rfc));
                    }
                }
                used = Some(("steam", map));
            }
            _ if mode == "steam" => {
                bail!("请先在设置里填写 SteamID64 和 Steam Web API Key");
            }
            _ => {}
        }
    }

    if used.is_none() {
        if let Some((_, map)) = local {
            used = Some(("local", map));
        }
    }

    let Some((source, map)) = used else {
        bail!("本地没有成就文件，也没有配置 SteamID64/Web API Key");
    };

    let (total, unlocked, newly) = {
        let conn = state.db();
        apply_unlocks(&conn, game_id, &map, source)?
    };

    let game = {
        let conn = state.db();
        db::get_game(&conn, game_id)?
            .ok_or_else(|| anyhow!("同步后读取游戏失败"))?
    };
    let _ = app.emit("library://updated", game_id.to_string());

    let source_label = if source == "steam" { "Steam" } else { "本地成就文件" };
    let message = if total == 0 {
        "本地有成就文件，但库里还没有成就定义".to_string()
    } else if newly > 0 {
        format!("已从{source_label}同步：新解锁 {newly} 个，共 {unlocked}/{total}")
    } else {
        format!("已从{source_label}同步：{unlocked}/{total}")
    };

    Ok(AchievementSyncResult {
        game,
        source: source.to_string(),
        unlocked,
        total,
        newly_unlocked: newly,
        message: Some(message),
    })
}

#[tauri::command]
pub async fn sync_achievements(
    app: AppHandle,
    game_id: String,
    mode: Option<String>,
) -> Result<AchievementSyncResult, String> {
    sync_game(&app, &game_id, mode.as_deref().unwrap_or("auto"))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sync_all_achievements(
    app: AppHandle,
    mode: Option<String>,
) -> Result<SyncAllResult, String> {
    let state = app.state::<AppState>();
    let ids: Vec<String> = {
        let conn = state.db();
        let mut stmt = conn
            .prepare("SELECT id FROM games WHERE appid IS NOT NULL ORDER BY title")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.flatten().collect()
    };

    let mut result = SyncAllResult {
        total: ids.len() as i64,
        synced: 0,
        failed: 0,
        steam: 0,
        local: 0,
        unlocked: 0,
        message: None,
    };
    for id in ids {
        match sync_game(&app, &id, mode.as_deref().unwrap_or("auto")).await {
            Ok(r) => {
                result.synced += 1;
                result.unlocked += r.unlocked;
                if r.source == "steam" {
                    result.steam += 1;
                } else {
                    result.local += 1;
                }
                let _ = app.emit("library://updated", id);
            }
            Err(_) => result.failed += 1,
        }
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    }
    result.message = Some(format!(
        "同步 {} 个：Steam {}，本地 {}，失败 {}，共 {} 条解锁",
        result.synced, result.steam, result.local, result.failed, result.unlocked
    ));
    Ok(result)
}

/// 游戏退出后自动同步一次（不阻塞退出结算）。
pub async fn auto_sync_game(app: AppHandle, game_id: String) {
    if let Ok(r) = sync_game(&app, &game_id, "auto").await {
        let _ = app.emit("library://updated", game_id.clone());
        if r.newly_unlocked > 0 {
            let _ = app.emit(
                "achievement://synced",
                serde_json::json!({
                    "gameId": game_id,
                    "newlyUnlocked": r.newly_unlocked,
                    "unlocked": r.unlocked,
                    "total": r.total,
                    "source": r.source,
                }),
            );
        }
    }
}

#[tauri::command]
pub fn detect_steam_id() -> Option<String> {
    steam::current_steam_id()
}
