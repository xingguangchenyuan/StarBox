//! 统一网络出口。
//!
//! 这台机器上 Steam 的接口（api.steampowered.com / steamcommunity.com）直连会被拦，
//! 但系统里跑着本地代理（Clash 之类），走代理就通。reqwest 默认不读 Windows 的
//! WinINET 代理设置，所以这里自己读一遍：环境变量 → 注册表，然后「先走代理、
//! 失败再直连」，两头都不依赖用户在软件里额外配置。

use anyhow::{anyhow, Result};
use std::time::Duration;

const UA: &str = "StarBox/0.1 (+https://github.com/starbox)";

/// 网络错误在进入界面/日志前统一脱敏：去掉 URL，再把可能出现的
/// `key=...`、`token=...` 查询参数替换掉。reqwest 的错误默认带完整 URL，
/// Steam Web API 的 Key 就在 query 里，不能原样抛给前端。
fn redact_text(mut text: String) -> String {
    for name in ["access_token=", "key=", "token="] {
        // 从上次替换结束的位置继续找：替换后的 "***" 里不含 name，
        // 但等号与 name 本身还在文本里，不推进游标会原地死循环。
        let mut from = 0usize;
        while from < text.len() {
            let Some(rel) = text[from..].find(name) else { break };
            let start = from + rel + name.len();
            let end = text[start..]
                .find(|c: char| c == '&' || c == ' ' || c == '"' || c == '\'' || c == ')' || c == '\n')
                .map(|n| start + n)
                .unwrap_or(text.len());
            text.replace_range(start..end, "***");
            from = (start + 3).min(text.len());
        }
    }
    text
}

fn safe_reqwest_error(err: reqwest::Error) -> anyhow::Error {
    anyhow!("{}", redact_text(err.without_url().to_string()))
}

/// 读系统代理：优先环境变量，其次 HKCU 的 Internet Settings。
pub fn system_proxy() -> Option<String> {
    for key in ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"] {
        if let Ok(v) = std::env::var(key) {
            let v = v.trim();
            if !v.is_empty() {
                return Some(normalize_proxy(v));
            }
        }
    }

    let key = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Internet Settings")
        .ok()?;
    let enabled: u32 = key.get_value("ProxyEnable").unwrap_or(0);
    if enabled == 0 {
        return None;
    }
    let raw: String = key.get_value("ProxyServer").ok()?;
    parse_proxy_server(&raw)
}

/// `127.0.0.1:7897` / `http://127.0.0.1:7897` / `http=..;https=..` 都能识别。
fn parse_proxy_server(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    if !raw.contains('=') {
        return Some(normalize_proxy(raw));
    }
    let mut http = None;
    let mut https = None;
    for part in raw.split(';') {
        let (k, v) = part.split_once('=')?;
        match k.trim().to_ascii_lowercase().as_str() {
            "http" => http = Some(normalize_proxy(v)),
            "https" => https = Some(normalize_proxy(v)),
            _ => {}
        }
    }
    https.or(http)
}

fn normalize_proxy(raw: &str) -> String {
    let v = raw.trim();
    if v.contains("://") {
        v.to_string()
    } else {
        format!("http://{v}")
    }
}

fn build(proxy: Option<&str>) -> Result<reqwest::Client> {
    let mut b = reqwest::Client::builder()
        .user_agent(UA)
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(12));
    if let Some(p) = proxy {
        b = b.proxy(reqwest::Proxy::all(p)?);
    }
    Ok(b.build()?)
}

/// GET 一段文本。先按系统代理走，失败再直连；两者都失败时返回更具体的那个错误。
pub async fn get_text(url: &str) -> Result<String> {
    let mut last_err: Option<anyhow::Error> = None;

    if let Some(proxy) = system_proxy() {
        match build(Some(&proxy)) {
            Ok(client) => match client.get(url).send().await {
                Ok(resp) => {
                    let status = resp.status();
                    let text = resp.text().await.map_err(safe_reqwest_error)?;
                    if status.is_success() {
                        return Ok(text);
                    }
                    if status.as_u16() == 403 || status.as_u16() == 404 {
                        return Err(anyhow!("HTTP {}", status.as_u16()));
                    }
                    last_err = Some(anyhow!("HTTP {}", status.as_u16()));
                }
                Err(e) => last_err = Some(safe_reqwest_error(e)),
            },
            Err(e) => last_err = Some(e),
        }
    }

    let client = build(None)?;
    let resp = client.get(url).send().await.map_err(|e| {
        let direct = safe_reqwest_error(e);
        last_err
            .map(|p| anyhow!("代理 {}；直连 {}", redact_text(p.to_string()), direct))
            .unwrap_or(direct)
    })?;
    let status = resp.status();
    let text = resp.text().await.map_err(safe_reqwest_error)?;
    if !status.is_success() {
        return Err(anyhow!("HTTP {}", status.as_u16()));
    }
    Ok(text)
}

pub async fn get_json(url: &str) -> Result<serde_json::Value> {
    let text = get_text(url).await?;
    Ok(serde_json::from_str(&text)?)
}

/// 下载图片到本地。小于 256 字节视为异常（防盗链的占位页）。
#[cfg(test)]
mod tests {
    use super::redact_text;

    #[test]
    fn redacts_api_keys_in_error_text() {
        let text = "error sending request for url (https://api.steampowered.com/x?key=ABC123&appid=1)";
        let out = redact_text(text.to_string());
        assert!(!out.contains("ABC123"));
        assert!(out.contains("key=***"));
    }

    // 回归：替换后文本里仍有 "key=" 字样，旧实现会在原地无限循环
    #[test]
    fn redacts_multiple_params_without_hanging() {
        let text = "a?key=AAA&key=BBB&token=CCC&access_token=DDD".to_string();
        let out = redact_text(text);
        for secret in ["AAA", "BBB", "CCC", "DDD"] {
            assert!(!out.contains(secret), "未脱敏：{out}");
        }
    }

    #[test]
    fn redacts_value_at_end_of_text() {
        let out = redact_text("https://x/y?key=".to_string());
        assert_eq!(out, "https://x/y?key=***");
    }
}

pub async fn download(url: &str, dest: &std::path::Path) -> Result<()> {
    let mut last_err: Option<anyhow::Error> = None;
    let proxies: Vec<Option<String>> = match system_proxy() {
        Some(p) => vec![Some(p), None],
        None => vec![None],
    };

    for proxy in proxies {
        let client = build(proxy.as_deref())?;
        match client.get(url).send().await {
            Ok(resp) => {
                if !resp.status().is_success() {
                    last_err = Some(anyhow!("图片下载失败 HTTP {}", resp.status()));
                    continue;
                }
                let bytes = resp.bytes().await.map_err(safe_reqwest_error)?;
                if bytes.len() < 256 {
                    last_err = Some(anyhow!("图片内容异常"));
                    continue;
                }
                if let Some(parent) = dest.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                std::fs::write(dest, &bytes)?;
                return Ok(());
            }
            Err(e) => last_err = Some(safe_reqwest_error(e)),
        }
    }

    Err(last_err.unwrap_or_else(|| anyhow!("下载失败")))
}
