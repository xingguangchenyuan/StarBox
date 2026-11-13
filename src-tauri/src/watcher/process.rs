//! 进程工具：挂起启动 → 绑定作业 → 恢复，以及进程存活 / 创建时间查询。
//!
//! 为什么要「挂起启动」：`AssignProcessToJobObject` 只能把**当下**存在的进程
//! 拉进作业，子进程不会追溯。若先 `spawn()` 再建作业，包装器（`cmd /C call x.bat`、
//! 启动器 → 真正游戏）可能在绑定前的几毫秒里已经拉起了子进程，这些子进程就永远
//! 不在作业里，于是「结束游戏」杀不掉、会话也判不准。
//! 先以 `CREATE_SUSPENDED` 创建进程（此时还没有执行任何用户代码，不可能有子进程），
//! 建作业并绑定，再恢复主线程，就能保证整棵进程树都在作业里。

#[cfg(windows)]
mod imp {
    use std::mem::size_of;

    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD, THREADENTRY32,
    };
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, GetProcessTimes, OpenProcess, OpenThread, ResumeThread,
        PROCESS_QUERY_LIMITED_INFORMATION, THREAD_SUSPEND_RESUME,
    };

    const STILL_ACTIVE: u32 = 259;

    /// 恢复挂起进程的所有线程。挂起创建时只有一个主线程，这里仍按进程枚举，
    /// 避免将来 CreateProcess 行为差异导致漏恢复。
    pub fn resume_threads(pid: u32) -> usize {
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
            if snap == INVALID_HANDLE_VALUE || snap.is_null() {
                return 0;
            }
            let mut entry: THREADENTRY32 = std::mem::zeroed();
            entry.dwSize = size_of::<THREADENTRY32>() as u32;
            let mut resumed = 0usize;
            let mut ok = Thread32First(snap, &mut entry);
            while ok != 0 {
                if entry.th32OwnerProcessID == pid {
                    let th = OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID);
                    if !th.is_null() {
                        if ResumeThread(th) != u32::MAX {
                            resumed += 1;
                        }
                        CloseHandle(th);
                    }
                }
                ok = Thread32Next(snap, &mut entry);
            }
            CloseHandle(snap);
            resumed
        }
    }

    /// 进程是否还活着（已退出 / 不存在都算 false）。
    pub fn alive(pid: u32) -> bool {
        if pid == 0 {
            return false;
        }
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if h.is_null() {
                return false;
            }
            let mut code: u32 = 0;
            let ok = GetExitCodeProcess(h, &mut code);
            CloseHandle(h);
            ok != 0 && code == STILL_ACTIVE
        }
    }

    /// 进程创建时间（Unix 秒）。用来区分「同一个 PID 换了进程」。
    pub fn creation_unix(pid: u32) -> Option<i64> {
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if h.is_null() {
                return None;
            }
            let mut created: FILETIME = std::mem::zeroed();
            let mut exited: FILETIME = std::mem::zeroed();
            let mut kernel: FILETIME = std::mem::zeroed();
            let mut user: FILETIME = std::mem::zeroed();
            let ok = GetProcessTimes(h, &mut created, &mut exited, &mut kernel, &mut user);
            CloseHandle(h);
            if ok == 0 {
                return None;
            }
            let ticks = ((created.dwHighDateTime as u64) << 32) | created.dwLowDateTime as u64;
            // FILETIME 从 1601-01-01 起算，每 10^7 个 tick 一秒
            Some((ticks / 10_000_000) as i64 - 11_644_473_600)
        }
    }

    /// 记录的 pid 是否仍是当初那个进程（存活 + 创建时间对得上，防 PID 复用）。
    pub fn still_ours(pid: u32, started_at: &str) -> bool {
        if !alive(pid) {
            return false;
        }
        let Some(created) = creation_unix(pid) else {
            return false;
        };
        let Ok(stamp) = chrono::DateTime::parse_from_rfc3339(started_at) else {
            return false;
        };
        // 记录时间在 CreateProcess 之后，正常相差不到 1 秒；给 15 秒余量容忍时钟抖动
        let diff = (stamp.timestamp() - created).abs();
        diff <= 15
    }

}

#[cfg(not(windows))]
mod imp {
    pub fn resume_threads(_pid: u32) -> usize {
        0
    }
    pub fn alive(_pid: u32) -> bool {
        false
    }
    pub fn creation_unix(_pid: u32) -> Option<i64> {
        None
    }
    pub fn still_ours(_pid: u32, _started_at: &str) -> bool {
        false
    }
}

pub use imp::*;
