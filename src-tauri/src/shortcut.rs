//! 解析 Windows 快捷方式（.lnk）。
//!
//! 启动器允许用户直接挑一个 .lnk（桌面快捷方式是最常见的入库入口），
//! 但 `CreateProcess` 不认识 .lnk，必须先读出它指向的程序。
//! 这里借 Windows 自带的 WScript.Shell COM 对象做解析——只是读属性，
//! 不执行快捷方式里的任何东西。

use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct Shortcut {
    pub target: PathBuf,
    pub args: String,
    pub work_dir: String,
}

/// 读取 .lnk 的目标、参数与工作目录。失败时返回可直接展示给用户的中文原因。
pub fn resolve(path: &Path) -> Result<Shortcut, String> {
    if !path.is_file() {
        return Err(format!("快捷方式不存在：{}", path.display()));
    }

    // 单引号转义；用带前缀的输出，避免空参数导致行错位。
    let escaped = path.display().to_string().replace('\'', "''");
    let script = format!(
        "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;\
         $s=(New-Object -ComObject WScript.Shell).CreateShortcut('{escaped}');\
         Write-Output ('T=' + $s.TargetPath);\
         Write-Output ('A=' + $s.Arguments);\
         Write-Output ('W=' + $s.WorkingDirectory)"
    );

    let out = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map_err(|e| format!("无法读取快捷方式：{e}"))?;

    if !out.status.success() {
        return Err("读取快捷方式失败：系统返回了错误".to_string());
    }

    let text = String::from_utf8_lossy(&out.stdout);
    let mut target = String::new();
    let mut args = String::new();
    let mut work_dir = String::new();
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("T=") {
            target = rest.trim().to_string();
        } else if let Some(rest) = line.strip_prefix("A=") {
            args = rest.trim().to_string();
        } else if let Some(rest) = line.strip_prefix("W=") {
            work_dir = rest.trim().to_string();
        }
    }

    if target.is_empty() {
        return Err("这个快捷方式没有目标程序（可能是网址，或已经失效）".to_string());
    }

    Ok(Shortcut {
        target: PathBuf::from(target),
        args,
        work_dir,
    })
}
