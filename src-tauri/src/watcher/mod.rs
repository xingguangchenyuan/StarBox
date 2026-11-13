pub mod focus;
pub mod job;

use chrono::Utc;
use serde::Serialize;
use std::collections::HashMap;
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rusqlite::Connection;
use tauri::{AppHandle, Emitter};

use crate::util::split_args;
use crate::watcher::job::{handle_of, Job};

pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartedEvent {
    pub game_id: String,
    pub pid: u32,
    pub started_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExitedEvent {
    pub game_id: String,
    pub exit_code: Option<i32>,
    pub session_sec: i64,
    pub crashed: bool,
}

#[derive(Clone)]
pub struct Running {
    pub pid: u32,
    pub started_at: String,
    pub log_id: i64,
    /// 用来在「切回游戏」时枚举整棵进程树的窗口
    pub job: Option<Arc<Job>>,
}

pub type Procs = Arc<Mutex<HashMap<String, Running>>>;

/// 拉起进程并开始盯守。返回 (pid, 启动时间)。
pub fn spawn_and_watch(
    app: AppHandle,
    db: Arc<Mutex<Connection>>,
    procs: Procs,
    game_id: String,
    exe: String,
    work_dir: Option<String>,
    args: Option<String>,
    log_id: i64,
) -> anyhow::Result<(u32, String)> {
    let mut exe = exe;
    let mut work_dir = work_dir;
    let mut args = args;
    let mut exe_path = std::path::PathBuf::from(&exe);
    let mut ext = exe_path
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();

    // 首版早期入库的快捷方式可能还留在库里：启动时再解析一次
    if ext == "lnk" {
        let sc = crate::shortcut::resolve(&exe_path).map_err(anyhow::Error::msg)?;
        exe = sc.target.display().to_string();
        if args.as_deref().map(|a| a.trim().is_empty()).unwrap_or(true) && !sc.args.trim().is_empty() {
            args = Some(sc.args.clone());
        }
        if work_dir.as_deref().map(|d| d.trim().is_empty()).unwrap_or(true)
            && std::path::Path::new(&sc.work_dir).is_dir()
        {
            work_dir = Some(sc.work_dir);
        }
        exe_path = sc.target;
        ext = exe_path
            .extension()
            .map(|e| e.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();
    }

    if !exe_path.is_file() {
        anyhow::bail!("找不到可执行文件：{exe}");
    }

    // .bat / .cmd 不能直接 CreateProcess，要交给 cmd 解释器
    let is_batch = ext == "bat" || ext == "cmd";
    let mut cmd = if is_batch {
        let comspec = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".into());
        let mut c = Command::new(comspec);
        c.arg("/C").arg("call").arg(&exe_path);
        c
    } else {
        Command::new(&exe_path)
    };

    if let Some(dir) = work_dir.as_ref().filter(|d| !d.trim().is_empty()) {
        let p = std::path::Path::new(dir);
        if p.is_dir() {
            cmd.current_dir(p);
        } else if let Some(parent) = exe_path.parent() {
            cmd.current_dir(parent);
        }
    } else if let Some(parent) = exe_path.parent() {
        cmd.current_dir(parent);
    }
    if let Some(raw) = args.as_ref().filter(|a| !a.trim().is_empty()) {
        cmd.args(split_args(raw));
    }
    cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn()?;
    let pid = child.id();
    let started_at = Utc::now().to_rfc3339();

    let job = Job::create().filter(|j| j.assign(handle_of(&child))).map(Arc::new);

    procs.lock().unwrap().insert(
        game_id.clone(),
        Running {
            pid,
            started_at: started_at.clone(),
            log_id,
            job: job.clone(),
        },
    );

    let app_clone = app.clone();
    let game = game_id.clone();
    let started = started_at.clone();
    std::thread::spawn(move || {
        let mut zero_ticks = 0;
        let mut tick: u32 = 0;
        let mut exit_code: Option<i32> = None;

        loop {
            std::thread::sleep(Duration::from_millis(1000));
            tick += 1;

            let still_alive = match &job {
                Some(job) => match job.active_processes() {
                    Some(0) => {
                        zero_ticks += 1;
                        // 再确认一次，避免刚 spawn 时的计数空窗
                        zero_ticks < 2
                    }
                    Some(_) => {
                        // 根进程可能先退出、子进程还在；先记下根进程退出码，
                        // 但继续等 Job 里的进程树结束。
                        if let Ok(Some(status)) = child.try_wait() {
                            exit_code = status.code();
                        }
                        true
                    }
                    None => match child.try_wait() {
                        Ok(Some(status)) => {
                            exit_code = status.code();
                            false
                        }
                        Ok(None) => true,
                        Err(_) => false,
                    },
                },
                None => match child.try_wait() {
                    Ok(Some(status)) => {
                        exit_code = status.code();
                        false
                    }
                    Ok(None) => true,
                    Err(_) => false,
                },
            };

            if !still_alive && exit_code.is_none() {
                if let Ok(Some(status)) = child.try_wait() {
                    exit_code = status.code();
                }
            }

            if still_alive && tick % 30 == 0 {
                let elapsed = chrono::DateTime::parse_from_rfc3339(&started)
                    .map(|s| (Utc::now() - s.with_timezone(&Utc)).num_seconds().max(0))
                    .unwrap_or(0);
                if let Ok(conn) = db.lock() {
                    let _ = crate::db::checkpoint_session(&conn, log_id, elapsed);
                }
            }

            if !still_alive {
                break;
            }
        }

        // 结束：结算时长、写日志、通知前端
        let session_sec = chrono::DateTime::parse_from_rfc3339(&started)
            .map(|s| (Utc::now() - s.with_timezone(&Utc)).num_seconds().max(0))
            .unwrap_or(0);

        {
            let conn = db.lock().unwrap();
            let _ = crate::db::log_session_end(&conn, log_id, exit_code, session_sec);
            // 不足 5 秒视为误触/闪退，不计入时长
            if session_sec >= 5 {
                let _ = crate::db::add_playtime(&conn, &game, session_sec);
            }
        }
        procs.lock().unwrap().remove(&game);

        let crashed = exit_code.map(|c| c != 0).unwrap_or(false) && session_sec < 120;
        let game_for_sync = game.clone();
        let _ = app_clone.emit(
            "game://exited",
            ExitedEvent {
                game_id: game,
                exit_code,
                session_sec,
                crashed,
            },
        );

        // 退出后自动同步一次成就（本地文件或 Steam 账号），不阻塞结算
        let app_sync = app_clone.clone();
        tauri::async_runtime::spawn(async move {
            crate::commands::sync::auto_sync_game(app_sync, game_for_sync).await;
        });
    });

    Ok((pid, started_at))
}

/// 结束整棵进程树（taskkill /T 会带上子进程）
pub fn kill_tree(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    let status = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    matches!(status, Ok(s) if s.success())
}
