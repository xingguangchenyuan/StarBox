pub mod api;
pub mod vdf;

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::util::{find_main_exe, unix_to_rfc3339};

#[derive(Debug, Clone)]
pub struct SteamApp {
    pub appid: i64,
    pub name: String,
    pub install_dir: PathBuf,
    pub last_played: Option<String>,
    pub playtime_sec: i64,
}

#[derive(Debug, Clone)]
pub struct EpicApp {
    pub app_name: String,
    pub title: String,
    pub install_dir: PathBuf,
    pub exe: PathBuf,
}

pub fn steam_root() -> Option<PathBuf> {
    // 1) 注册表 HKCU\Software\Valve\Steam\SteamPath
    if let Ok(key) = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
        .open_subkey(r"Software\Valve\Steam")
    {
        if let Ok(path) = key.get_value::<String, _>("SteamPath") {
            let p = PathBuf::from(path.replace('/', "\\"));
            if p.join("steamapps").exists() {
                return Some(p);
            }
        }
    }

    // 2) 常见安装位置
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(pf) = std::env::var("ProgramFiles(x86)") {
        candidates.push(PathBuf::from(pf).join("Steam"));
    }
    if let Ok(pf) = std::env::var("ProgramFiles") {
        candidates.push(PathBuf::from(pf).join("Steam"));
    }
    for drive in ["C", "D", "E", "F", "G"] {
        candidates.push(PathBuf::from(format!("{drive}:\\Steam")));
        candidates.push(PathBuf::from(format!("{drive}:\\SteamLibrary")));
        candidates.push(PathBuf::from(format!("{drive}:\\Program Files (x86)\\Steam")));
    }
    for c in candidates {
        if c.join("steamapps").exists() {
            return Some(c);
        }
    }
    None
}

/// 从本机 Steam 的 loginusers.vdf 读出当前登录账号的 SteamID64。
/// 只读文件，不碰账号密码；用来给设置里的 SteamID 输入框做预填。
pub fn current_steam_id() -> Option<String> {
    let root = steam_root()?;
    let tree = vdf::parse_file(&root.join("config").join("loginusers.vdf"))?;
    let users = tree.get_ci("users")?;
    let vdf::Vdf::Obj(map) = users else { return None };
    let mut fallback: Option<String> = None;
    for (id, node) in map {
        if id.len() != 17 || !id.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        if fallback.is_none() {
            fallback = Some(id.clone());
        }
        if node
            .get_ci("MostRecent")
            .and_then(|v| v.as_i64())
            .unwrap_or(0)
            == 1
        {
            return Some(id.clone());
        }
    }
    fallback
}

pub fn steam_libraries(root: &Path) -> Vec<PathBuf> {
    let mut libs: Vec<PathBuf> = vec![root.to_path_buf()];
    let vdf_path = root.join("steamapps").join("libraryfolders.vdf");
    if let Some(tree) = vdf::parse_file(&vdf_path) {
        if let Some(node) = tree.get_ci("libraryfolders") {
            for entry in node.values() {
                let path = entry
                    .get_ci("path")
                    .and_then(|v| v.as_str())
                    .map(|s| s.replace("\\\\", "\\"))
                    .or_else(|| entry.as_str().map(|s| s.to_string()));
                if let Some(p) = path {
                    let pb = PathBuf::from(p);
                    if pb.join("steamapps").exists() && !libs.iter().any(|l| l == &pb) {
                        libs.push(pb);
                    }
                }
            }
        }
    }
    libs
}

/// 读 userdata 下的 localconfig.vdf 拿 Playtime（分钟）
pub fn steam_playtimes(root: &Path) -> HashMap<i64, i64> {
    let mut map = HashMap::new();
    let userdata = root.join("userdata");
    let Ok(entries) = std::fs::read_dir(&userdata) else { return map };

    let mut best: Option<PathBuf> = None;
    let mut best_time = std::time::SystemTime::UNIX_EPOCH;
    for entry in entries.flatten() {
        let cfg = entry.path().join("config").join("localconfig.vdf");
        if let Ok(meta) = std::fs::metadata(&cfg) {
            if let Ok(modified) = meta.modified() {
                if modified > best_time {
                    best_time = modified;
                    best = Some(cfg);
                }
            }
        }
    }

    let Some(cfg) = best else { return map };
    let Some(tree) = vdf::parse_file(&cfg) else { return map };

    let apps = tree
        .get_ci("UserLocalConfigStore")
        .and_then(|v| v.get_ci("Software"))
        .and_then(|v| v.get_ci("Valve"))
        .and_then(|v| v.get_ci("Steam"))
        .and_then(|v| v.get_ci("apps"));
    let Some(apps) = apps else { return map };

    for (appid_key, node) in match apps {
        vdf::Vdf::Obj(m) => m.iter().collect::<Vec<_>>(),
        _ => Vec::new(),
    } {
        let Ok(appid) = appid_key.trim().parse::<i64>() else { continue };
        let minutes = node
            .get_ci("Playtime")
            .and_then(|v| v.as_i64())
            .or_else(|| node.get_ci("playtime").and_then(|v| v.as_i64()))
            .unwrap_or(0);
        if minutes > 0 {
            map.insert(appid, minutes * 60);
        }
    }
    map
}

