//! Steam Web API Key 的本地加密保存。
//! Windows 上用凭据管理器（DPAPI 保护）保存，明文不落盘、不进 SQLite。

use anyhow::Result;

const SERVICE: &str = "starbox";
const ACCOUNT: &str = "steam-api-key";

#[cfg(windows)]
fn entry() -> Result<keyring::Entry> {
    Ok(keyring::Entry::new(SERVICE, ACCOUNT)?)
}

pub fn save_api_key(key: &str) -> Result<()> {
    #[cfg(windows)]
    {
        entry()?.set_password(key.trim())?;
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        let _ = key;
        Ok(())
    }
}

pub fn load_api_key() -> Option<String> {
    #[cfg(windows)]
    {
        match entry().and_then(|e| Ok(e.get_password()?)) {
            Ok(pw) if !pw.trim().is_empty() => Some(pw),
            _ => None,
        }
    }
    #[cfg(not(windows))]
    {
        None
    }
}

pub fn clear_api_key() -> Result<()> {
    #[cfg(windows)]
    {
        entry()?.delete_credential()?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Ok(())
    }
}

pub fn has_api_key() -> bool {
    load_api_key().is_some()
}
