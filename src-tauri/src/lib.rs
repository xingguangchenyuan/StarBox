#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod models;
mod net;
mod secret;
mod shortcut;
mod state;
mod steam;
mod util;
mod watcher;
mod winfile;

use tauri::Manager;

use crate::state::AppState;

pub fn run() {
    let data_dir = state::data_dir();
    let db_path = data_dir.join("starbox.db");
    let conn = match rusqlite::Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => fatal(&format!(
            "无法打开本地数据库：{e}\n\n路径：{}\n\n请确认文件没有被占用、磁盘可写。",
            db_path.display()
        )),
    };
    if let Err(e) = db::init(&conn, &db_path) {
        fatal(&format!(
            "数据库初始化失败：{e}\n\n路径：{}\n\n如果反复出现，可以备份后删除该文件再启动。",
            db_path.display()
        ));
    }

    // 上次星匣退出/崩溃时游戏可能还在跑：
    // 进程还活着的会话留给后面接管，其余把最后检查点结算掉，避免永久挂起的会话。
    let mut recovered = db::list_running_sessions(&conn).unwrap_or_default();
    let mut keep: Vec<i64> = Vec::new();
    for row in &recovered {
        if watcher::process::still_ours(row.pid, &row.started_at) {
            keep.push(row.log_id);
        } else {
            let _ = db::clear_running_session(&conn, &row.game_id);
        }
    }
    recovered.retain(|r| keep.contains(&r.log_id));
    if let Err(e) = db::recover_open_sessions(&conn, &keep) {
        eprintln!("恢复未结算会话失败：{e}");
    }

    let app_state = state::AppState::new(conn, data_dir, recovered);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::library::app_info,
            commands::library::list_games,
            commands::library::list_tags,
            commands::library::create_tag,
            commands::library::update_tag,
            commands::library::delete_tag,
            commands::library::add_game,
            commands::library::delete_game,
            commands::library::set_favorite,
            commands::library::set_hidden,
            commands::library::set_game_tags,
            commands::library::set_game_titles,
            commands::library::update_game_paths,
            commands::library::set_game_cover,
            commands::library::set_ach_source,
            commands::scan::scan_libraries,
            commands::scan::import_scan,
            commands::scan::scan_folder,
            commands::steam::refresh_steam_data,
            commands::steam::search_steam,
            commands::steam::search_steam_for_game,
            commands::steam::match_steam,
            commands::achievements::list_achievements,
            commands::achievements::fetch_achievements,
            commands::achievements::set_achievement_unlocked,
            commands::sync::sync_achievements,
            commands::sync::sync_all_achievements,
            commands::sync::detect_steam_id,
            commands::launch::launch_game,
            commands::launch::stop_game,
            commands::mods::list_mods,
            commands::mods::scan_mods,
            commands::mods::set_mods_dir,
            commands::mods::set_mod_enabled,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::open_data_dir,
        ])
        .setup(|app| {
            // 封面走 asset:// 协议加载。数据目录是 %APPDATA%\StarBox（不是 Tauri 默认的
            // 按 identifier 命名的目录），所以这里按实际目录放行，配置文件里的 scope 不够用。
            let data_dir = app.state::<AppState>().data_dir.clone();
            if let Err(e) = app.asset_protocol_scope().allow_directory(&data_dir, true) {
                eprintln!("允许封面目录失败：{e}");
            }

            if let Some(window) = app.get_webview_window("main") {
                // 按屏幕工作区自适应：高 DPI 屏幕上 1440×900 会超出屏幕，
                // 所以取工作区的 94%，且不超过设计稿尺寸。
                if let Ok(Some(monitor)) = window.primary_monitor() {
                    let scale = monitor.scale_factor();
                    let area = monitor.work_area();
                    let avail_w = area.size.width as f64 / scale;
                    let avail_h = area.size.height as f64 / scale;
                    let w = (avail_w * 0.94).clamp(900.0, 1440.0);
                    let h = (avail_h * 0.94).clamp(600.0, 900.0);
                    let _ = window.set_size(tauri::LogicalSize::new(w, h));
                }
                let _ = window.center();
                let _ = window.show();
            }

            // 接管上次没关掉、现在还在跑的游戏（没有作业句柄，按 pid + 创建时间认领）
            let state = app.state::<AppState>();
            let pending = state.take_recovered();
            if !pending.is_empty() {
                let handle = app.handle().clone();
                let db = state.db.clone();
                let procs = state.procs.clone();
                watcher::resume_recovered(handle, db, procs, pending);
            }

            // 启动后台把没认领的本地游戏匹配到 Steam（低干扰、只做高置信度）
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                commands::steam::auto_match_missing(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("星匣启动失败");
}

/// 启动期致命错误：release 没有控制台，必须弹窗告诉用户原因，否则进程直接消失。
fn fatal(message: &str) -> ! {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
        let text: Vec<u16> = message.encode_utf16().chain(std::iter::once(0)).collect();
        let title: Vec<u16> = "星匣 StarBox".encode_utf16().chain(std::iter::once(0)).collect();
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            title.as_ptr(),
            MB_OK | MB_ICONERROR,
        );
    }
    eprintln!("{message}");
    std::process::exit(1);
}
