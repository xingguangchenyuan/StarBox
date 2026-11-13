//! 把已经在跑的游戏窗口切到最前。
//!
//! 启动器里「切回游戏」如果只是发个 Toast 而不真的切窗口，那就是骗人。
//! 这里按进程 PID 找顶层窗口，能恢复最小化并置前；找不到就如实返回 false，
//! 让前端说「游戏正在运行」而不是谎称已切回。

#[cfg(windows)]
mod imp {
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, EnumWindows, GetForegroundWindow, GetWindow, GetWindowTextLengthW,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindow,
        GW_OWNER, SW_RESTORE,
    };

    struct Ctx {
        pids: *const u32,
        len: usize,
        skip_owned: bool,
        found: HWND,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam as *mut Ctx);
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }
        if ctx.skip_owned && !GetWindow(hwnd, GW_OWNER).is_null() {
            return 1;
        }
        if GetWindowTextLengthW(hwnd) == 0 {
            return 1;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        let pids = std::slice::from_raw_parts(ctx.pids, ctx.len);
        if pids.contains(&pid) {
            ctx.found = hwnd;
            return 0; // 找到就停
        }
        1
    }

    fn find_window(pids: &[u32], skip_owned: bool) -> HWND {
        let mut ctx = Ctx { pids: pids.as_ptr(), len: pids.len(), skip_owned, found: std::ptr::null_mut() };
        unsafe {
            EnumWindows(Some(enum_proc), &mut ctx as *mut Ctx as LPARAM);
        }
        ctx.found
    }

    pub fn focus_pids(pids: &[u32]) -> bool {
        if pids.is_empty() {
            return false;
        }
        // 先找没有 owner 的主窗口，避免把启动器的对话框/启动画面放到前面
        let mut hwnd = find_window(pids, true);
        if hwnd.is_null() {
            hwnd = find_window(pids, false);
        }
        if hwnd.is_null() {
            return false;
        }
        unsafe {
            if IsIconic(hwnd) != 0 {
                ShowWindow(hwnd, SW_RESTORE);
            }
            // Windows 默认禁止后台进程抢前台。用户点「切回游戏」时我们本来就在前台，
            // 直接 SetForegroundWindow 通常就行；失败时再用线程输入队列附加的常规做法兜底。
            if SetForegroundWindow(hwnd) != 0 {
                return true;
            }

            let current = GetCurrentThreadId();
            let fg = GetForegroundWindow();
            let fg_thread = if fg.is_null() { 0 } else { GetWindowThreadProcessId(fg, std::ptr::null_mut()) };
            let target_thread = GetWindowThreadProcessId(hwnd, std::ptr::null_mut());

            let mut attached_current = false;
            let mut attached_target = false;
            if fg_thread != 0 && fg_thread != current {
                attached_current = AttachThreadInput(current, fg_thread, 1) != 0;
            }
            if target_thread != 0 && target_thread != current {
                attached_target = AttachThreadInput(current, target_thread, 1) != 0;
            }

            BringWindowToTop(hwnd);
            let ok = SetForegroundWindow(hwnd) != 0;

            if attached_current {
                AttachThreadInput(current, fg_thread, 0);
            }
            if attached_target {
                AttachThreadInput(current, target_thread, 0);
            }
            ok
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn focus_pids(_pids: &[u32]) -> bool {
        false
    }
}

pub use imp::focus_pids;
