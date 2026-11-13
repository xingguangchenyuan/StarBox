//! Windows Job Object 封装：把游戏进程放进独立的作业对象，
//! 这样「游戏启动器退出但游戏还在跑」的情况下也能继续被我们盯住，
//! 并且可以在关闭时一并清理整棵进程树。

#[cfg(windows)]
mod imp {
    use std::mem::size_of;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, QueryInformationJobObject, TerminateJobObject,
        JobObjectBasicAccountingInformation, JobObjectBasicProcessIdList,
        JOBOBJECT_BASIC_ACCOUNTING_INFORMATION, JOBOBJECT_BASIC_PROCESS_ID_LIST,
    };

    pub struct Job {
        handle: HANDLE,
    }

    // HANDLE 是进程内不透明句柄，跨线程传递由我们保证不重复释放
    unsafe impl Send for Job {}
    unsafe impl Sync for Job {}

    impl Job {
        pub fn create() -> Option<Job> {
            unsafe {
                let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if handle.is_null() {
                    return None;
                }
                // 不设置 JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE：星匣退出时
                // 游戏继续运行，不能因为启动器关闭就把用户正在玩的游戏杀掉。
                Some(Job { handle })
            }
        }

        /// 主动结束作业对象里的整棵进程树（用户点「结束游戏」时使用）。
        pub fn terminate(&self) -> bool {
            unsafe { TerminateJobObject(self.handle, 1) != 0 }
        }

        pub fn assign(&self, process: HANDLE) -> bool {
            unsafe { AssignProcessToJobObject(self.handle, process) != 0 }
        }

        /// 作业对象里还活着的进程数；查询失败返回 None
        pub fn active_processes(&self) -> Option<u32> {
            unsafe {
                let mut info: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION = std::mem::zeroed();
                let mut returned: u32 = 0;
                let ok = QueryInformationJobObject(
                    self.handle,
                    JobObjectBasicAccountingInformation,
                    &mut info as *mut _ as *mut std::ffi::c_void,
                    size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32,
                    &mut returned,
                );
                if ok == 0 {
                    None
                } else {
                    Some(info.ActiveProcesses)
                }
            }
        }

        /// 作业对象里还活着的进程 PID。用来在「切回游戏」时找到游戏的窗口。
        pub fn active_process_ids(&self) -> Vec<u32> {
            const CAP: usize = 128;
            unsafe {
                let mut buf = vec![
                    0u8;
                    size_of::<JOBOBJECT_BASIC_PROCESS_ID_LIST>()
                        + (CAP - 1) * size_of::<usize>()
                ];
                let mut returned: u32 = 0;
                let ok = QueryInformationJobObject(
                    self.handle,
                    JobObjectBasicProcessIdList,
                    buf.as_mut_ptr() as *mut std::ffi::c_void,
                    buf.len() as u32,
                    &mut returned,
                );
                if ok == 0 {
                    return Vec::new();
                }
                let list = &*(buf.as_ptr() as *const JOBOBJECT_BASIC_PROCESS_ID_LIST);
                let n = (list.NumberOfProcessIdsInList as usize).min(CAP);
                std::slice::from_raw_parts(list.ProcessIdList.as_ptr(), n)
                    .iter()
                    .map(|p| *p as u32)
                    .collect()
            }
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.handle);
            }
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub struct Job;
    impl Job {
        pub fn create() -> Option<Job> {
            None
        }
        pub fn assign(&self, _process: *mut std::ffi::c_void) -> bool {
            false
        }
        pub fn active_processes(&self) -> Option<u32> {
            None
        }
        pub fn active_process_ids(&self) -> Vec<u32> {
            Vec::new()
        }
        pub fn terminate(&self) -> bool {
            false
        }
    }
}

pub use imp::Job;

/// 从 std::process::Child 取原始句柄
#[cfg(windows)]
pub fn handle_of(child: &std::process::Child) -> *mut std::ffi::c_void {
    use std::os::windows::io::AsRawHandle;
    child.as_raw_handle() as *mut std::ffi::c_void
}

#[cfg(not(windows))]
pub fn handle_of(_child: &std::process::Child) -> *mut std::ffi::c_void {
    std::ptr::null_mut()
}
