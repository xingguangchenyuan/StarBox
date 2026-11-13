use anyhow::Result;
use serde::Deserialize;
use tauri::State;

use crate::db;
use crate::models::Settings;
use crate::secret;
use crate::state::AppState;

fn read(conn: &rusqlite::Connection, key: &str, default: &str) -> String {
    db::get_setting(conn, key).ok().flatten().unwrap_or_else(|| default.to_string())
}

fn build_settings(state: &AppState) -> Settings {
    let conn = state.db();
    Settings {
        has_api_key: secret::has_api_key(),
        steam_id: db::get_setting(&conn, "steam_id").ok().flatten().filter(|s| !s.is_empty()),
        sort_default: read(&conn, "sort_default", "recent"),
        view_mode: read(&conn, "view_mode", "grid"),
        card_size: read(&conn, "card_size", "standard"),
        reduce_motion: db::bool_setting(&conn, "reduce_motion", false),
        show_hidden: db::bool_setting(&conn, "show_hidden", false),
        locale: "zh-CN".into(),
        data_dir: state.data_dir.display().to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

/// 打开 StarBox 自己的数据目录。只允许这一个目录，不走通用 openPath 权限，
/// 避免为了「打开数据目录」放开任意文件路径。
#[tauri::command(async)]
pub fn open_data_dir(state: State<'_, AppState>) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(&state.data_dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("打开数据目录失败：{e}"))
}

#[tauri::command(async)]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    build_settings(&state)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub steam_api_key: Option<String>,
    pub steam_id: Option<String>,
    /// 显式清空：null 和「没传这个字段」不能靠 Option 区分。
    pub clear_steam_id: Option<bool>,
    pub clear_api_key: Option<bool>,
    pub sort_default: Option<String>,
    pub view_mode: Option<String>,
    pub card_size: Option<String>,
    pub reduce_motion: Option<bool>,
    pub show_hidden: Option<bool>,
}

#[tauri::command(async)]
pub fn save_settings(state: State<'_, AppState>, patch: SettingsPatch) -> Result<Settings, String> {
    if patch.clear_api_key == Some(true) {
        secret::clear_api_key().map_err(|e| format!("清除 Key 失败：{e}"))?;
    } else if let Some(key) = patch.steam_api_key.as_ref() {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            secret::save_api_key(trimmed).map_err(|e| format!("保存 Key 失败：{e}"))?;
        }
    }

    {
        let conn = state.db();
        if patch.clear_steam_id == Some(true) {
            conn.execute("DELETE FROM settings WHERE key = 'steam_id'", [])
                .map_err(|e| e.to_string())?;
        } else if let Some(id) = patch.steam_id.as_ref() {
            let trimmed = id.trim();
            if trimmed.is_empty() {
                conn.execute("DELETE FROM settings WHERE key = 'steam_id'", [])
                    .map_err(|e| e.to_string())?;
            } else {
                db::set_setting(&conn, "steam_id", trimmed).map_err(|e| e.to_string())?;
            }
        }
        if let Some(v) = patch.sort_default.as_ref() {
            db::set_setting(&conn, "sort_default", v).map_err(|e| e.to_string())?;
        }
        if let Some(v) = patch.view_mode.as_ref() {
            db::set_setting(&conn, "view_mode", v).map_err(|e| e.to_string())?;
        }
        if let Some(v) = patch.card_size.as_ref() {
            db::set_setting(&conn, "card_size", v).map_err(|e| e.to_string())?;
        }
        if let Some(v) = patch.reduce_motion {
            db::set_setting(&conn, "reduce_motion", if v { "1" } else { "0" })
                .map_err(|e| e.to_string())?;
        }
        if let Some(v) = patch.show_hidden {
            db::set_setting(&conn, "show_hidden", if v { "1" } else { "0" })
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(build_settings(&state))
}
