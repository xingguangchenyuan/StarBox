use anyhow::{anyhow, Result};
use serde::Deserialize;
use std::path::Path;

use crate::models::Trailer;

/// 商店搜索返回的一条候选，用于把本地游戏匹配到 Steam AppID。
#[derive(Debug, Clone)]
pub struct SearchItem {
    pub appid: i64,
    pub name: String,
    /// 英文名：中文商店会把 Northwind 2 显示成「北境 2」，
    /// 自动匹配得拿英文名比，界面则优先显示中文名。
    pub name_en: Option<String>,
    pub tiny_image: Option<String>,
    pub price: Option<String>,
}

#[derive(Debug, Default, Clone)]
pub struct AppDetails {
    pub name: String,
    pub short_description: String,
    pub detailed_description: String,
    /// 英文商店原文简介（中文删减/改写时用来对照）
    pub description_original: String,
    /// 英文商店名，用来把「中文文件夹名」纠正成「原名 + 中文名」
    pub name_original: Option<String>,
    pub developers: Vec<String>,
    pub publishers: Vec<String>,
    pub release_date: String,
    pub genres: Vec<String>,
    pub categories: Vec<String>,
    pub screenshots: Vec<String>,
    pub movies: Vec<Trailer>,
    pub review_total: Option<i64>,
    pub metacritic: Option<i64>,
    pub header_image: Option<String>,
    pub capsule_image: Option<String>,
    pub cover_image: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AchDef {
    pub api_name: String,
    pub name: String,
    pub description: String,
    pub hidden: bool,
    pub icon: Option<String>,
    pub icon_gray: Option<String>,
}

#[derive(Deserialize)]
struct DetailsEnvelope {
    success: bool,
    data: Option<serde_json::Value>,
}

/// 中文资料 + 英文原文各拉一次。英文失败不影响中文结果——
/// 商店对单个游戏偶发限流时，至少中文简介还能更新。
pub async fn fetch_appdetails(appid: i64) -> Result<AppDetails> {
    let mut details = fetch_appdetails_lang(appid, "schinese").await?;

    if let Ok(en) = fetch_appdetails_lang(appid, "english").await {
        let text = if en.detailed_description.trim().is_empty() {
            en.short_description
        } else {
            en.detailed_description
        };
        let text = text.trim();
        if !text.is_empty()
            && text != details.detailed_description.trim()
            && text != details.short_description.trim()
        {
            details.description_original = text.to_string();
        }
        if !en.name.trim().is_empty() {
            details.name_original = Some(en.name.trim().to_string());
        }
    }

    Ok(details)
}

async fn fetch_appdetails_lang(appid: i64, lang: &str) -> Result<AppDetails> {
    let url = format!(
        "https://store.steampowered.com/api/appdetails?appids={appid}&l={lang}&cc=cn&filters=basic,detailed_description,short_description,developers,publishers,genres,categories,release_date,screenshots,movies,recommendations,metacritic,header_image,capsule_image"
    );
    let text = crate::net::get_text(&url).await?;
    let payload: serde_json::Value = serde_json::from_str(&text)?;
    let key = appid.to_string();
    let entry: DetailsEnvelope = serde_json::from_value(
        payload
            .get(&key)
            .cloned()
            .ok_or_else(|| anyhow!("Steam 没有返回这款游戏的资料"))?,
    )?;
    if !entry.success {
        return Err(anyhow!("Steam 标记这款游戏资料不可用"));
    }
    let data = entry.data.ok_or_else(|| anyhow!("资料为空"))?;

    let mut details = AppDetails::default();
    details.name = data.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    details.short_description = data
        .get("short_description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    details.detailed_description = data
        .get("detailed_description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    details.developers = data
        .get("developers")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();
    details.publishers = data
        .get("publishers")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();
    details.release_date = data
        .get("release_date")
        .and_then(|v| v.get("date"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    details.genres = data
        .get("genres")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|g| g.get("description").and_then(|d| d.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default();
    details.categories = data
        .get("categories")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|c| c.get("description").and_then(|d| d.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default();
    details.screenshots = data
        .get("screenshots")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|s| {
                    s.get("path_full")
                        .and_then(|p| p.as_str())
                        .or_else(|| s.get("path_thumbnail").and_then(|p| p.as_str()))
                        .map(String::from)
                })
                .take(8)
                .collect()
        })
        .unwrap_or_default();
    details.movies = data
        .get("movies")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| {
                    let hls = m.get("hls_h264").and_then(|v| v.as_str()).map(String::from);
                    let dash = m.get("dash_h264").and_then(|v| v.as_str()).map(String::from);
                    if hls.is_none() && dash.is_none() {
                        return None;
                    }
                    Some(Trailer {
                        id: m.get("id").and_then(|v| v.as_i64()).unwrap_or(0),
                        name: m.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        thumbnail: m.get("thumbnail").and_then(|v| v.as_str()).map(String::from),
                        hls,
                        dash,
                    })
                })
                .take(6)
                .collect()
        })
        .unwrap_or_default();
    details.review_total = data
        .get("recommendations")
        .and_then(|r| r.get("total"))
        .and_then(|v| v.as_i64());
    details.metacritic = data
        .get("metacritic")
        .and_then(|m| m.get("score"))
        .and_then(|v| v.as_i64());
    details.header_image = data.get("header_image").and_then(|v| v.as_str()).map(String::from);
    details.capsule_image = data.get("capsule_image").and_then(|v| v.as_str()).map(String::from);
    details.cover_image = Some(format!(
        "https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/library_600x900.jpg"
    ));
    Ok(details)
}

/// 按名字搜 Steam 商店，用来给本地游戏找 AppID（不需要登录、不需要 SteamID）。
/// 中英文各搜一次：中文名用来展示，英文名用来做匹配。
pub async fn search_apps(term: &str) -> Result<Vec<SearchItem>> {
    let term = term.trim();
    if term.is_empty() {
        return Ok(Vec::new());
    }

    let zh = fetch_search(term, "schinese").await.unwrap_or_default();
    let en = fetch_search(term, "english").await.unwrap_or_default();

    let mut out: Vec<SearchItem> = zh;
    for item in en {
        if let Some(existing) = out.iter_mut().find(|x| x.appid == item.appid) {
            if existing.name_en.is_none() {
                existing.name_en = Some(item.name);
            }
            if existing.tiny_image.is_none() {
                existing.tiny_image = item.tiny_image;
            }
        } else {
            let mut item = item;
            item.name_en = Some(item.name.clone());
            out.push(item);
        }
    }
    out.truncate(12);
    Ok(out)
}

async fn fetch_search(term: &str, lang: &str) -> Result<Vec<SearchItem>> {
    let url = format!(
        "https://store.steampowered.com/api/storesearch/?term={}&l={lang}&cc=cn",
        percent_encode(term)
    );
    let payload = crate::net::get_json(&url).await?;
    let items = payload.get("items").and_then(|v| v.as_array()).cloned().unwrap_or_default();

    Ok(items
        .into_iter()
        .filter_map(|it| {
            let appid = it.get("id").and_then(|v| v.as_i64())?;
            let name = it.get("name").and_then(|v| v.as_str())?.to_string();
            let price = it
                .get("price")
                .and_then(|p| p.get("final"))
                .and_then(|v| v.as_i64())
                .map(|cents| {
                    if cents == 0 {
                        "免费".to_string()
                    } else {
                        format!("¥{:.2}", cents as f64 / 100.0)
                    }
                });
            Some(SearchItem {
                appid,
                name,
                name_en: None,
                tiny_image: it.get("tiny_image").and_then(|v| v.as_str()).map(String::from),
                price,
            })
        })
        .take(12)
        .collect())
}

/// 自动绑定阈值：名字必须「几乎就是同一个」才敢自动认领。
pub const AUTO_BIND_MIN: i32 = 88;

/// 商店里同名同系列的衍生品很多：Demo、原声带、DLC 包。自动匹配要避开它们。
const DERIVATIVE_MARKERS: [&str; 14] = [
    "demo",
    "soundtrack",
    "ost",
    "dlc",
    "pack",
    "bundle",
    "beta",
    "playtest",
    "experience",
    "体验版",
    "原声",
    "组合包",
    "升级包",
    "扩展包",
];

fn derivative_penalty(name: &str, hints: &[String]) -> i32 {
    let lower = name.to_lowercase();
    let hit = DERIVATIVE_MARKERS.iter().any(|m| lower.contains(m));
    if !hit {
        return 0;
    }
    let hinted = hints
        .iter()
        .any(|h| DERIVATIVE_MARKERS.iter().any(|m| h.to_lowercase().contains(m)));
    if hinted {
        0
    } else {
        40
    }
}

/// 在候选里挑最像的：对每条候选取所有线索里的最高分。
/// 返回 (appid, score)，按分数从高到低。
pub fn rank_matches(hints: &[String], items: &[SearchItem]) -> Vec<(i64, i32)> {
    let mut out: Vec<(i64, i32)> = Vec::new();
    for it in items {
        let mut best = 0;
        for name in [Some(it.name.as_str()), it.name_en.as_deref()].into_iter().flatten() {
            for hint in hints {
                best = best.max(crate::util::name_score(hint, name));
            }
        }
        if best <= 0 {
            continue;
        }
        best = (best - derivative_penalty(&it.name, hints)).max(0);
        if best <= 0 {
            continue;
        }
        match out.iter_mut().find(|(id, _)| *id == it.appid) {
            Some(slot) => slot.1 = slot.1.max(best),
            None => out.push((it.appid, best)),
        }
    }
    out.sort_by(|a, b| b.1.cmp(&a.1));
    out
}

/// 只认「几乎就是同一个名字」的匹配：去掉空格/标点、统一小写后相等，
/// 或者一方是另一方的前缀且至少 6 个字符。宁可匹配不上让用户手选，也不要绑错游戏。
pub fn confident_match(hints: &[String], items: &[SearchItem]) -> Option<i64> {
    rank_matches(hints, items)
        .into_iter()
        .find(|(_, score)| *score >= AUTO_BIND_MIN)
        .map(|(appid, _)| appid)
}

fn percent_encode(raw: &str) -> String {    let mut out = String::with_capacity(raw.len() * 3);
    for b in raw.as_bytes() {
        match *b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(*b as char),
            b' ' => out.push('+'),
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

pub async fn fetch_schema(appid: i64, api_key: &str) -> Result<Vec<AchDef>> {
    if api_key.trim().is_empty() {
        return Err(anyhow!("缺少 Steam Web API Key"));
    }
    let url = format!(
        "https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key={}&appid={}&l=schinese",
        api_key.trim(),
        appid
    );
    let text = match crate::net::get_text(&url).await {
        Ok(t) => t,
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("403") {
                return Err(anyhow!(
                    "Steam 拒绝了这次请求：Key 无效，或该游戏没有开放成就接口（HTTP 403）"
                ));
            }
            return Err(anyhow!("连不上 Steam 成就接口：{msg}"));
        }
    };
    let payload: serde_json::Value = serde_json::from_str(&text)?;
    let achievements = payload
        .get("game")
        .and_then(|g| g.get("availableGameStats"))
        .and_then(|s| s.get("achievements"))
        .and_then(|a| a.as_array())
        .cloned()
        .unwrap_or_default();

    let mut defs = Vec::new();
    for a in achievements {
        let api_name = a.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if api_name.is_empty() {
            continue;
        }
        let name = a
            .get("displayName")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .unwrap_or(&api_name)
            .to_string();
        defs.push(AchDef {
            api_name,
            name,
            description: a
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            hidden: a.get("hidden").and_then(|v| v.as_i64()).unwrap_or(0) != 0,
            icon: a.get("icon").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from),
            icon_gray: a
                .get("icongray")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(String::from),
        });
    }
    if defs.is_empty() {
        return Err(anyhow!("这款游戏在 Steam 上没有成就定义"));
    }
    Ok(defs)
}

pub async fn download_image(url: &str, dest: &Path) -> Result<()> {
    crate::net::download(url, dest).await
}

/// Steam 账号的成就解锁状态（需要 SteamID64 + Web API Key）。
#[derive(Debug, Clone)]
pub struct PlayerAchievement {
    pub api_name: String,
    pub achieved: bool,
    /// Unix 时间戳；0 表示没有解锁时间
    pub unlock_time: Option<i64>,
}

pub async fn fetch_player_achievements(
    appid: i64,
    steamid: &str,
    api_key: &str,
) -> Result<Vec<PlayerAchievement>> {
    if steamid.trim().is_empty() || api_key.trim().is_empty() {
        return Err(anyhow!("缺少 SteamID64 或 Web API Key"));
    }
    let url = format!(
        "https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key={}&steamid={}&appid={}&l=schinese",
        api_key.trim(),
        steamid.trim(),
        appid
    );
    let text = match crate::net::get_text(&url).await {
        Ok(t) => t,
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("403") {
                return Err(anyhow!(
                    "Steam 拒绝读取（HTTP 403）：请确认 Steam 隐私里的「游戏详情」是公开的，且这款游戏在这个账号的库里"
                ));
            }
            if msg.contains("400") {
                return Err(anyhow!(
                    "Steam 返回 400：这款游戏可能没有公开的成就统计，或账号库里没有它"
                ));
            }
            return Err(anyhow!("连不上 Steam 成就接口：{msg}"));
        }
    };
    let payload: serde_json::Value = serde_json::from_str(&text)?;
    let stats = payload
        .get("playerstats")
        .ok_or_else(|| anyhow!("Steam 没有返回该游戏的成就统计"))?;
    if stats.get("success").and_then(|v| v.as_bool()) == Some(false) {
        let err = stats
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("这款游戏没有公开的成就统计");
        return Err(anyhow!("{err}"));
    }
    let list = stats
        .get("achievements")
        .and_then(|v| v.as_array())
        .ok_or_else(|| anyhow!("这款游戏在 Steam 上没有成就"))?;

