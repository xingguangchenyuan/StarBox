use anyhow::Result;
use std::fs;
use std::path::{Path, PathBuf};

/// 无封面时的双色渐变色板（与原型封面占位同源）
const PALETTE: &[(&str, &str)] = &[
    ("#1f4a6b", "#081420"),
    ("#7b2f8f", "#1a0a26"),
    ("#8a2a24", "#240b09"),
    ("#2f5560", "#0d1b20"),
    ("#3f6b32", "#101f0d"),
    ("#8a5a1e", "#2a1806"),
    ("#2a2f7a", "#0b0d24"),
    ("#7a5230", "#221308"),
    ("#1a5a66", "#081e26"),
    ("#4a5260", "#121620"),
    ("#2b3a8c", "#080d22"),
    ("#6a3a6e", "#1c0e1e"),
];

pub fn palette_for(seed: &str) -> (String, String) {
    let mut h: u32 = 2166136261;
    for b in seed.as_bytes() {
        h ^= *b as u32;
        h = h.wrapping_mul(16777619);
    }
    let (a, b) = PALETTE[(h as usize) % PALETTE.len()];
    (a.to_string(), b.to_string())
}

/// 成就图标底色：按名称取一对低饱和到高饱和的渐变
pub fn achievement_tints(seed: &str) -> (String, String) {
    let mut h: u32 = 5381;
    for b in seed.as_bytes() {
        h = h.wrapping_mul(33) ^ *b as u32;
    }
    let (a, b) = PALETTE[(h as usize) % PALETTE.len()];
    (a.to_string(), b.to_string())
}

/// Steam 的简介是 HTML 片段，这里转成纯文本段落
pub fn html_to_text(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut chars = html.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            '<' => {
                // 块级标签换行
                let mut tag = String::new();
                for t in chars.by_ref() {
                    if t == '>' {
                        break;
                    }
                    tag.push(t);
                }
                let tag_lower = tag.to_lowercase();
                let is_block = tag_lower.starts_with("br")
                    || tag_lower.starts_with("p")
                    || tag_lower.starts_with("li")
                    || tag_lower.starts_with("h1")
                    || tag_lower.starts_with("h2")
                    || tag_lower.starts_with("div")
                    || tag_lower.starts_with("ul");
                if is_block {
                    out.push('\n');
                }
            }
            '&' => {
                let mut entity = String::new();
                for t in chars.by_ref() {
                    if t == ';' || entity.len() > 8 {
                        break;
                    }
                    entity.push(t);
                }
                let decoded = match entity.as_str() {
                    "amp" => "&",
                    "lt" => "<",
                    "gt" => ">",
                    "quot" => "\"",
                    "apos" | "#39" => "'",
                    "nbsp" => " ",
                    _ => "",
                };
                out.push_str(decoded);
            }
            _ => out.push(c),
        }
    }

    // 折叠多余空白与空行
    let mut cleaned = String::with_capacity(out.len());
    let mut blank = 0;
    for line in out.lines() {
        let l = line.trim();
        if l.is_empty() {
            blank += 1;
            if blank > 1 {
                continue;
            }
        } else {
            blank = 0;
        }
        cleaned.push_str(l);
        cleaned.push('\n');
    }
    cleaned.trim().to_string()
}

/// 启动参数字符串 → 参数数组。
/// Windows 下直接调用 `CommandLineToArgvW`，保证空参数、转义引号和尾随
/// 反斜杠的行为与 CreateProcess 一致；其他平台保留一个简单回退。
#[cfg(windows)]
pub fn split_args(raw: &str) -> Vec<String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::UI::Shell::CommandLineToArgvW;

    let cmd = format!("\"StarBox\" {raw}");
    let mut wide: Vec<u16> = std::ffi::OsStr::new(&cmd)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut argc: i32 = 0;
    let argv = unsafe { CommandLineToArgvW(wide.as_mut_ptr(), &mut argc) };
    if argv.is_null() {
        return fallback_split_args(raw);
    }
    let mut out = Vec::new();
    for i in 1..argc as isize {
        let ptr = unsafe { *argv.offset(i) };
        if ptr.is_null() {
            continue;
        }
        let mut len = 0usize;
        while unsafe { *ptr.add(len) } != 0 {
            len += 1;
        }
        let s = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(ptr, len) });
        out.push(s);
    }
    unsafe {
        LocalFree(argv as *mut _);
    }
    out
}

