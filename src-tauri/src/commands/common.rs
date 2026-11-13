use std::path::{Path, PathBuf};

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection};

use crate::util::{clean_path, exe_stem, find_main_exe, nice_title, palette_for, now_rfc3339, strip_exe_noise};

pub struct NewGame {
    pub title: String,
    pub title_en: Option<String>,
    pub appid: Option<i64>,
    pub platform: String,
    pub exe_path: Option<String>,
    pub work_dir: Option<String>,
    pub args: Option<String>,
    pub playtime_sec: i64,
    pub last_played_at: Option<String>,
    pub cover_path: Option<String>,
    pub banner_path: Option<String>,
}

/// 用户给的一个路径解析出来的启动信息。
pub struct Target {
    pub exe: PathBuf,
    pub work_dir: PathBuf,
    pub title: String,
    pub args: Option<String>,
}

/// 启动器接受的文件类型。`.lnk` 会先解析成真实目标再检查。
const RUNNABLE_EXT: [&str; 3] = ["exe", "bat", "cmd"];

fn ext_lower(path: &Path) -> String {
    path.extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default()
}

/// 从 steam_appid.txt 或 steamapps/common 目录结构推断 AppID
pub fn infer_appid(path: &Path) -> Option<i64> {
    if let Some(parent) = path.parent() {
        let txt = parent.join("steam_appid.txt");
        if let Ok(raw) = std::fs::read_to_string(&txt) {
            if let Ok(id) = raw.trim().parse::<i64>() {
                return Some(id);
            }
        }
    }

    // 往上找 steamapps 目录
    let mut dir: Option<&Path> = Some(path);
    let mut steamapps: Option<PathBuf> = None;
    while let Some(d) = dir {
        if d.file_name().map(|n| n.eq_ignore_ascii_case("steamapps")).unwrap_or(false) {
            steamapps = Some(d.to_path_buf());
            break;
        }
        dir = d.parent();
    }
    let steamapps = steamapps?;

    // 目标目录名（common 下的一级）
    let mut cursor = path;
    while let Some(d) = cursor.parent() {
        if d.file_name().map(|n| n.eq_ignore_ascii_case("common")).unwrap_or(false) {
            break;
        }
        cursor = d;
    }
    let folder = cursor.file_name()?.to_string_lossy().to_string();

    let entries = std::fs::read_dir(&steamapps).ok()?;
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.extension().map(|e| e.eq_ignore_ascii_case("acf")).unwrap_or(false) {
            continue;
        }
        if let Some(tree) = crate::steam::vdf::parse_file(&p) {
            if let Some(state) = tree.get_ci("AppState") {
                let installdir = state.get_ci("installdir").and_then(|v| v.as_str()).unwrap_or("");
                if installdir.eq_ignore_ascii_case(&folder) {
                    return state.get_ci("appid").and_then(|v| v.as_i64());
                }
            }
        }
    }
    None
}

