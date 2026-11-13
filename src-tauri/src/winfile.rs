//! 读 exe 的版本信息。
//!
//! 很多游戏的启动程序和游戏名对不上：`Zephyrx64.exe`、`NWNClient-Win64-Shipping.exe`、
//! `DekPakModAudit.exe`。但 exe 的版本信息里通常写着 `FileDescription` / `ProductName`
//! 这样的正式名称，拿来当搜索线索比文件名靠谱得多。

#[cfg(windows)]
mod imp {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;

    use windows_sys::Win32::Storage::FileSystem::{
        GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
    };

    fn wide(s: &OsStr) -> Vec<u16> {
        s.encode_wide().chain(std::iter::once(0)).collect()
    }

    /// 读 `\StringFileInfo\040904B0\<key>`（找不到语言块时退回英文块）。
    fn query(path: &Path, key: &str) -> Option<String> {
        let path_w = wide(path.as_os_str());
        unsafe {
            let mut handle: u32 = 0;
            let size = GetFileVersionInfoSizeW(path_w.as_ptr(), &mut handle);
            if size == 0 {
                return None;
            }
            let mut buf = vec![0u8; size as usize];
            if GetFileVersionInfoW(path_w.as_ptr(), 0, size, buf.as_mut_ptr() as *mut _) == 0 {
                return None;
            }

            for block in ["040904B0", "040904E4", "000004B0", "080404B0"] {
                let sub = format!("\\StringFileInfo\\{block}\\{key}");
                let sub_w = wide(OsStr::new(&sub));
                let mut ptr: *mut std::ffi::c_void = std::ptr::null_mut();
                let mut len: u32 = 0;
                let ok = VerQueryValueW(
                    buf.as_ptr() as *const _,
                    sub_w.as_ptr(),
                    &mut ptr,
                    &mut len,
                );
                if ok == 0 || ptr.is_null() || len == 0 {
                    continue;
                }
                let slice = std::slice::from_raw_parts(ptr as *const u16, len as usize);
                let text: String = String::from_utf16_lossy(slice);
                let text = text.trim_matches('\0').trim();
                if !text.is_empty() {
                    return Some(text.to_string());
                }
            }
            None
        }
    }

    pub fn describe(path: &Path) -> Option<String> {
        query(path, "FileDescription").or_else(|| query(path, "ProductName"))
    }
}

#[cfg(not(windows))]
mod imp {
    use std::path::Path;
    pub fn describe(_path: &Path) -> Option<String> {
        None
    }
}

pub use imp::describe;