#[cfg(not(windows))]
pub fn split_args(raw: &str) -> Vec<String> {
    fallback_split_args(raw)
}

fn fallback_split_args(raw: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut cur = String::new();
    let mut quoted = false;
    for c in raw.chars() {
        match c {
            '"' => quoted = !quoted,
            ' ' | '\t' if !quoted => {
                if !cur.is_empty() {
                    args.push(std::mem::take(&mut cur));
                }
            }
            _ => cur.push(c),
        }
    }
    if !cur.is_empty() {
        args.push(cur);
    }
    args
}

pub fn normalize_name(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

pub fn nice_title(raw: &str) -> String {
    let trimmed = raw.trim();
    // 去掉常见的可执行后缀噪音
    let cleaned = trimmed
        .trim_end_matches("-Win64-Shipping")
        .trim_end_matches("-Win32-Shipping")
        .trim_end_matches("_x64")
        .trim_end_matches("_x86");
    if cleaned.is_empty() {
        trimmed.to_string()
    } else {
        cleaned.to_string()
    }
}

pub fn exe_score(path: &Path, root_name: &str) -> i64 {
    let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let norm_stem = normalize_name(&stem);
    let norm_root = normalize_name(root_name);
    let lower = path.to_string_lossy().to_lowercase();
    let mut score = 0i64;

    if !norm_root.is_empty() && norm_stem.contains(&norm_root) {
        score += 100;
    }
    if norm_stem.starts_with(&norm_root) && !norm_root.is_empty() {
        score += 30;
    }
    if lower.contains("binaries") {
        score += 40;
    }
    if lower.contains("win64") {
        score += 12;
    }
    for bad in ["unins", "crash", "setup", "redist", "vc_redist", "dxsetup", "launcher_installer"] {
        if norm_stem.contains(bad) {
            score -= 200;
        }
    }
    if norm_stem.contains("launcher") {
        score -= 25;
    }
    if let Ok(meta) = fs::metadata(path) {
        score += (meta.len() / (1024 * 1024)).min(400) as i64 / 4;
    }
    // 层级越浅越好
    score -= path.components().count() as i64;
    score
}

/// 在安装目录里找主程序（最多下探 3 层）
pub fn find_main_exe(dir: &Path) -> Option<PathBuf> {    let root_name = dir.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let mut best: Option<(i64, PathBuf)> = None;
    let mut stack: Vec<(PathBuf, u32)> = vec![(dir.to_path_buf(), 0)];

    while let Some((path, depth)) = stack.pop() {
        if depth > 3 {
            continue;
        }
        let Ok(entries) = fs::read_dir(&path) else { continue };
        for entry in entries.flatten() {
            let p = entry.path();
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_dir() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if ["redist", "redistributable", "support", "dxsetup", "_commonredist", "installers", "engine"]
                    .iter()
                    .any(|bad| name.contains(bad))
                {
                    continue;
                }
                stack.push((p, depth + 1));
            } else if ft.is_file() {
                let is_exe = p
                    .extension()
                    .map(|e| e.eq_ignore_ascii_case("exe"))
                    .unwrap_or(false);
                if !is_exe {
                    continue;
                }
                let score = exe_score(&p, &root_name);
                if best.as_ref().map(|(s, _)| score > *s).unwrap_or(true) {
                    best = Some((score, p));
                }
            }
        }
    }
    best.map(|(_, p)| p)
}

