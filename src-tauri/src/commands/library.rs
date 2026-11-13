use anyhow::{anyhow, Result};
use rusqlite::params;
use tauri::{AppHandle, Manager, State};

use crate::commands::common::{find_by_exe, infer_appid, insert_game, resolve_target, NewGame};
use crate::db;
use crate::models::{AppInfo, Game, Tag};
use crate::state::AppState;

#[tauri::command]
pub fn app_info(state: State<'_, AppState>) -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        data_dir: state.data_dir.display().to_string(),
        demo: false,
    }
}

#[tauri::command]
pub fn list_games(state: State<'_, AppState>) -> Result<Vec<Game>, String> {
    let conn = state.db();
    let mut games = db::list_games(&conn).map_err(err)?;
    let procs = state.procs.lock().unwrap();
    for g in &mut games {
        if let Some(running) = procs.get(&g.id) {
            g.running = true;
            g.session_sec = chrono::DateTime::parse_from_rfc3339(&running.started_at)
                .map(|s| (chrono::Utc::now() - s.with_timezone(&chrono::Utc)).num_seconds().max(0))
                .unwrap_or(0);
        }
    }
    Ok(games)
}

#[tauri::command]
pub fn list_tags(state: State<'_, AppState>) -> Result<Vec<Tag>, String> {
    let conn = state.db();
    db::list_tags(&conn).map_err(err)
}

#[tauri::command]
pub fn create_tag(state: State<'_, AppState>, name: String, color: String) -> Result<Tag, String> {
    let conn = state.db();
    db::create_tag(&conn, &name, &color).map_err(err)
}

#[tauri::command]
pub fn update_tag(state: State<'_, AppState>, id: i64, name: String, color: String) -> Result<Tag, String> {
    let conn = state.db();
    db::update_tag(&conn, id, &name, &color).map_err(err)
}

#[tauri::command]
pub fn delete_tag(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let conn = state.db();
    db::delete_tag(&conn, id).map_err(err)
}

