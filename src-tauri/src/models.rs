use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: String,
}

/// Steam 商店的预告片。新版接口只给 DASH / HLS，这里两种都存下来，
/// 前端优先用 HLS（WebView2 + hls.js 能直接播）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trailer {
    pub id: i64,
    pub name: String,
    pub thumbnail: Option<String>,
    pub hls: Option<String>,
    pub dash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub id: String,
    pub title: String,
    pub title_en: Option<String>,
    pub appid: Option<i64>,
    pub platform: String,
    pub exe_path: Option<String>,
    pub work_dir: Option<String>,
    pub args: Option<String>,
    pub cover_path: Option<String>,
    pub banner_path: Option<String>,
    pub tint_a: String,
    pub tint_b: String,
    pub playtime_sec: i64,
    pub last_played_at: Option<String>,
    pub added_at: String,
    pub favorite: bool,
    pub hidden: bool,
    pub studio: Option<String>,
    pub release_date: Option<String>,
    pub description: Option<String>,
    /// 商店的英文原文简介；界面先显示中文，再显示这一段
    pub description_original: Option<String>,
    pub screenshots: Vec<String>,
    pub genres: Vec<String>,
    pub movies: Vec<Trailer>,
    pub categories: Vec<String>,
    pub publishers: Vec<String>,
    pub review_total: Option<i64>,
    pub metacritic: Option<i64>,
    pub tags: Vec<Tag>,
    pub ach_unlocked: i64,
    pub ach_total: i64,
    pub ach_source: String,
    pub mod_count: i64,
    pub mods_dir: Option<String>,
    pub running: bool,
    pub session_sec: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Achievement {
    pub id: i64,
    pub game_id: String,
    pub api_name: String,
    pub name: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub icon_gray_url: Option<String>,
    pub hidden: bool,
    pub global_percent: Option<f64>,
    pub unlocked: bool,
    pub unlocked_at: Option<String>,
    pub source: String,
    pub tint_a: String,
    pub tint_b: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModEntry {
    pub id: i64,
    pub game_id: String,
    pub dir_name: String,
    pub name: String,
    pub version: Option<String>,
    pub size_bytes: i64,
    pub enabled: bool,
    pub order_index: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanPick {
    pub source: String,
    pub appid: Option<i64>,
    pub title: String,
    pub install_dir: String,
    pub exe_path: String,
    pub playtime_sec: i64,
    pub last_played_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub picks: Vec<ScanPick>,
    pub steam_root: Option<String>,
    pub epic_root: Option<String>,
    pub steam_count: i64,
    pub epic_count: i64,
    pub warnings: Vec<String>,
    pub already_in_library: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub has_api_key: bool,
    pub steam_id: Option<String>,
    pub sort_default: String,
    pub view_mode: String,
    pub card_size: String,
    pub reduce_motion: bool,
    pub show_hidden: bool,
    pub locale: String,
    pub data_dir: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub data_dir: String,
    pub demo: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchInfo {
    pub game_id: String,
    pub pid: u32,
    pub started_at: String,
    /// 游戏本来就在运行时：是否成功把它的窗口切到了最前
    pub focused: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamRefreshResult {
    pub game: Game,
    pub cover_downloaded: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementFetchResult {
    pub game: Game,
    pub count: i64,
    pub message: Option<String>,
}

/// 一次成就同步的结果：来源、总数、已解锁、新解锁
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementSyncResult {
    pub game: Game,
    /// steam / local
    pub source: String,
    pub unlocked: i64,
    pub total: i64,
    pub newly_unlocked: i64,
    pub message: Option<String>,
}

/// 全库同步的汇总
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncAllResult {
    pub total: i64,
    pub synced: i64,
    pub failed: i64,
    pub steam: i64,
    pub local: i64,
    pub unlocked: i64,
    pub message: Option<String>,
}

/// 选文件夹添加时，扫出来的一个候选启动程序
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderCandidate {
    pub path: String,
    pub name: String,
    pub size_bytes: i64,
    /// 按文件名/层级/体积打分后的第一个，通常就是主程序
    pub likely_main: bool,
    pub in_library: bool,
}

/// 商店搜索候选：本地游戏匹配 Steam 用
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamSearchItem {
    pub appid: i64,
    pub name: String,
    pub name_en: Option<String>,
    pub tiny_image: Option<String>,
    pub price: Option<String>,
    /// 与本地游戏名的相似度（0–100），只有「按游戏搜索」时才有
    pub score: Option<i32>,
}