/// 扫一个文件夹里所有像「游戏启动程序」的 exe，按打分排序。
/// 选文件夹添加时用它列候选，让用户自己决定加哪一个。
pub fn scan_exe_candidates(dir: &Path) -> Vec<PathBuf> {
    let root_name = dir.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let mut found: Vec<(i64, PathBuf)> = Vec::new();
    let mut stack: Vec<(PathBuf, u32)> = vec![(dir.to_path_buf(), 0)];

    while let Some((path, depth)) = stack.pop() {
        if depth > 4 {
            continue;
        }
        let Ok(entries) = fs::read_dir(&path) else { continue };
        for entry in entries.flatten() {
            let p = entry.path();
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_dir() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if ["redist", "redistributable", "support", "dxsetup", "_commonredist", "installers", "engine", "node_modules", ".git"]
                    .iter()
                    .any(|bad| name.contains(bad))
                {
                    continue;
                }
                stack.push((p, depth + 1));
            } else if ft.is_file()
                && p.extension().map(|e| e.eq_ignore_ascii_case("exe")).unwrap_or(false)
            {
                let stem = p
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_lowercase())
                    .unwrap_or_default();
                if [
                    "unins",
                    "crash",
                    "setup",
                    "vc_redist",
                    "dxsetup",
                    "launcher_installer",
                    "unitycrashhandler",
                    "crashreport",
                    "activation",
                ]
                .iter()
                .any(|bad| stem.contains(bad))
                {
                    continue;
                }
                found.push((exe_score(&p, &root_name), p));
            }
        }
    }

    found.sort_by(|a, b| b.0.cmp(&a.0));
    found.into_iter().map(|(_, p)| p).collect()
}

/// 给候选 exe 推一个像游戏名的标题：
/// 根目录里的 exe 用根目录名；bin/win64 之类目录里的用 exe 名；其余用所在子目录名。
pub fn candidate_title(exe: &Path, root: &Path) -> String {
    let parent = exe.parent().unwrap_or(root);
    let generic = [
        "bin", "binaries", "win64", "win32", "x64", "x86", "build", "system", "game", "launcher",
    ];
    let parent_name = parent
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let root_name = root
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    if parent == root && !root_name.is_empty() {
        nice_title(&root_name)
    } else if generic.iter().any(|g| parent_name.eq_ignore_ascii_case(g)) || parent_name.is_empty() {
        nice_title(&exe_stem(&exe.to_string_lossy()))
    } else {
        nice_title(&parent_name)
    }
}

/// 递归统计目录大小（浅层，避免大库遍历过久）
pub fn dir_size(path: &Path) -> u64 {
    fn walk(path: &Path, depth: u32, total: &mut u64) {
        if depth > 4 {
            return;
        }
        let Ok(entries) = fs::read_dir(path) else { return };
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    *total += meta.len();
                } else if meta.is_dir() {
                    walk(&entry.path(), depth + 1, total);
                }
            }
        }
    }
    let mut total = 0;
    walk(path, 0, &mut total);
    total
}

pub fn read_json_file(path: &Path) -> Result<serde_json::Value> {
    let raw = fs::read_to_string(path)?;
    let v: serde_json::Value = serde_json::from_str(&raw)?;
    Ok(v)
}

/// Steam acf / vdf 里的 unix 时间戳 → RFC3339
pub fn unix_to_rfc3339(ts: i64) -> Option<String> {
    if ts <= 0 {
        return None;
    }
    chrono::DateTime::from_timestamp(ts, 0).map(|d| d.to_rfc3339())
}

pub fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Windows 路径规范化：去引号、去尾部斜杠
pub fn clean_path(raw: &str) -> String {
    let trimmed = raw.trim().trim_matches('"');
    let trimmed = trimmed.trim_end_matches(['\\', '/']);
    trimmed.to_string()
}

/// 路径的字符数（Windows 的上限是按字符算的）
pub fn path_chars(p: &Path) -> usize {
    p.to_string_lossy().chars().count()
}

/// 取 8.3 短路径。游戏装在很深的目录里时，短名能把长度压回 260 以内。
/// 卷上关掉了 8.3 名称时返回 None。
#[cfg(windows)]
pub fn short_path(p: &Path) -> Option<PathBuf> {
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    use windows_sys::Win32::Storage::FileSystem::GetShortPathNameW;

    let wide: Vec<u16> = p.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let mut buf = vec![0u16; 1024];
    let n = unsafe { GetShortPathNameW(wide.as_ptr(), buf.as_mut_ptr(), buf.len() as u32) };
    if n == 0 || n as usize >= buf.len() {
        return None;
    }
    let short = PathBuf::from(std::ffi::OsString::from_wide(&buf[..n as usize]));
    // 没缩短就没意义（很多卷只对父目录的一部分给短名）
    if path_chars(&short) < path_chars(p) {
        Some(short)
    } else {
        None
    }
}

#[cfg(not(windows))]
pub fn short_path(_p: &Path) -> Option<PathBuf> {
    None
}