#[tauri::command(async)]
pub fn add_game(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    work_dir: Option<String>,
) -> Result<Game, String> {
    // 路径解析 / 目录递归 / 版本信息读取都可能在网络盘或大目录上耗时，
    // 全部放在 DB 锁之外做，否则整个界面会跟着卡住。
    let mut target = resolve_target(&path).map_err(err)?;
    // 从「扫描文件夹」加进来时，启动器知道游戏根目录——用它当工作目录比
    // exe 所在的 bin\Win64 更接近游戏预期的安装目录。
    if let Some(dir) = work_dir.as_ref().map(|d| d.trim()).filter(|d| !d.is_empty()) {
        let p = std::path::PathBuf::from(dir);
        if p.is_dir() {
            target.work_dir = p;
        }
    }
    let exe_str = target.exe.display().to_string();

    let appid = infer_appid(&target.exe);
    // platform 表示「安装来源」，不是「有没有 Steam AppID」。
    // 本地副本即使带 steam_appid.txt，也仍然是本地来源；自动匹配只改 appid。
    let exe_lower = exe_str.to_lowercase();
    let platform = if exe_lower.contains("\\steamapps\\common\\") {
        "steam"
    } else if exe_lower.contains("\\epic games\\") {
        "epic"
    } else {
        "local"
    };

    let id = {
        let conn = state.db();
        if let Some(existing) = find_by_exe(&conn, &exe_str).map_err(err)? {
            return db::get_game(&conn, &existing)
                .map_err(err)?
                .ok_or_else(|| "读取失败".to_string());
        }
        let new = NewGame {
            title: target.title,
            title_en: None,
            appid,
            platform: platform.to_string(),
            exe_path: Some(exe_str),
            work_dir: Some(target.work_dir.display().to_string()),
            args: target.args,
            playtime_sec: 0,
            last_played_at: None,
            cover_path: None,
            banner_path: None,
        };
        insert_game(&conn, &new).map_err(err)?
    };

    // 有 AppID 就在后台抓一次商店资料与封面
    if appid.is_some() {
        let app_clone = app.clone();
        let state_handle = app.state::<AppState>();
        let db = state_handle.db.clone();
        let cover_dir = state_handle.cover_dir();
        let game_id = id.clone();
        tauri::async_runtime::spawn(async move {
            if crate::commands::steam::refresh_inner(db, cover_dir, &game_id, true).await.is_ok() {
                use tauri::Emitter;
                let _ = app_clone.emit("library://updated", game_id);
            }
        });
    } else {
        // 本地游戏：按名字去商店搜一次，名字几乎完全一致才自动绑定，
        // 这样成就和介绍也能不用 SteamID 就拉下来；匹配不准就留给用户手动选。
        let app_clone = app.clone();
        let state_handle = app.state::<AppState>();
        let db = state_handle.db.clone();
        let cover_dir = state_handle.cover_dir();
        let game_id = id.clone();
        let (search_title, exe_for_hints, work_for_hints) = {
            let conn = db.lock().unwrap();
            conn.query_row(
                "SELECT title, exe_path, work_dir FROM games WHERE id = ?1",
                params![&game_id],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                        r.get::<_, Option<String>>(2)?,
                    ))
                },
            )
            .unwrap_or_default()
        };
        tauri::async_runtime::spawn(async move {
            use tauri::Emitter;
            let hints = crate::util::title_hints(
                std::path::Path::new(&exe_for_hints),
                work_for_hints.as_ref().map(std::path::Path::new),
            );
            let mut hints = hints;
            hints.insert(0, search_title.clone());

            let mut items: Vec<crate::steam::api::SearchItem> = Vec::new();
            let mut tried: Vec<String> = Vec::new();
            for hint in hints.iter().take(3) {
                for term in search_terms(hint) {
                    if tried.contains(&term) {
                        continue;
                    }
                    tried.push(term.clone());
                    if let Ok(found) = crate::steam::api::search_apps(&term).await {
                        for it in found {
                            if !items.iter().any(|x| x.appid == it.appid) {
                                items.push(it);
                            }
                        }
                    }
                    if items.len() >= 12 {
                        break;
                    }
                }
            }
            let Some(appid) = crate::steam::api::confident_match(&hints, &items) else {
                return;
            };
            {
                let conn = db.lock().unwrap();
                let taken: Option<String> = conn
                    .query_row(
                        "SELECT id FROM games WHERE appid = ?1 AND id <> ?2 LIMIT 1",
                        params![appid, &game_id],
                        |r| r.get(0),
                    )
                    .ok();
                if taken.is_some() {
                    return;
                }
                if conn
                    .execute(
                        "UPDATE games SET appid = ?1, platform = 'steam' WHERE id = ?2",
                        params![appid, &game_id],
                    )
                    .is_err()
                {
                    return;
                }
            }
            if crate::commands::steam::refresh_inner(db.clone(), cover_dir, &game_id, true)
                .await
                .is_ok()
            {
                let _ = app_clone.emit("library://updated", game_id.clone());
                // 顺带把成就定义也拉下来（有 Key 才做，失败不打扰用户）
                if let Some(key) = crate::secret::load_api_key() {
                    if let Ok(defs) = crate::steam::api::fetch_schema(appid, &key).await {
                        let conn = db.lock().unwrap();
                        let _ = crate::commands::achievements::store_defs(&conn, &game_id, appid, &defs);
                        drop(conn);
                        let _ = app_clone.emit("library://updated", game_id);
                    }
                }
            }
        });
    }

    let state_handle = app.state::<AppState>();
    let conn = state_handle.db();
    db::get_game(&conn, &id)
        .map_err(err)?
        .ok_or_else(|| "添加后读取失败".to_string())
}

