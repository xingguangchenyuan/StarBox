use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection};
use tauri::{Manager, State};

use crate::db;
use crate::models::{SteamRefreshResult, SteamSearchItem};
use crate::state::AppState;
use crate::steam::api;
use crate::util::html_to_text;

pub struct RefreshOutcome {
    pub cover_downloaded: bool,
    pub message: Option<String>,
}

/// 按名字搜 Steam 商店，让本地游戏能挑到自己的 AppID。
#[tauri::command]
pub async fn search_steam(query: String) -> Result<Vec<SteamSearchItem>, String> {
    let items = api::search_apps(&query).await.map_err(|e| e.to_string())?;
    Ok(items
        .into_iter()
        .map(|it| SteamSearchItem {
            appid: it.appid,
            name: it.name,
            name_en: it.name_en,
            tiny_image: it.tiny_image,
            price: it.price,
            score: None,
        })
        .collect())
}

fn hints_for(db: &Arc<Mutex<Connection>>, game_id: &str) -> Vec<String> {
    let conn = db.lock().unwrap();
    let row: Option<(String, Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT title, exe_path, work_dir FROM games WHERE id = ?1",
            params![game_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok();
    let Some((title, exe_path, work_dir)) = row else {
        return Vec::new();
    };
    let mut hints = vec![title];
    if let Some(exe) = exe_path.as_ref().map(std::path::PathBuf::from) {
        let wd = work_dir.as_ref().map(std::path::PathBuf::from);
        hints.extend(crate::util::title_hints(&exe, wd.as_deref()));
    }
    hints.retain(|h| !h.trim().is_empty());
    hints.dedup_by(|a, b| crate::util::normalize_name(a) == crate::util::normalize_name(b));
    hints
}

/// 按「游戏名 + 目录名 + exe 版本信息」一起搜，结果按相似度排序。
/// 手动匹配弹层用它开屏预填，省得用户自己猜该搜什么。
#[tauri::command]
pub async fn search_steam_for_game(
    state: State<'_, AppState>,
    game_id: String,
) -> Result<Vec<SteamSearchItem>, String> {
    let hints = hints_for(&state.db, &game_id);
    if hints.is_empty() {
        return Ok(Vec::new());
    }

    let mut items: Vec<api::SearchItem> = Vec::new();
    let mut tried: Vec<String> = Vec::new();
    for hint in hints.iter().take(3) {
        for term in crate::commands::library::search_terms(hint) {
            if tried.contains(&term) {
                continue;
            }
            tried.push(term.clone());
            if let Ok(found) = api::search_apps(&term).await {
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

    let ranked = api::rank_matches(&hints, &items);
    let mut out: Vec<SteamSearchItem> = ranked
        .iter()
        .take(12)
        .filter_map(|(appid, score)| items.iter().find(|x| x.appid == *appid).map(|it| (it, *score)))
        .map(|(it, score)| SteamSearchItem {
            appid: it.appid,
            name: it.name.clone(),
            name_en: it.name_en.clone(),
            tiny_image: it.tiny_image.clone(),
            price: it.price.clone(),
            score: Some(score),
        })
        .collect();

    // 分数为 0 的也留几条，方便用户自己翻
    if out.len() < 4 {
        for it in items.iter().take(8) {
            if !out.iter().any(|x| x.appid == it.appid) {
                out.push(SteamSearchItem {
                    appid: it.appid,
                    name: it.name.clone(),
                    name_en: it.name_en.clone(),
                    tiny_image: it.tiny_image.clone(),
                    price: it.price.clone(),
                    score: None,
                });
            }
        }
    }
    Ok(out)
}

/// 给本地游戏绑定 Steam AppID，然后立刻抓一次商店资料与封面。
/// 启动后在后台把「没有 AppID 的本地游戏」逐个认领一遍。
/// 只做高置信度匹配（见 `AUTO_BIND_MIN`），认不准就留着，交给用户在详情页手动选。
pub async fn auto_match_missing(app: tauri::AppHandle) {
    use tauri::Emitter;

    let state = app.state::<AppState>();
    let db = state.db.clone();
    let cover_dir = state.cover_dir();

    let ids: Vec<String> = {
        let conn = db.lock().unwrap();
        let mut stmt = match conn.prepare(
            "SELECT id FROM games WHERE appid IS NULL AND platform <> 'steam' ORDER BY added_at",
        ) {
            Ok(s) => s,
            Err(_) => return,
        };
        let rows = stmt.query_map([], |r| r.get::<_, String>(0));
        match rows {
            Ok(rows) => rows.flatten().collect(),
            Err(_) => return,
        }
    };
    if ids.is_empty() {
        return;
    }

    for game_id in ids {
        let hints = hints_for(&db, &game_id);
        if hints.is_empty() {
            continue;
        }

        let mut items: Vec<api::SearchItem> = Vec::new();
        let mut tried: Vec<String> = Vec::new();
        for hint in hints.iter().take(3) {
            for term in crate::commands::library::search_terms(hint) {
                if tried.contains(&term) {
                    continue;
                }
                tried.push(term.clone());
                if let Ok(found) = api::search_apps(&term).await {
                    for it in found {
                        if !items.iter().any(|x| x.appid == it.appid) {
                            items.push(it);
                        }
                    }
                }
                if items.len() >= 10 {
                    break;
                }
            }
        }

        if let Some(appid) = api::confident_match(&hints, &items) {
            let taken = {
                let conn = db.lock().unwrap();
                conn.query_row(
                    "SELECT id FROM games WHERE appid = ?1 AND id <> ?2 LIMIT 1",
                    params![appid, &game_id],
                    |r| r.get::<_, String>(0),
                )
                .ok()
                .is_some()
            };
            if !taken {
                let updated = {
                    let conn = db.lock().unwrap();
                    conn.execute(
                        "UPDATE games SET appid = ?1 WHERE id = ?2",
                        params![appid, &game_id],
                    )
                    .is_ok()
                };
                if updated {
                    if refresh_inner(db.clone(), cover_dir.clone(), &game_id, true)
                        .await
                        .is_ok()
                    {
                        let _ = app.emit("library://updated", game_id.clone());
                        if let Some(key) = crate::secret::load_api_key() {
                            if let Ok(defs) = api::fetch_schema(appid, &key).await {
                                let conn = db.lock().unwrap();
                                let _ = crate::commands::achievements::store_defs(
                                    &conn, &game_id, appid, &defs,
                                );
                                drop(conn);
                                let _ = app.emit("library://updated", game_id.clone());
                            }
                        }
                    }
                }
            }
        }

        tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
    }
}

#[tauri::command]
pub async fn match_steam(
    state: State<'_, AppState>,
    game_id: String,
    appid: i64,
) -> Result<SteamRefreshResult, String> {
    if appid <= 0 {
        return Err("AppID 不合法".to_string());
    }
    let old_appid = {
        let conn = state.db();
        let other: Option<String> = conn
            .query_row(
                "SELECT id FROM games WHERE appid = ?1 AND id <> ?2 LIMIT 1",
                params![appid, game_id],
                |r| r.get(0),
            )
            .ok();
        if other.is_some() {
            return Err("库里已经有这款 Steam 游戏了".to_string());
        }
        let old: Option<i64> = conn
            .query_row("SELECT appid FROM games WHERE id = ?1", params![game_id], |r| r.get(0))
            .ok();
        conn.execute(
            "UPDATE games SET appid = ?1 WHERE id = ?2",
            params![appid, game_id],
        )
        .map_err(|e| e.to_string())?;
        old
    };

    let cover_dir = state.cover_dir();
    let db = state.db.clone();
    let outcome = match refresh_inner(db.clone(), cover_dir, &game_id, true).await {
        Ok(o) => o,
        Err(e) => {
            // 资料没拿到就回滚 AppID，旧成就保持原样，避免半完成状态。
            if old_appid != Some(appid) {
                let conn = db.lock().unwrap();
                let _ = conn.execute(
                    "UPDATE games SET appid = ?1 WHERE id = ?2",
                    params![old_appid, game_id],
                );
            }
            return Err(e.to_string());
        }
    };

    // 换了一个 AppID：旧成就不能留在同一款游戏下，否则同 API 名会继承旧解锁状态。
    if old_appid != Some(appid) {
        let conn = db.lock().unwrap();
        conn.execute("DELETE FROM achievements WHERE game_id = ?1", params![game_id])
            .map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE games SET ach_source = 'none' WHERE id = ?1",
            params![game_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // 顺手把成就定义也拉下来：有 Key 才做，失败不影响资料
    if let Some(key) = crate::secret::load_api_key() {
        if let Ok(defs) = api::fetch_schema(appid, &key).await {
            let conn = db.lock().unwrap();
            let _ = crate::commands::achievements::store_defs(&conn, &game_id, appid, &defs);
        }
    }

    let conn = db.lock().unwrap();
    let game = db::get_game(&conn, &game_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "游戏不存在".to_string())?;
    Ok(SteamRefreshResult {
        game,
        cover_downloaded: outcome.cover_downloaded,
        message: outcome.message,
    })
}

#[tauri::command]
pub async fn refresh_steam_data(
    state: State<'_, AppState>,
    game_id: String,
    force: bool,
) -> Result<SteamRefreshResult, String> {
    let cover_dir = state.cover_dir();
    let db = state.db.clone();
    let outcome = refresh_inner(db.clone(), cover_dir, &game_id, force)
        .await
        .map_err(|e| e.to_string())?;
    let conn = db.lock().unwrap();
    let game = db::get_game(&conn, &game_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "游戏不存在".to_string())?;
    Ok(SteamRefreshResult {
        game,
        cover_downloaded: outcome.cover_downloaded,
        message: outcome.message,
    })
}

/// 抓商店资料 + 下载封面。`force=false` 时 7 天内不重复抓。
pub async fn refresh_inner(
    db: Arc<Mutex<Connection>>,
    cover_dir: PathBuf,
    game_id: &str,
    force: bool,
) -> Result<RefreshOutcome> {
    let (appid, fetched_at, title, title_en, custom_cover) = {
        let conn = db.lock().unwrap();
        let appid: Option<i64> = conn
            .query_row("SELECT appid FROM games WHERE id = ?1", params![game_id], |r| r.get(0))
            .map_err(|_| anyhow!("游戏不存在"))?;
        let fetched_at = db::get_setting(&conn, &format!("info_fetched_{game_id}")).unwrap_or(None);
        let title: String = conn
            .query_row("SELECT title FROM games WHERE id = ?1", params![game_id], |r| r.get(0))
            .unwrap_or_default();
        let title_en: Option<String> = conn
            .query_row("SELECT title_en FROM games WHERE id = ?1", params![game_id], |r| r.get(0))
            .unwrap_or(None);
        let custom_cover = db::bool_setting(&conn, &format!("custom_cover_{game_id}"), false);
        (appid, fetched_at, title, title_en, custom_cover)
    };

    let appid = appid.ok_or_else(|| anyhow!("这款游戏没有 Steam AppID，无法抓取商店资料"))?;

    if !force {
        if let Some(at) = fetched_at {
            if let Ok(ts) = chrono::DateTime::parse_from_rfc3339(&at) {
                if (chrono::Utc::now() - ts.with_timezone(&chrono::Utc)).num_days() < 7 {
                    return Ok(RefreshOutcome { cover_downloaded: false, message: Some("资料是最新的".into()) });
                }
            }
        }
    }

    let details = api::fetch_appdetails(appid).await?;

    // 封面：优先 Steam 竖版 library_600x900，失败则退回头图
    let cover_dest = cover_dir.join(format!("{appid}.jpg"));
    let banner_dest = cover_dir.join(format!("{appid}-header.jpg"));

    let mut cover_downloaded = false;
    let mut banner_path: Option<String> = None;
    let mut cover_path: Option<String> = None;

    if let Some(header) = details.header_image.as_ref() {
        if api::download_image(header, &banner_dest).await.is_ok() {
            banner_path = Some(banner_dest.display().to_string());
        }
    }

    let cover_url = details
        .cover_image
        .clone()
        .ok_or_else(|| anyhow!("没有封面地址"))?;
    if api::download_image(&cover_url, &cover_dest).await.is_ok() {
        cover_downloaded = true;
        cover_path = Some(cover_dest.display().to_string());
    } else if banner_path.is_some() {
        cover_path = banner_path.clone();
    }
    // 用户自选封面优先：刷新资料只更新其他字段，不覆盖 cover_path。
    let cover_path = if custom_cover { None } else { cover_path };

    let description = {
        let detailed = html_to_text(&details.detailed_description);
        if detailed.is_empty() {
            html_to_text(&details.short_description)
        } else {
            detailed
        }
    };
    let description_original = {
        let raw = details.description_original.trim();
        if raw.is_empty() {
            None
        } else {
            let text = html_to_text(raw);
            let text = text.trim();
            if text.is_empty() || text == description.trim() {
                None
            } else {
                Some(text.to_string())
            }
        }
    };
    let studio = if details.developers.is_empty() {
        None
    } else {
        Some(details.developers.join(" / "))
    };
    let release = if details.release_date.is_empty() { None } else { Some(details.release_date.clone()) };
    let genres = serde_json::to_string(&details.genres).unwrap_or_else(|_| "[]".into());
    let screenshots = serde_json::to_string(&details.screenshots).unwrap_or_else(|_| "[]".into());
    let movies = serde_json::to_string(&details.movies).unwrap_or_else(|_| "[]".into());
    let categories = serde_json::to_string(&details.categories).unwrap_or_else(|_| "[]".into());
    let publishers = serde_json::to_string(&details.publishers).unwrap_or_else(|_| "[]".into());

    // 标题规范化：原名放 title，中文名放 title_en
    let (new_title, new_title_en) =
        normalize_titles(&title, title_en.as_deref(), &details.name, details.name_original.as_deref());
    let fetched = chrono::Utc::now().to_rfc3339();

    {
        let conn = db.lock().unwrap();
        conn.execute(
            r#"UPDATE games SET
                 title = COALESCE(?1, title),
                 title_en = COALESCE(?2, title_en),
                 studio = COALESCE(?3, studio),
                 release_date = COALESCE(?4, release_date),
                 description = COALESCE(?5, description),
                 description_original = COALESCE(?6, description_original),
                 genres = ?7,
                 screenshots = ?8,
                 movies = ?9,
                 categories = ?10,
                 publishers = ?11,
                 review_total = ?12,
                 metacritic = ?13,
                 cover_path = COALESCE(?14, cover_path),
                 banner_path = COALESCE(?15, banner_path),
                 info_fetched_at = ?16
               WHERE id = ?17"#,
            params![
                new_title,
                new_title_en,
                studio,
                release,
                if description.is_empty() { None } else { Some(description) },
                description_original,
                genres,
                screenshots,
                movies,
                categories,
                publishers,
                details.review_total,
                details.metacritic,
                cover_path,
                banner_path,
                fetched,
                game_id
            ],
        )?;
        db::set_setting(&conn, &format!("info_fetched_{game_id}"), &fetched)?;
    }

    Ok(RefreshOutcome {
        cover_downloaded,
        message: Some(if cover_downloaded { "封面与资料已缓存".into() } else { "资料已更新，封面下载失败".to_string() }),
    })
}

fn has_cjk(s: &str) -> bool {
    s.chars().any(|c| matches!(c as u32, 0x3400..=0x9FFF | 0xF900..=0xFAFF))
}

/// 保证 `title` 是原名、`title_en` 是中文名：
/// - 当前标题是中文（常见于手动添加的文件夹名），商店有英文名 → 换成 英文原名 + 当前中文名；
/// - 当前标题是英文，商店有中文名 → 中文名补到 title_en；
/// - 都没有就保留现有 title_en（可能是用户手填的）。
fn normalize_titles(
    current: &str,
    current_alt: Option<&str>,
    zh: &str,
    en: Option<&str>,
) -> (Option<String>, Option<String>) {
    let current = current.trim();
    let zh = zh.trim();
    let en = en.unwrap_or("").trim();
    let zh_alt = if !zh.is_empty() && has_cjk(zh) {
        Some(zh.to_string())
    } else {
        None
    };

    // 1) 标题是中文（文件夹名）→ 英文官方名做原名，中文放副标题
    if has_cjk(current) && !en.is_empty() && !has_cjk(en) && !en.eq_ignore_ascii_case(current) {
        return (Some(en.to_string()), Some(current.to_string()));
    }

    // 2) 标题是 exe 名派生的：ColonyRimWin64 / xxxClient / xxxx64
    let lower = current.to_ascii_lowercase();
    let looks_like_exe = ["win64", "win32", "x64", "x86", "shipping", "client", "launcher"]
        .iter()
        .any(|suf| lower.ends_with(suf) && current.len() > suf.len() + 3);
    if looks_like_exe && !en.is_empty() && !en.eq_ignore_ascii_case(current) {
        return (Some(en.to_string()), zh_alt.or_else(|| current_alt.map(|s| s.to_string())));
    }

    // 3) 连写名（Northwind2 / ritualsimulator）→ 商店带空格的名字
    if !current.contains(' ') && en.contains(' ') && !en.eq_ignore_ascii_case(current) {
        return (Some(en.to_string()), zh_alt.or_else(|| current_alt.map(|s| s.to_string())));
    }

    // 4) 只是大小写不同（stellarreach → Stellar Reach）
    if !en.is_empty() && current.eq_ignore_ascii_case(en) && current != en {
        return (Some(en.to_string()), zh_alt.or_else(|| current_alt.map(|s| s.to_string())));
    }

    // 5) 标题没问题，只补中文名
    if let Some(zh_name) = zh_alt {
        if zh_name != current {
            return (None, Some(zh_name));
        }
    }
    (None, current_alt.filter(|s| !s.trim().is_empty()).map(|s| s.to_string()))
}
