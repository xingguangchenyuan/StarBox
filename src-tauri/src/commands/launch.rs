use anyhow::Result;
use rusqlite::params;
use tauri::{Emitter, State};

use crate::db;
use crate::models::LaunchInfo;
use crate::state::AppState;
use crate::watcher::{kill_tree, spawn_and_watch, StartedEvent};

#[tauri::command]
pub fn launch_game(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    game_id: String,
) -> Result<LaunchInfo, String> {
    // 已在运行：把游戏窗口切到最前（找不到窗口时 front 端会如实提示「游戏正在运行」）
    let existing = state
        .procs
        .lock()
        .unwrap()
        .get(&game_id)
        .map(|r| (r.pid, r.started_at.clone(), r.job.clone()));
    if let Some((pid, started_at, job)) = existing {
        let mut pids = vec![pid];
        if let Some(job) = job.as_ref() {
            pids.extend(job.active_process_ids());
        }
        pids.sort_unstable();
        pids.dedup();
        let focused = crate::watcher::focus::focus_pids(&pids);
        return Ok(LaunchInfo { game_id, pid, started_at, focused });
    }

    let (exe, work_dir, args) = {
        let conn = state.db();
        let row: Option<(Option<String>, Option<String>, Option<String>)> = conn
            .query_row(
                "SELECT exe_path, work_dir, args FROM games WHERE id = ?1",
                params![game_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .ok();
        row.ok_or_else(|| "游戏不存在".to_string())?
    };

    let exe = exe.filter(|e| !e.trim().is_empty()).ok_or_else(|| {
        "这款游戏还没有可执行文件路径，去「启动选项」里补上".to_string()
    })?;

    let started = chrono::Utc::now().to_rfc3339();
    let log_id = {
        let conn = state.db();
        db::log_session_start(&conn, &game_id, &started).map_err(|e| e.to_string())?
    };

    let (pid, started_at) = spawn_and_watch(
        app.clone(),
        state.db.clone(),
        state.procs.clone(),
        game_id.clone(),
        exe,
        work_dir,
        args,
        log_id,
    )
    .map_err(|e| e.to_string())?;

    {
        let conn = state.db();
        let _ = db::mark_last_played(&conn, &game_id, &started_at);
    }

    let _ = app.emit(
        "game://started",
        StartedEvent {
            game_id: game_id.clone(),
            pid,
            started_at: started_at.clone(),
        },
    );

    Ok(LaunchInfo { game_id, pid, started_at, focused: false })
}

#[tauri::command]
pub fn stop_game(state: State<'_, AppState>, game_id: String) -> Result<bool, String> {
    let entry = state
        .procs
        .lock()
        .unwrap()
        .get(&game_id)
        .map(|r| (r.pid, r.job.clone()));
    let Some((pid, job)) = entry else {
        return Ok(false);
    };

    // 父进程可能已经退出（启动器 → 游戏子进程），taskkill /T 会失败；
    // Job 句柄仍然覆盖整棵进程树，优先用它来结束。
    if let Some(job) = job {
        if job.terminate() {
            return Ok(true);
        }
    }
    if pid == 0 {
        return Ok(false);
    }
    Ok(kill_tree(pid))
}