pub fn exe_stem(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

/// 去掉可执行文件名里常见的工程噪音：Zephyrx64 → Zephyr，NWNClient-Win64-Shipping → TOT。
pub fn strip_exe_noise(stem: &str) -> String {
    let mut s = stem.to_string();
    let suffixes = [
        "-win64-shipping",
        "-win32-shipping",
        "-shipping",
        "-win64",
        "-win32",
        "_x64",
        "_x86",
        "x64",
        "x86",
        "win64",
        "win32",
        "shipping",
        "client",
        "launcher",
        "_dx11",
        "_dx12",
        "_vulkan",
        "ue4",
        "ue5",
        "64",
        "32",
    ];
    // 两轮：先去掉 -Win64-Sipping 这种长后缀，再去掉残留的 x64/64
    for _ in 0..2 {
        for suf in suffixes {
            let lower = s.to_ascii_lowercase();
            if lower.ends_with(suf) && s.len() > suf.len() + 2 {
                let cut = s.len() - suf.len();
                s.truncate(cut);
                s = s.trim_end_matches(['-', '_', ' ']).to_string();
            }
        }
    }
    if s.is_empty() {
        stem.to_string()
    } else {
        s
    }
}

fn is_generic_dir(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    [
        "bin",
        "binaries",
        "win64",
        "win32",
        "x64",
        "x86",
        "build",
        "game",
        "system",
        "engine",
        "shipping",
        "content",
        "data",
        "steamapps",
        "common",
        "steam",
        "steamlibrary",
        "epic",
        "epic games",
        "gog",
        "gog games",
        "xboxgames",
        "library",
        "desktop",
        "downloads",
        "program files",
        "program files (x86)",
        "games",
        "mygames",
    ]
    .iter()
    .any(|g| n == *g)
}

/// 给「本地游戏 → Steam」准备搜索线索，按可靠性排序：
/// 游戏目录名 → 上两级目录名 → exe 的 FileDescription → 清理过的 exe 名。
pub fn title_hints(exe: &Path, work_dir: Option<&Path>) -> Vec<String> {
    let mut hints: Vec<String> = Vec::new();
    let mut push = |s: &str| {
        let t = s.trim();
        if t.chars().count() < 3 {
            return;
        }
        let norm = normalize_name(t);
        if norm.len() < 3 {
            return;
        }
        if !hints.iter().any(|h| normalize_name(h) == norm) {
            hints.push(t.to_string());
        }
    };

    // 从 exe 所在目录往上找 3 层，跳过 bin/Win64 这类通用目录
    let start = work_dir
        .filter(|d| d.is_dir())
        .map(|d| d.to_path_buf())
        .or_else(|| exe.parent().map(|p| p.to_path_buf()));
    if let Some(dir) = start.as_deref() {
        let mut cur = Some(dir);
        let mut hops = 0;
        while let Some(d) = cur {
            if hops > 3 {
                break;
            }
            if let Some(name) = d.file_name().map(|n| n.to_string_lossy().to_string()) {
                if !is_generic_dir(&name) {
                    push(&name);
                }
            }
            cur = d.parent();
            hops += 1;
        }
    }

    if let Some(desc) = crate::winfile::describe(exe) {
        push(&strip_exe_noise(&desc));
        push(&desc);
    }

    let stem = exe
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    push(&strip_exe_noise(&stem));
    push(&stem);

    hints
}

/// 名字相似度：0–100。只用于「要不要自动绑定」，阈值定得比较保守。
pub fn name_score(a: &str, b: &str) -> i32 {
    let na = normalize_name(a);
    let nb = normalize_name(b);
    if na.is_empty() || nb.is_empty() {
        return 0;
    }
    if na == nb {
        return 100;
    }

    let (short, long) = if na.len() <= nb.len() { (&na, &nb) } else { (&nb, &na) };

    // 「Zephyr」和「Zephyr II」、「Northwind」和「Northwind 2」是两款游戏。
    // 续作、重制、豪华版只在尾部差一点点，前缀规则容易把续作当成同一款，先挡掉。
    if long.starts_with(short.as_str()) && is_distinct_variant_tail(&long[short.len()..]) {
        return 40;
    }

    if short.len() >= 5 && long.starts_with(short.as_str()) && long.len() - short.len() <= 4 {
        return 88;
    }
    if short.len() >= 4 && long.starts_with(short.as_str()) && long.len() - short.len() <= 6 {
        return 74;
    }
    if long.contains(short.as_str()) && short.len() >= 6 {
        return 62;
    }

    // 令牌重合：拆开空格/标点/数字边界后比较
    let ta = tokens(a);
    let tb = tokens(b);
    if !ta.is_empty() && !tb.is_empty() {
        let hit = ta.iter().filter(|x| tb.contains(x)).count();
        let ratio = hit as f64 / ta.len().max(tb.len()) as f64;
        if ratio >= 0.8 {
            return 78;
        }
        if ratio >= 0.6 {
            return 55;
        }
    }

    let lev = levenshtein(&na, &nb);
    let ratio = 1.0 - lev as f64 / na.len().max(nb.len()) as f64;
    if ratio >= 0.88 {
        return 70;
    }
    if ratio >= 0.78 {
        return 45;
    }
    0
}

/// 名字尾部是「2 / II / Remastered」这类版本差异时，说明是另一款商品，不是同一款。
fn is_distinct_variant_tail(tail: &str) -> bool {
    if tail.is_empty() {
        return false;
    }
    if tail.chars().all(|c| c.is_ascii_digit()) {
        return true;
    }
    const ROMAN: [&str; 12] = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"];
    if ROMAN.contains(&tail) {
        return true;
    }
    const VARIANTS: [&str; 10] = [
        "remaster",
        "remake",
        "definitive",
        "ultimate",
        "deluxe",
        "complete",
        "goty",
        "enhanced",
        "anniversary",
        "director",
    ];
    VARIANTS.iter().any(|v| tail.starts_with(v))
}

fn tokens(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut prev_lower = false;
    for ch in s.chars() {
        let is_alnum = ch.is_alphanumeric();
        if !is_alnum {
            if cur.len() >= 2 {
                out.push(cur.to_lowercase());
            }
            cur.clear();
            prev_lower = false;
            continue;
        }
        if ch.is_uppercase() && prev_lower && cur.len() >= 2 {
            out.push(cur.to_lowercase());
            cur.clear();
        }
        prev_lower = ch.is_lowercase();
        cur.push(ch);
    }
    if cur.len() >= 2 {
        out.push(cur.to_lowercase());
    }
    out
}

fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur = vec![0usize; b.len() + 1];
    for i in 1..=a.len() {
        cur[0] = i;
        for j in 1..=b.len() {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[b.len()]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_common_exe_suffixes() {
        assert_eq!(strip_exe_noise("Zephyrx64"), "Zephyr");
        assert_eq!(strip_exe_noise("ColonyRimWin64"), "ColonyRim");
        assert_eq!(strip_exe_noise("NWNClient-Win64-Shipping"), "TOT");
        assert_eq!(strip_exe_noise("ObraDinn"), "ObraDinn");
        assert_eq!(strip_exe_noise("Northwind2"), "Northwind2");
        assert_eq!(strip_exe_noise("Zephyr2"), "Zephyr2");
    }

    #[test]
    fn exact_and_spacing_variants_are_confident() {
        assert_eq!(name_score("Lantern Hollow", "Lantern Hollow"), 100);
        assert_eq!(name_score("Northwind2", "Northwind 2"), 100);
        assert_eq!(name_score("OxygenRequired", "Oxygen Required"), 100);
        assert_eq!(name_score("CREATURE WELL", "CREATURE WELL"), 100);
    }

    #[test]
    fn sequels_and_remasters_are_not_confident() {
        assert!(name_score("Zephyr", "Zephyr II") < 88);
        assert!(name_score("Northwind", "Northwind 2") < 88);
        assert!(name_score("Stellar Reach", "Stellar Reach: Utopia") < 88);
        assert!(name_score("Lantern Hollow", "Lantern Hollow: Ember Song") < 88);
        assert!(name_score("Vertex", "Vertex Soundtrack") < 88);
    }

    #[cfg(windows)]
    #[test]
    fn windows_args_keep_empty_and_escaped_quotes() {
        let args = split_args(r#"--profile "" --name "A\"B""#);
        assert_eq!(args, vec!["--profile", "", "--name", "A\"B"]);
    }

    #[test]
    fn clean_title_is_not_touched() {
        assert_eq!(nice_title("Lantern Hollow"), "Lantern Hollow");
        assert_eq!(nice_title("Two Of Us"), "Two Of Us");
    }
}