/// 用户给的路径 → (exe, 工作目录, 标题, 快捷方式自带的参数)
pub fn resolve_target(raw: &str) -> Result<Target> {
    let cleaned = clean_path(raw);
    if cleaned.is_empty() {
        return Err(anyhow!("路径为空"));
    }
    let path = PathBuf::from(&cleaned);
    if !path.exists() {
        return Err(anyhow!("路径不存在：{cleaned}"));
    }

    if path.is_dir() {
        let exe = find_main_exe(&path).ok_or_else(|| anyhow!("这个文件夹里没找到可执行文件"))?;
        let dir_name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "未命名游戏".into());
        let generic = [
            "bin", "binaries", "win64", "win32", "game", "launcher", "x64", "x86", "build", "system",
        ];
        let title = if generic.iter().any(|g| dir_name.eq_ignore_ascii_case(g)) {
            crate::winfile::describe(&exe)
                .map(|d| nice_title(&strip_exe_noise(&d)))
                .unwrap_or_else(|| nice_title(&exe_stem(&exe.to_string_lossy())))
        } else {
            dir_name
        };
        return Ok(Target { exe, work_dir: path, title, args: None });
    }

    // 单个文件：.lnk 先解析，其余必须是可执行/批处理
    if ext_lower(&path) == "lnk" {
        let sc = crate::shortcut::resolve(&path).map_err(|e| anyhow!(e))?;
        let target = sc.target;
        if !target.is_file() {
            return Err(anyhow!("快捷方式指向的程序不存在：{}", target.display()));
        }
        if !RUNNABLE_EXT.contains(&ext_lower(&target).as_str()) {
            return Err(anyhow!(
                "快捷方式指向的不是可执行程序：{}（只支持 .exe / .bat / .cmd）",
                target.display()
            ));
        }
        let title = path
            .file_stem()
            .map(|s| nice_title(&s.to_string_lossy()))
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| nice_title(&exe_stem(&target.to_string_lossy())));
        let work_dir = {
            let from_shortcut = PathBuf::from(&sc.work_dir);
            if !sc.work_dir.is_empty() && from_shortcut.is_dir() {
                from_shortcut
            } else {
                target.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| target.clone())
            }
        };
        let args = {
            let a = sc.args.trim();
            if a.is_empty() { None } else { Some(a.to_string()) }
        };
        return Ok(Target { exe: target, work_dir, title, args });
    }

    let ext = ext_lower(&path);
    if !RUNNABLE_EXT.contains(&ext.as_str()) {
        return Err(anyhow!(
            "只支持 .exe / .lnk / .bat / .cmd，当前选的是 .{ext}"
        ));
    }

    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "未命名游戏".into());
    let work_dir = path.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| path.clone());
    // exe 的版本信息里通常写着正式名称，比 Zephyrx64 / NWNClient-Win64-Shipping 这种文件名靠谱
    let title = crate::winfile::describe(&path)
        .map(|d| nice_title(&strip_exe_noise(&d)))
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| nice_title(&strip_exe_noise(&stem)));
    Ok(Target {
        exe: path,
        work_dir,
        title,
        args: None,
    })
}

pub fn insert_game(conn: &Connection, new: &NewGame) -> Result<String> {
    let id = uuid::Uuid::new_v4().to_string();
    let (tint_a, tint_b) = palette_for(&new.title);
    conn.execute(
        r#"INSERT INTO games
           (id, title, title_en, appid, platform, exe_path, work_dir, args,
            tint_a, tint_b, playtime_sec, last_played_at, added_at,
            cover_path, banner_path, ach_source)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,'none')"#,
        params![
            id,
            new.title,
            new.title_en,
            new.appid,
            new.platform,
            new.exe_path,
            new.work_dir,
            new.args,
            tint_a,
            tint_b,
            new.playtime_sec,
            new.last_played_at,
            now_rfc3339(),
            new.cover_path,
            new.banner_path,
        ],
    )?;
    Ok(id)
}

pub fn find_by_exe(conn: &Connection, exe: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT id FROM games WHERE LOWER(exe_path) = LOWER(?1) LIMIT 1")?;
    let mut rows = stmt.query(params![exe])?;
    if let Some(row) = rows.next()? {
        return Ok(Some(row.get::<_, String>(0)?));
    }
    Ok(None)
}

pub fn find_by_appid(conn: &Connection, appid: i64) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT id FROM games WHERE appid = ?1 LIMIT 1")?;
    let mut rows = stmt.query(params![appid])?;
    if let Some(row) = rows.next()? {
        return Ok(Some(row.get::<_, String>(0)?));
    }
    Ok(None)
}

/// 库里已存在的 Steam AppID / 可执行文件集合，扫描时用来标记「已在库中」
pub fn existing_keys(conn: &Connection) -> Result<(Vec<i64>, Vec<String>)> {
    let mut appids = Vec::new();
    let mut exes = Vec::new();
    let mut stmt = conn.prepare("SELECT appid, exe_path FROM games")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, Option<i64>>(0)?, r.get::<_, Option<String>>(1)?)))?;
    for row in rows {
        let (appid, exe) = row?;
        if let Some(a) = appid {
            appids.push(a);
        }
        if let Some(e) = exe {
            exes.push(e.to_lowercase());
        }
    }
    Ok((appids, exes))
}

pub fn update_palette(conn: &Connection, game_id: &str, seed: &str) -> Result<()> {
    let (a, b) = palette_for(seed);
    conn.execute(
        "UPDATE games SET tint_a = ?1, tint_b = ?2 WHERE id = ?3",
        params![a, b, game_id],
    )?;
    Ok(())
}
