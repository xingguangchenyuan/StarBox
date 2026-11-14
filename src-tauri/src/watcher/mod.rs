pub mod focus;
pub mod job;
pub mod process;

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
/// 挂起创建：先绑作业再恢复执行，保证整棵进程树都在作业里。
pub const CREATE_SUSPENDED: u32 = 0x0000_0004;

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
    /// 用来在「切回游戏」时枚举整棵进程树的窗口；重启后接管的会话没有作业句柄
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

    // Windows 的 CreateProcess 走 ANSI/宽字符路径，超过 260 字符就报「找不到路径」。
    // 先试 8.3 短名把长度压回去；压不回去就明确告诉用户，而不是抛 os error 3。
    let mut exe_cmd = exe_path.clone();
    let mut dir_cmd = work_dir.as_ref().map(std::path::PathBuf::from).filter(|p| p.is_dir());
    if crate::util::path_chars(&exe_cmd) > 250 {
        if let Some(short) = crate::util::short_path(&exe_cmd) {
            exe_cmd = short;
        }
    }
    if let Some(dir) = dir_cmd.as_ref() {
        if crate::util::path_chars(dir) > 250 {
            if let Some(short) = crate::util::short_path(dir) {
                dir_cmd = Some(short);
            }
        }
    }
    if crate::util::path_chars(&exe_cmd) > 259 {
        anyhow::bail!(
            "程序路径太长（{} 个字符），Windows 启动程序最多 260 个字符；把这个游戏移到更短的目录再试",
            crate::util::path_chars(&exe_path)
        );
    }

    // .bat / .cmd 不能直接 CreateProcess，要交给 cmd 解释器
    let is_batch = ext == "bat" || ext == "cmd";
    let mut cmd = if is_batch {
        let comspec = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".into());
        let mut c = Command::new(comspec);
        // 批处理本身也走短路径，否则 cmd 会读不到文件
        c.arg("/C").arg("call").arg(&exe_cmd);
        c
    } else {
        Command::new(&exe_cmd)
    };

    if let Some(dir) = dir_cmd.as_ref() {
        cmd.current_dir(dir);
    } else if let Some(parent) = exe_cmd.parent() {
        cmd.current_dir(parent);
    }
    if let Some(raw) = args.as_ref().filter(|a| !a.trim().is_empty()) {
        cmd.args(split_args(raw));
    }
    cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    cmd.creation_flags(CREATE_NO_WINDOW | CREATE_SUSPENDED);

    let mut child = cmd.spawn()?;
    let pid = child.id();

    // 此时进程还没有执行任何指令：建作业并绑定，再恢复主线程。
    let job = Job::create()
        .and_then(|j| if j.assign(handle_of(&child)) { Some(j) } else { None })
        .map(Arc::new);
    let resumed = process::resume_threads(pid);
    if resumed == 0 {
        // 恢复失败会让窗口永远不出现（进程挂起），宁可如实报错
        let _ = child.kill();
        anyhow::bail!("启动失败：进程已创建但无法恢复执行");
    }

    let started_at = Utc::now().to_rfc3339();

    procs.lock().unwrap().insert(
        game_id.clone(),
        Running {
            pid,
            started_at: started_at.clone(),
            log_id,
            job: job.clone(),
        },
    );
    if let Ok(conn) = db.lock() {
        let _ = crate::db::save_running_session(&conn, &game_id, pid, &started_at, log_id);
    }

    let app_clone = app.clone();
    let game = game_id.clone();
    let started = started_at.clone();
    std::thread::spawn(move || {
        let mut tick: u32 = 0;
        let mut exit_code: Option<i32> = None;

        loop {
            std::thread::sleep(Duration::from_millis(1000));
            tick += 1;

            // 根进程先退出、子进程还在的情况很常见（包装器启动），
            // 所以存活判据是「根进程活着 或 作业里还有进程」。
            let mut root_alive = false;
            match child.try_wait() {
                Ok(Some(status)) => {
                    if exit_code.is_none() {
                        exit_code = status.code();
                    }
                }
                Ok(None) => root_alive = true,
                Err(_) => {}
            }
            let job_alive = job
                .as_ref()
                .and_then(|j| j.active_processes())
                .map(|n| n > 0)
                .unwrap_or(false);

            if !root_alive && !job_alive {
                break;
            }

            if tick % 30 == 0 {
                let elapsed = chrono::DateTime::parse_from_rfc3339(&started)
                    .map(|s| (Utc::now() - s.with_timezone(&Utc)).num_seconds().max(0))
                    .unwrap_or(0);
                if let Ok(conn) = db.lock() {
                    let _ = crate::db::checkpoint_session(&conn, log_id, elapsed);
                }
            }
        }

        finish_session(app_clone, db, procs, game, log_id, started, exit_code);
    });

    Ok((pid, started_at))
}

/// 星匣重启后接管仍在运行的游戏：没有作业句柄，只按 pid + 创建时间认领。
pub fn resume_recovered(
    app: AppHandle,
    db: Arc<Mutex<Connection>>,
    procs: Procs,
    rows: Vec<crate::models::RunningSession>,
) {
    for row in rows {
        if !process::still_ours(row.pid, &row.started_at) || !process::alive(row.pid) {
            if let Ok(conn) = db.lock() {
                let _ = crate::db::clear_running_session(&conn, &row.game_id);
            }
            continue;
        }
        procs.lock().unwrap().insert(
            row.game_id.clone(),
            Running {
                pid: row.pid,
                started_at: row.started_at.clone(),
                log_id: row.log_id,
                job: None,
            },
        );

        let app = app.clone();
        let db = db.clone();
        let procs = procs.clone();
        let game = row.game_id.clone();
        let started = row.started_at.clone();
        let log_id = row.log_id;
        let pid = row.pid;
        std::thread::spawn(move || {
            let mut tick: u32 = 0;
            loop {
                std::thread::sleep(Duration::from_millis(1000));
                tick += 1;
                if !process::alive(pid) {
                    break;
                }
                if tick % 30 == 0 {
                    let elapsed = chrono::DateTime::parse_from_rfc3339(&started)
                        .map(|s| (Utc::now() - s.with_timezone(&Utc)).num_seconds().max(0))
                        .unwrap_or(0);
                    if let Ok(conn) = db.lock() {
                        let _ = crate::db::checkpoint_session(&conn, log_id, elapsed);
                    }
                }
            }
            finish_session(app, db, procs, game, log_id, started, None);
        });
    }
}

/// 会话收尾：结算时长、清运行记录、通知前端、补同步成就。
fn finish_session(
    app: AppHandle,
    db: Arc<Mutex<Connection>>,
    procs: Procs,
    game: String,
    log_id: i64,
    started: String,
    exit_code: Option<i32>,
) {
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
        let _ = crate::db::clear_running_session(&conn, &game);
    }
    procs.lock().unwrap().remove(&game);

    let crashed = exit_code.map(|c| c != 0).unwrap_or(false) && session_sec < 120;
    let game_for_sync = game.clone();
    let _ = app.emit(
        "game://exited",
        ExitedEvent {
            game_id: game,
            exit_code,
            session_sec,
            crashed,
        },
    );

    // 退出后自动同步一次成就（本地文件或 Steam 账号），不阻塞结算
    let app_sync = app.clone();
    tauri::async_runtime::spawn(async move {
        crate::commands::sync::auto_sync_game(app_sync, game_for_sync).await;
    });
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