#[tauri::command]
pub fn delete_game(state: State<'_, AppState>, game_id: String) -> Result<(), String> {
    let conn = state.db();
    let tx = conn.unchecked_transaction().map_err(err)?;
    // 先删子表再删父表；事务保证不会出现删到一半的孤儿记录。
    tx.execute("DELETE FROM achievements WHERE game_id = ?1", params![game_id]).map_err(err)?;
    tx.execute("DELETE FROM game_tags WHERE game_id = ?1", params![game_id]).map_err(err)?;
    tx.execute("DELETE FROM mods WHERE game_id = ?1", params![game_id]).map_err(err)?;
    tx.execute("DELETE FROM launch_logs WHERE game_id = ?1", params![game_id]).map_err(err)?;
    tx.execute("DELETE FROM games WHERE id = ?1", params![game_id]).map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn set_favorite(state: State<'_, AppState>, game_id: String, favorite: bool) -> Result<(), String> {
    let conn = state.db();
    conn.execute(
        "UPDATE games SET favorite = ?1 WHERE id = ?2",
        params![favorite as i64, game_id],
    )
    .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn set_hidden(state: State<'_, AppState>, game_id: String, hidden: bool) -> Result<(), String> {
    let conn = state.db();
    conn.execute("UPDATE games SET hidden = ?1 WHERE id = ?2", params![hidden as i64, game_id])
        .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn set_game_tags(state: State<'_, AppState>, game_id: String, tag_ids: Vec<i64>) -> Result<(), String> {
    let conn = state.db();
    let tx = conn.unchecked_transaction().map_err(err)?;
    tx.execute("DELETE FROM game_tags WHERE game_id = ?1", params![game_id]).map_err(err)?;
    for tag_id in tag_ids {
        tx.execute(
            "INSERT OR IGNORE INTO game_tags (game_id, tag_id) VALUES (?1, ?2)",
            params![game_id, tag_id],
        )
        .map_err(err)?;
    }
    tx.commit().map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn set_game_titles(
    state: State<'_, AppState>,
    game_id: String,
    title: String,
    title_en: Option<String>,
) -> Result<(), String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("游戏名不能为空".to_string());
    }
    let title_en = title_en
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let conn = state.db();
    conn.execute(
        "UPDATE games SET title = ?1, title_en = ?2 WHERE id = ?3",
        params![title, title_en, game_id],
    )
    .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn update_game_paths(
    state: State<'_, AppState>,
    game_id: String,
    exe_path: String,
    work_dir: String,
    args: String,
) -> Result<(), String> {
    let conn = state.db();
    conn.execute(
        "UPDATE games SET exe_path = ?1, work_dir = ?2, args = ?3 WHERE id = ?4",
        params![
            if exe_path.trim().is_empty() { None } else { Some(exe_path.trim()) },
            if work_dir.trim().is_empty() { None } else { Some(work_dir.trim()) },
            if args.trim().is_empty() { None } else { Some(args.trim()) },
            game_id
        ],
    )
    .map_err(err)?;
    Ok(())
}

#[tauri::command(async)]
pub fn set_game_cover(state: State<'_, AppState>, game_id: String, path: Option<String>) -> Result<(), String> {
    let conn = state.db();

    // 恢复自动封面：清掉自定义封面，若 Steam 缓存还在就继续用它
    if path.is_none() {
        let _ = conn.execute(
            "DELETE FROM settings WHERE key = ?1",
            params![format!("custom_cover_{game_id}")],
        );
        let appid: Option<i64> = conn
            .query_row("SELECT appid FROM games WHERE id = ?1", params![game_id], |r| r.get(0))
            .unwrap_or(None);
        let auto = appid.map(|a| state.cover_dir().join(format!("{a}.jpg")));
        let auto_path = auto.filter(|p| p.exists()).map(|p| p.display().to_string());
        conn.execute(
            "UPDATE games SET cover_path = ?1 WHERE id = ?2",
            params![auto_path, game_id],
        )
        .map_err(err)?;
        return Ok(());
    }

    let src = path.unwrap();
    let src_path = std::path::Path::new(&src);
    if !src_path.is_file() {
        return Err(anyhow!("封面文件不存在").to_string());
    }
    let ext = src_path
        .extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_else(|| "jpg".into());
    let dest = state.cover_dir().join(format!("custom-{game_id}.{ext}"));
    std::fs::copy(src_path, &dest).map_err(|e| format!("复制封面失败：{e}"))?;
    conn.execute(
        "UPDATE games SET cover_path = ?1 WHERE id = ?2",
        params![dest.display().to_string(), game_id],
    )
    .map_err(err)?;
    // 记住这是用户自选封面，刷新商店资料时不能覆盖。
    db::set_setting(&conn, &format!("custom_cover_{game_id}"), "1").map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn set_ach_source(state: State<'_, AppState>, game_id: String, source: String) -> Result<(), String> {
    let conn = state.db();
    conn.execute("UPDATE games SET ach_source = ?1 WHERE id = ?2", params![source, game_id])
        .map_err(err)?;
    Ok(())
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// 自动匹配时依次尝试的搜索词：
/// `Northwind2` 这种连写名，商店搜索多半空手而归，补一个 `Northwind 2` 再试。
pub fn search_terms(title: &str) -> Vec<String> {
    let base = title.trim().to_string();
    let mut terms = vec![base.clone()];

    let mut spaced = String::with_capacity(base.len() + 4);
    let mut prev_digit = false;
    for ch in base.chars() {
        let is_digit = ch.is_ascii_digit();
        if is_digit && !prev_digit && !spaced.is_empty() && !spaced.ends_with(' ') {
            spaced.push(' ');
        }
        spaced.push(ch);
        prev_digit = is_digit;
    }
    if spaced != base {
        terms.push(spaced);
    }

    let underscored = base.replace(['_', '-'], " ");
    if underscored != base && !terms.contains(&underscored) {
        terms.push(underscored);
    }

    // OxygenRequired / ColonyRimWin64 这种驼峰连写名，商店搜不到，拆开再试
    let camel = split_camel(&base);
    if camel != base && !terms.contains(&camel) {
        terms.push(camel);
    }
    terms
}

#[cfg(test)]
mod tests {
    use super::search_terms;

    #[test]
    fn adds_spaced_variant_for_digit_suffix() {
        let terms = search_terms("Northwind2");
        assert!(terms.iter().any(|t| t == "Northwind 2"));
    }

    #[test]
    fn splits_camel_case_folder_names() {
        let terms = search_terms("OxygenRequired");
        assert!(terms.iter().any(|t| t == "Oxygen Required"));
        let terms = search_terms("ColonyRimWin64");
        assert!(terms.iter().any(|t| t == "Rim World Win 64"));
    }

    #[test]
    fn replaces_separators_with_spaces() {
        let terms = search_terms("hollow-knight_silksong");
        assert!(terms.iter().any(|t| t == "hollow knight silksong"));
    }

    #[test]
    fn keeps_original_term_first() {
        assert_eq!(search_terms("Zephyr II")[0], "Zephyr II");
    }
}

fn split_camel(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len() + 6);
    let chars: Vec<char> = raw.chars().collect();
    for (i, ch) in chars.iter().enumerate() {
        let prev = if i > 0 { Some(chars[i - 1]) } else { None };
        let next = chars.get(i + 1).copied();
        let boundary = match prev {
            Some(p) => {
                (p.is_lowercase() && ch.is_uppercase())
                    || (p.is_alphabetic() && ch.is_ascii_digit())
                    || (p.is_ascii_digit() && ch.is_alphabetic())
                    || (p.is_uppercase() && ch.is_uppercase() && next.map(|n| n.is_lowercase()).unwrap_or(false))
            }
            None => false,
        };
        if boundary && !out.ends_with(' ') && !out.is_empty() {
            out.push(' ');
        }
        out.push(*ch);
    }
    out
}
