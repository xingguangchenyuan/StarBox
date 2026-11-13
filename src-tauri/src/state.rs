use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

use crate::models::RunningSession;
use crate::watcher::Procs;

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub procs: Procs,
    pub data_dir: PathBuf,
    /// 上次星匣退出时仍在运行、这次启动需要接管的会话
    pub recovered: Mutex<Vec<RunningSession>>,
}

impl AppState {
    pub fn new(conn: Connection, data_dir: PathBuf, recovered: Vec<RunningSession>) -> Self {
        Self {
            db: Arc::new(Mutex::new(conn)),
            procs: Arc::new(Mutex::new(std::collections::HashMap::new())),
            data_dir,
            recovered: Mutex::new(recovered),
        }
    }

    /// 取走待接管的会话（只取一次）
    pub fn take_recovered(&self) -> Vec<RunningSession> {
        std::mem::take(&mut *self.recovered.lock().unwrap_or_else(|e| e.into_inner()))
    }

    pub fn cover_dir(&self) -> PathBuf {
        let dir = self.data_dir.join("covers");
        let _ = std::fs::create_dir_all(&dir);
        dir
    }

    pub fn db(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.db.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// 机器相关的数据目录：%APPDATA%\StarBox
pub fn data_dir() -> PathBuf {
    let base = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    let dir = base.join("StarBox");
    let _ = std::fs::create_dir_all(&dir);
    dir
}
