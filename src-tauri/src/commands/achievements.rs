use anyhow::{anyhow, Result};
use rusqlite::params;
use tauri::{Manager, State};

use crate::db;
use crate::models::{Achievement, AchievementFetchResult};
use crate::secret;
use crate::state::AppState;
use crate::steam::api;
use crate::util::achievement_tints;

#[tauri::command]
pub fn list_achievements(state: State<'_, AppState>, game_id: String) -> Result<Vec<Achievement>, String> {
    let conn = state.db();
    db::list_achievements(&conn, &game_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_achievements(    app: tauri::AppHandle,
    game_id: String,
) -> Result<AchievementFetchResult, String> {
    let state = app.state::<AppState>();

    let appid = {
        let conn = state.db();
        let appid: Option<i64> = conn
            .query_row("SELECT appid FROM games WHERE id = ?1", params![game_id], |r| r.get(0))
            .map_err(|_| "游戏不存在".to_string())?;
        appid
    };
    let appid = appid.ok_or_else(|| "这款游戏没有 Steam AppID，没有可拉取的成就定义".to_string())?;

    let key = secret::load_api_key()
        .ok_or_else(|| "还没有填 Steam Web API Key（设置 → Steam Web API Key）".to_string())?;

    let defs = api::fetch_schema(appid, &key)
        .await
        .map_err(|e| e.to_string())?;

    let count = defs.len() as i64;
    {
        let conn = state.db();
        store_defs(&conn, &game_id, appid, &defs).map_err(|e| e.to_string())?;
    }

    let conn = state.db();
    let game = db::get_game(&conn, &game_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "游戏不存在".to_string())?;

    Ok(AchievementFetchResult {
        game,
        count,
        message: Some(format!("已缓存 {count} 个成就定义")),
    })
}

#[tauri::command]
pub fn set_achievement_unlocked(
    state: State<'_, AppState>,
    achievement_id: i64,
    unlocked: bool,
) -> Result<(), String> {
    let conn = state.db();
    let unlocked_at = if unlocked { Some(chrono::Utc::now().to_rfc3339()) } else { None };

    let game_id: Option<String> = conn
        .query_row("SELECT game_id FROM achievements WHERE id = ?1", params![achievement_id], |r| r.get(0))
        .ok();
    let Some(game_id) = game_id else {
        return Err(anyhow!("成就不存在").to_string());
    };

    conn.execute(
        "UPDATE achievements SET unlocked = ?1, unlocked_at = ?2, source = ?3 WHERE id = ?4",
        params![
            unlocked as i64,
            unlocked_at,
            if unlocked { "manual" } else { "manual" },
            achievement_id
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE games SET ach_source = CASE WHEN ach_source = 'none' THEN 'manual' ELSE ach_source END WHERE id = ?1",
        params![game_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// 把 Steam 的成就定义落库。`fetch_achievements` 和「添加游戏后自动匹配」共用。
pub fn store_defs(
    conn: &rusqlite::Connection,
    game_id: &str,
    appid: i64,
    defs: &[crate::steam::api::AchDef],
) -> rusqlite::Result<()> {
    for d in defs {
        let (tint_a, tint_b) = achievement_tints(&d.api_name);
        conn.execute(
            r#"INSERT INTO achievements
               (game_id, api_name, name, description, icon_url, icon_gray_url, hidden, source, tint_a, tint_b)
               VALUES (?1,?2,?3,?4,?5,?6,?7,'steam',?8,?9)
               ON CONFLICT(game_id, api_name) DO UPDATE SET
                 name = excluded.name,
                 description = excluded.description,
                 icon_url = excluded.icon_url,
                 icon_gray_url = excluded.icon_gray_url,
                 hidden = excluded.hidden"#,
            params![
                game_id,
                d.api_name,
                d.name,
                d.description,
                d.icon,
                d.icon_gray,
                d.hidden as i64,
                tint_a,
                tint_b
            ],
        )?;
    }
    conn.execute(
        "UPDATE games SET ach_source = CASE WHEN ach_source = 'none' THEN 'steam' ELSE ach_source END WHERE id = ?1",
        params![game_id],
    )?;
    conn.execute(
        "INSERT INTO achievement_defs_cache (appid, fetched_at, schema_json) VALUES (?1, ?2, ?3)
         ON CONFLICT(appid) DO UPDATE SET fetched_at = excluded.fetched_at, schema_json = excluded.schema_json",
        params![appid, chrono::Utc::now().to_rfc3339(), serde_json::json!({ "count": defs.len() }).to_string()],
    )?;
    Ok(())
}
