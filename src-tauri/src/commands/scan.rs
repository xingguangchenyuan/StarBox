use anyhow::Result;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::commands::common::{existing_keys, find_by_appid, find_by_exe, insert_game, NewGame};
use crate::db;
use crate::models::{FolderCandidate, Game, ScanPick, ScanResult};
use crate::steam;
use crate::state::AppState;

#[tauri::command(async)]
pub fn scan_libraries(state: State<'_, AppState>) -> Result<ScanResult, String> {
    let mut picks: Vec<ScanPick> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();

    let steam_root = steam::steam_root();
    let steam_root_str = steam_root.as_ref().map(|p| p.display().to_string());

    if let Some(root) = steam_root.as_ref() {
        let (apps, mut warns) = steam::installed_apps(root);
        warnings.append(&mut warns);
        for app in apps {
            match steam::resolve_exe(&app.install_dir, None) {
                Some(exe) => picks.push(ScanPick {
                    source: "steam".into(),
                    appid: Some(app.appid),
                    title: app.name.clone(),
                    install_dir: app.install_dir.display().to_string(),
                    exe_path: exe.display().to_string(),
                    playtime_sec: app.playtime_sec,
                    last_played_at: app.last_played,
                }),
                None => warnings.push(format!("「{}」的目录里没找到可执行文件，已跳过", app.name)),
            }
        }
    }

    let epic_root_str = steam::epic_manifest_dir().map(|p| p.display().to_string());
    let (epic, mut warns) = steam::epic_apps();
    warnings.append(&mut warns);
    for app in epic {
        let exe = steam::resolve_exe(&app.install_dir, Some(&app.exe))
            .or_else(|| steam::resolve_exe(&app.install_dir, None));
        match exe {
            Some(exe) => picks.push(ScanPick {
                source: "epic".into(),
                appid: None,
                title: app.title.clone(),
                install_dir: app.install_dir.display().to_string(),
                exe_path: exe.display().to_string(),
                playtime_sec: 0,
                last_played_at: None,
            }),
            None => warnings.push(format!("「{}」的目录里没找到可执行文件，已跳过", app.title)),
        }
    }

    let steam_count = picks.iter().filter(|p| p.source == "steam").count() as i64;
    let epic_count = picks.iter().filter(|p| p.source == "epic").count() as i64;

    let conn = state.db();
    let (known_appids, known_exes) = existing_keys(&conn).map_err(|e| e.to_string())?;
    let already = picks
        .iter()
        .filter(|p| {
            p.appid.map(|a| known_appids.contains(&a)).unwrap_or(false)
                || known_exes.contains(&p.exe_path.to_lowercase())
        })
        .count() as i64;

    Ok(ScanResult {
        picks,
        steam_root: steam_root_str,
        epic_root: epic_root_str,
        steam_count,
        epic_count,
        warnings,
        already_in_library: already,
    })
}

#[tauri::command]
pub async fn import_scan(app: AppHandle, picks: Vec<ScanPick>) -> Result<Vec<Game>, String> {    let state = app.state::<AppState>();
    let mut ids: Vec<(String, bool)> = Vec::new();

    {
        let conn = state.db();
        // 整批一个事务：中途失败不留「导了一半」的库，失败原因如实返回
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        for p in &picks {
            if find_by_exe(&tx, &p.exe_path).map_err(|e| e.to_string())?.is_some() {
                continue;
            }
            if let Some(appid) = p.appid {
                if find_by_appid(&tx, appid).map_err(|e| e.to_string())?.is_some() {
                    continue;
                }
            }
            let new = NewGame {
                title: p.title.clone(),
                title_en: None,
                appid: p.appid,
                platform: p.source.clone(),
                exe_path: Some(p.exe_path.clone()),
                work_dir: Some(p.install_dir.clone()),
                args: None,
                playtime_sec: p.playtime_sec,
                last_played_at: p.last_played_at.clone(),
                cover_path: None,
                banner_path: None,
            };
            let id = insert_game(&tx, &new).map_err(|e| format!("导入「{}」失败：{e}", p.title))?;
            ids.push((id, p.source == "steam"));
        }
        tx.commit().map_err(|e| format!("导入写入失败：{e}"))?;
    }

    // 后台补齐 Steam 资料与封面（不阻塞导入）
    if ids.iter().any(|(_, steam)| *steam) {
        let app_clone = app.clone();
        let db = state.db.clone();
        let cover_dir = state.cover_dir();
        let tasks: Vec<String> = ids.iter().filter(|(_, s)| *s).map(|(id, _)| id.clone()).collect();
        tauri::async_runtime::spawn(async move {
            for id in tasks {
                if crate::commands::steam::refresh_inner(db.clone(), cover_dir.clone(), &id, true)
                    .await
                    .is_ok()
                {
                    let _ = app_clone.emit("library://updated", id.clone());
                }
                tokio::time::sleep(std::time::Duration::from_millis(400)).await;
            }
        });
    }

    let conn = state.db();
    let mut games = Vec::new();
    for (id, _) in &ids {
        if let Ok(Some(g)) = db::get_game(&conn, id) {
            games.push(g);
        }
    }
    Ok(games)
}

/// 选一个文件夹，列出里面像样的启动程序，交给前端勾选。
/// 不再替用户自动决定「哪个是主程序」——只把最像的排在最前。
#[tauri::command(async)]
pub fn scan_folder(state: State<'_, AppState>, path: String) -> Result<Vec<FolderCandidate>, String> {
    let cleaned = crate::util::clean_path(&path);
    let dir = std::path::PathBuf::from(&cleaned);
    if !dir.is_dir() {
        return Err("文件夹不存在".to_string());
    }

    let candidates = crate::util::scan_exe_candidates(&dir);
    let conn = state.db();
    let (_, known_exes) = existing_keys(&conn).map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for (i, exe) in candidates.into_iter().take(40).enumerate() {
        let size_bytes = std::fs::metadata(&exe).map(|m| m.len() as i64).unwrap_or(0);
        let exe_path = exe.display().to_string();
        out.push(FolderCandidate {
            name: crate::util::candidate_title(&exe, &dir),
            in_library: known_exes.contains(&exe_path.to_lowercase()),
            path: exe_path,
            size_bytes,
            likely_main: i == 0,
        });
    }
    Ok(out)
}
