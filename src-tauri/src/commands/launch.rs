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
        let row = conn.query_row(
            "SELECT exe_path, work_dir, args FROM games WHERE id = ?1",
            params![game_id],
            |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, Option<String>>(2)?)),
        );
        match row {
            Ok(v) => v,
            // 只有「没查到」才叫不存在；锁超时/库损坏要如实报出来，否则用户只会反复重试
            Err(rusqlite::Error::QueryReturnedNoRows) => return Err("游戏不存在".to_string()),
            Err(e) => return Err(format!("读取游戏信息失败：{e}")),
        }
    };

    let exe = exe.filter(|e| !e.trim().is_empty()).ok_or_else(|| {
        "这款游戏还没有可执行文件路径，去「启动选项」里补上".to_string()
    })?;

    let started = chrono::Utc::now().to_rfc3339();
    let log_id = {
        let conn = state.db();
        db::log_session_start(&conn, &game_id, &started).map_err(|e| e.to_string())?
    };

    let (pid, started_at) = match spawn_and_watch(
        app.clone(),
        state.db.clone(),
        state.procs.clone(),
        game_id.clone(),
        exe,
        work_dir,
        args,
        log_id,
    ) {
        Ok(v) => v,
        Err(e) => {
            // 启动失败就别留一条永远不结算的会话
            let conn = state.db();
            let _ = db::log_session_end(&conn, log_id, None, 0);
            return Err(e.to_string());
        }
    };

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
        .map(|r| (r.pid, r.job.clone(), r.started_at.clone()));
    let Some((pid, job, started_at)) = entry else {
        return Ok(false);
    };

    // PID 可能已被系统回收：先确认还是当初那个进程，避免误杀无关程序
    let ours = crate::watcher::process::still_ours(pid, &started_at);

    // 父进程可能已经退出（启动器 → 游戏子进程），taskkill /T 会失败；
    // 作业句柄仍然覆盖整棵进程树，优先用它来结束。
    if let Some(job) = job.as_ref() {
        let active = job.active_processes().unwrap_or(0);
        if active > 0 {
            let _ = job.terminate();
            // TerminateJobObject 对空作业也返回成功，必须复核作业是否真的清空
            for _ in 0..20 {
                if job.active_processes().unwrap_or(0) == 0 {
                    return Ok(true);
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            return Ok(job.active_processes().unwrap_or(0) == 0);
        }
    }

    if !ours {
        return Ok(false);
    }
    let killed = kill_tree(pid);
    for _ in 0..10 {
        if !crate::watcher::process::alive(pid) {
            return Ok(true);
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    Ok(killed)
}