pub fn installed_apps(root: &Path) -> (Vec<SteamApp>, Vec<String>) {
    let mut apps = Vec::new();
    let mut warnings = Vec::new();
    let playtimes = steam_playtimes(root);

    for lib in steam_libraries(root) {
        let steamapps = lib.join("steamapps");
        let Ok(entries) = std::fs::read_dir(&steamapps) else {
            warnings.push(format!("无法读取 {}", steamapps.display()));
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path
                .extension()
                .map(|e| e.eq_ignore_ascii_case("acf"))
                .unwrap_or(false)
            {
                continue;
            }
            let Some(tree) = vdf::parse_file(&path) else {
                warnings.push(format!("VDF 解析失败：{}", path.display()));
                continue;
            };
            let Some(state) = tree.get_ci("AppState") else { continue };
            let Some(appid) = state.get_ci("appid").and_then(|v| v.as_i64()) else { continue };
            let name = state
                .get_ci("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let installdir = state
                .get_ci("installdir")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if installdir.is_empty() {
                continue;
            }
            let install_dir = steamapps.join("common").join(&installdir);
            if !install_dir.exists() {
                continue;
            }
            let last_played = state
                .get_ci("LastPlayed")
                .and_then(|v| v.as_i64())
                .and_then(unix_to_rfc3339);
            let playtime_sec = playtimes.get(&appid).copied().unwrap_or(0);
            apps.push(SteamApp {
                appid,
                name: if name.is_empty() { installdir.clone() } else { name },
                install_dir,
                last_played,
                playtime_sec,
            });
        }
    }

    apps.sort_by(|a, b| b.playtime_sec.cmp(&a.playtime_sec).then(a.name.cmp(&b.name)));
    (apps, warnings)
}

pub fn epic_manifest_dir() -> Option<PathBuf> {
    let program_data = std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".into());
    let dir = PathBuf::from(program_data)
        .join("Epic")
        .join("EpicGamesLauncher")
        .join("Data")
        .join("Manifests");
    if dir.exists() {
        Some(dir)
    } else {
        None
    }
}

pub fn epic_apps() -> (Vec<EpicApp>, Vec<String>) {
    let mut apps = Vec::new();
    let mut warnings = Vec::new();
    let Some(dir) = epic_manifest_dir() else {
        return (apps, warnings);
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        warnings.push(format!("无法读取 {}", dir.display()));
        return (apps, warnings);
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path
            .extension()
            .map(|e| e.eq_ignore_ascii_case("item"))
            .unwrap_or(false)
        {
            continue;
        }
        let Ok(v) = crate::util::read_json_file(&path) else {
            continue;
        };
        let title = v
            .get("DisplayName")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let install = v
            .get("InstallLocation")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        if install.is_empty() {
            continue;
        }
        let install_dir = PathBuf::from(install.replace('/', "\\"));
        if !install_dir.exists() {
            continue;
        }
        let launch_exe = v.get("LaunchExecutable").and_then(|x| x.as_str()).unwrap_or("");
        let exe = if launch_exe.is_empty() {
            install_dir.clone()
        } else {
            install_dir.join(launch_exe.replace('/', "\\"))
        };
        let app_name = v.get("AppName").and_then(|x| x.as_str()).unwrap_or(title.as_str()).to_string();
        apps.push(EpicApp {
            app_name,
            title: if title.is_empty() { install_dir.display().to_string() } else { title },
            install_dir,
            exe,
        });
    }
    apps.sort_by(|a, b| a.title.cmp(&b.title));
    (apps, warnings)
}

/// 把安装目录转成可执行文件路径
pub fn resolve_exe(install_dir: &Path, prefer: Option<&Path>) -> Option<PathBuf> {
    if let Some(p) = prefer {
        if p.is_file() {
            return Some(p.to_path_buf());
        }
    }
    find_main_exe(install_dir)
}