    let mut out = Vec::new();
    for a in list {
        let Some(name) = a.get("apiname").and_then(|v| v.as_str()) else { continue };
        let achieved = a.get("achieved").and_then(|v| v.as_i64()).unwrap_or(0) != 0;
        let ts = a.get("unlocktime").and_then(|v| v.as_i64()).filter(|t| *t > 0);
        out.push(PlayerAchievement {
            api_name: name.to_string(),
            achieved,
            unlock_time: ts,
        });
    }
    if out.is_empty() {
        return Err(anyhow!("这款游戏在 Steam 上没有成就"));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(appid: i64, name: &str) -> SearchItem {
        SearchItem {
            appid,
            name: name.to_string(),
            name_en: None,
            tiny_image: None,
            price: None,
        }
    }

    #[test]
    fn exact_name_beats_derivative() {
        let hints = vec!["Vertex".to_string()];
        let items = vec![item(900005, "Vertex"), item(900006, "Vertex Soundtrack")];
        let ranked = rank_matches(&hints, &items);
        assert_eq!(ranked[0], (900005, 100));
        assert!(ranked.iter().all(|(id, s)| *id == 900005 || *s < AUTO_BIND_MIN));
        assert_eq!(confident_match(&hints, &items), Some(900005));
    }

    #[test]
    fn demo_is_penalized_below_auto_bind() {
        let hints = vec!["Star Edge".to_string()];
        let items = vec![item(900007, "Star Edge Demo")];
        assert_eq!(confident_match(&hints, &items), None);
    }

    #[test]
    fn sequel_is_not_auto_bound() {
        let hints = vec!["Northwind".to_string()];
        let items = vec![item(900008, "Northwind 2")];
        assert_eq!(confident_match(&hints, &items), None);
    }

    #[test]
    fn spaced_name_binds_correctly() {
        let hints = vec!["Northwind2".to_string()];
        let items = vec![item(900008, "Northwind 2"), item(900009, "Northwind 2: The Surge")];
        let ranked = rank_matches(&hints, &items);
        assert_eq!(ranked[0].0, 900008);
        assert_eq!(confident_match(&hints, &items), Some(900008));
    }
}
