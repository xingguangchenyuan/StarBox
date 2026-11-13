use anyhow::Result;
use rusqlite::params;
use std::path::{Path, PathBuf};
use tauri::State;

use crate::db;
use crate::models::ModEntry;
use crate::state::AppState;
use crate::util::dir_size;

const DISABLED: &str = "_disabled";

fn mods_root(state: &AppState, game_id: &str) -> Option<PathBuf> {
    let conn = state.db();
    let (mods_dir, work_dir): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT mods_dir, work_dir FROM games WHERE id = ?1",
            params![game_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok()?;
    if let Some(dir) = mods_dir.filter(|d| !d.trim().is_empty()) {
        return Some(PathBuf::from(dir));
    }
    work_dir.filter(|d| !d.trim().is_empty()).map(|d| PathBuf::from(d).join("mods"))
}

#[tauri::command]
pub fn list_mods(state: State<'_, AppState>, game_id: String) -> Result<Vec<ModEntry>, String> {
    let conn = state.db();
    db::list_mods(&conn, &game_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_mods_dir(state: State<'_, AppState>, game_id: String, dir: String) -> Result<(), String> {
    let conn = state.db();
    conn.execute("UPDATE games SET mods_dir = ?1 WHERE id = ?2", params![dir, game_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn read_meta(dir: &Path) -> (String, Option<String>) {
    let fallback = dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "未命名 MOD".into());

    for meta in ["info.json", "manifest.json", "mod.json"] {
        let path = dir.join(meta);
        if !path.is_file() {
            continue;
        }
        let Ok(raw) = std::fs::read_to_string(&path) else { continue };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) else { continue };
        let name = v
            .get("name")
            .or_else(|| v.get("Name"))
            .or_else(|| v.get("title"))
            .and_then(|x| x.as_str())
            .filter(|s| !s.trim().is_empty())
            .map(String::from)
            .unwrap_or(fallback.clone());
        let version = v
            .get("version")
            .or_else(|| v.get("Version"))
            .and_then(|x| {
                if let Some(s) = x.as_str() {
                    Some(s.to_string())
                } else {
                    x.as_f64().map(|f| f.to_string())
                }
            });
        return (name, version);
    }
    (fallback, None)
}

#[tauri::command(async)]
pub fn scan_mods(state: State<'_, AppState>, game_id: String) -> Result<Vec<ModEntry>, String> {
    let Some(root) = mods_root(&state, &game_id) else {
        return Ok(Vec::new());
    };
    if !root.is_dir() {
        return Ok(Vec::new());
    }

    let entries = std::fs::read_dir(&root).map_err(|e| format!("无法读取 MOD 目录：{e}"))?;
    let mut found: Vec<(String, String, Option<String>, i64, bool)> = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let dir_name = entry.file_name().to_string_lossy().to_string();
        if dir_name == DISABLED {
            if let Ok(inner) = std::fs::read_dir(&path) {
                for sub in inner.flatten() {
                    if !sub.path().is_dir() {
                        continue;
                    }
                    let sub_name = sub.file_name().to_string_lossy().to_string();
                    let (name, version) = read_meta(&sub.path());
                    found.push((sub_name, name, version, dir_size(&sub.path()) as i64, false));
                }
            }
            continue;
        }
        let (name, version) = read_meta(&path);
        found.push((dir_name, name, version, dir_size(&path) as i64, true));
    }

    found.sort_by(|a, b| b.4.cmp(&a.4).then(a.0.cmp(&b.0)));
    // mods/foo 与 mods/_disabled/foo 同时存在时只保留一条（优先启用中的），
    // 否则 (game_id, dir_name) 唯一约束会在批量插入中途失败。
    let mut seen = std::collections::HashSet::new();
    found.retain(|x| seen.insert(x.0.clone()));

    {
        let conn = state.db();
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM mods WHERE game_id = ?1", params![game_id])
            .map_err(|e| e.to_string())?;
        for (index, (dir_name, name, version, size, enabled)) in found.iter().enumerate() {
            tx.execute(
                "INSERT INTO mods (game_id, dir_name, name, version, size_bytes, enabled, order_index)
                 VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![
                    game_id,
                    dir_name,
                    name,
                    version,
                    size,
                    *enabled as i64,
                    index as i64
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
    }

    let conn = state.db();
    db::list_mods(&conn, &game_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_mod_enabled(state: State<'_, AppState>, mod_id: i64, enabled: bool) -> Result<(), String> {
    let (game_id, dir_name) = {
        let conn = state.db();
        conn.query_row(
            "SELECT game_id, dir_name FROM mods WHERE id = ?1",
            params![mod_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .map_err(|_| "MOD 记录不存在".to_string())?
    };

    let root = mods_root(&state, &game_id).ok_or_else(|| "还没指定 MOD 目录".to_string())?;
    let active = root.join(&dir_name);
    let parked = root.join(DISABLED).join(&dir_name);

    if enabled {
        if parked.is_dir() {
            if let Some(parent) = active.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            std::fs::rename(&parked, &active).map_err(|e| format!("启用失败：{e}"))?;
        }
    } else if active.is_dir() {
        let disabled_root = root.join(DISABLED);
        let _ = std::fs::create_dir_all(&disabled_root);
        std::fs::rename(&active, &parked).map_err(|e| format!("禁用失败：{e}"))?;
    }

    {
        let conn = state.db();
        conn.execute("UPDATE mods SET enabled = ?1 WHERE id = ?2", params![enabled as i64, mod_id])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
