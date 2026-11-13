use anyhow::{anyhow, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Row};
use std::collections::HashMap;

use crate::models::{Achievement, Game, ModEntry, Tag, Trailer};

fn has_foreign_keys(conn: &Connection, table: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM pragma_foreign_key_list(?1)",
        params![table],
        |r| r.get::<_, i64>(0),
    )
    .unwrap_or(0)
        > 0
}

/// 老库补齐外键。SQLite 不能 ALTER TABLE ADD CONSTRAINT，只能重建子表。
fn migrate_foreign_keys(conn: &Connection) -> Result<()> {
    let tables = ["achievements", "game_tags", "mods", "launch_logs"];
    if tables.iter().all(|t| has_foreign_keys(conn, t)) {
        return Ok(());
    }

    conn.execute_batch("PRAGMA foreign_keys = OFF;")?;
    let result = (|| -> Result<()> {
        let tx = conn.unchecked_transaction()?;

        // 先清掉历史遗留的孤儿，避免重建后 foreign_key_check 失败。
        tx.execute_batch(
            r#"
            DELETE FROM achievements WHERE game_id NOT IN (SELECT id FROM games);
            DELETE FROM game_tags WHERE game_id NOT IN (SELECT id FROM games)
                                    OR tag_id NOT IN (SELECT id FROM tags);
            DELETE FROM mods WHERE game_id NOT IN (SELECT id FROM games);
            DELETE FROM launch_logs WHERE game_id NOT IN (SELECT id FROM games);

            CREATE TABLE achievements_new (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id        TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                api_name       TEXT NOT NULL,
                name           TEXT NOT NULL,
                description    TEXT NOT NULL DEFAULT '',
                icon_url       TEXT,
                icon_gray_url  TEXT,
                hidden         INTEGER NOT NULL DEFAULT 0,
                global_percent REAL,
                unlocked       INTEGER NOT NULL DEFAULT 0,
                unlocked_at    TEXT,
                source         TEXT NOT NULL DEFAULT 'steam',
                tint_a         TEXT,
                tint_b         TEXT,
                UNIQUE (game_id, api_name)
            );
            INSERT INTO achievements_new
              (id, game_id, api_name, name, description, icon_url, icon_gray_url,
               hidden, global_percent, unlocked, unlocked_at, source, tint_a, tint_b)
            SELECT id, game_id, api_name, name, description, icon_url, icon_gray_url,
                   hidden, global_percent, unlocked, unlocked_at, source, tint_a, tint_b
              FROM achievements;
            DROP TABLE achievements;
            ALTER TABLE achievements_new RENAME TO achievements;

            CREATE TABLE game_tags_new (
                game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (game_id, tag_id)
            );
            INSERT INTO game_tags_new (game_id, tag_id) SELECT game_id, tag_id FROM game_tags;
            DROP TABLE game_tags;
            ALTER TABLE game_tags_new RENAME TO game_tags;

            CREATE TABLE mods_new (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id     TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                dir_name    TEXT NOT NULL,
                name        TEXT NOT NULL,
                version     TEXT,
                size_bytes  INTEGER NOT NULL DEFAULT 0,
                enabled     INTEGER NOT NULL DEFAULT 1,
                order_index INTEGER NOT NULL DEFAULT 0,
                UNIQUE (game_id, dir_name)
            );
            INSERT INTO mods_new
              (id, game_id, dir_name, name, version, size_bytes, enabled, order_index)
            SELECT id, game_id, dir_name, name, version, size_bytes, enabled, order_index
              FROM mods;
            DROP TABLE mods;
            ALTER TABLE mods_new RENAME TO mods;

            CREATE TABLE launch_logs_new (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id     TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                started_at  TEXT NOT NULL,
                ended_at    TEXT,
                exit_code   INTEGER,
                session_sec INTEGER
            );
            INSERT INTO launch_logs_new
              (id, game_id, started_at, ended_at, exit_code, session_sec)
            SELECT id, game_id, started_at, ended_at, exit_code, session_sec
              FROM launch_logs;
            DROP TABLE launch_logs;
            ALTER TABLE launch_logs_new RENAME TO launch_logs;
            "#,
        )?;
        tx.commit()?;
        Ok(())
    })();

    let _ = conn.execute_batch("PRAGMA foreign_keys = ON;");
    result?;
    let violations: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_foreign_key_check",
        [],
        |r| r.get(0),
    )?;
    if violations > 0 {
        return Err(anyhow!("外键迁移后仍有 {violations} 条不一致记录"));
    }
    Ok(())
}

pub fn init(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS games (
            id              TEXT PRIMARY KEY,
            title           TEXT NOT NULL,
            title_en        TEXT,
            appid           INTEGER,
            platform        TEXT NOT NULL DEFAULT 'local',
            exe_path        TEXT,
            work_dir        TEXT,
            args            TEXT,
            cover_path      TEXT,
            banner_path     TEXT,
            tint_a          TEXT NOT NULL DEFAULT '#1f4a6b',
            tint_b          TEXT NOT NULL DEFAULT '#081420',
            playtime_sec    INTEGER NOT NULL DEFAULT 0,
            last_played_at  TEXT,
            added_at        TEXT NOT NULL,
            favorite        INTEGER NOT NULL DEFAULT 0,
            hidden          INTEGER NOT NULL DEFAULT 0,
            studio          TEXT,
            release_date    TEXT,
            description     TEXT,
            description_original TEXT,
            screenshots     TEXT NOT NULL DEFAULT '[]',
            genres          TEXT NOT NULL DEFAULT '[]',
            movies          TEXT NOT NULL DEFAULT '[]',
            categories      TEXT NOT NULL DEFAULT '[]',
            publishers      TEXT NOT NULL DEFAULT '[]',
            review_total    INTEGER,
            metacritic      INTEGER,
            mods_dir        TEXT,
            ach_source      TEXT NOT NULL DEFAULT 'none',
            info_fetched_at TEXT
        );

        CREATE TABLE IF NOT EXISTS tags (
            id    INTEGER PRIMARY KEY AUTOINCREMENT,
            name  TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS game_tags (
            game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
            tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (game_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS achievements (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id        TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
            api_name       TEXT NOT NULL,
            name           TEXT NOT NULL,
            description    TEXT NOT NULL DEFAULT '',
            icon_url       TEXT,
            icon_gray_url  TEXT,
            hidden         INTEGER NOT NULL DEFAULT 0,
            global_percent REAL,
            unlocked       INTEGER NOT NULL DEFAULT 0,
            unlocked_at    TEXT,
            source         TEXT NOT NULL DEFAULT 'steam',
            tint_a         TEXT,
            tint_b         TEXT,
            UNIQUE (game_id, api_name)
        );

        CREATE TABLE IF NOT EXISTS achievement_defs_cache (
            appid       INTEGER PRIMARY KEY,
            fetched_at  TEXT NOT NULL,
            schema_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mods (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id     TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
            dir_name    TEXT NOT NULL,
            name        TEXT NOT NULL,
            version     TEXT,
            size_bytes  INTEGER NOT NULL DEFAULT 0,
            enabled     INTEGER NOT NULL DEFAULT 1,
            order_index INTEGER NOT NULL DEFAULT 0,
            UNIQUE (game_id, dir_name)
        );

        CREATE TABLE IF NOT EXISTS launch_logs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id     TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
            started_at  TEXT NOT NULL,
            ended_at    TEXT,
            exit_code   INTEGER,
            session_sec INTEGER
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    )?;

    // 老库补列：SQLite 的 ADD COLUMN 没有 IF NOT EXISTS，先查再补
    ensure_column(conn, "games", "movies", "TEXT NOT NULL DEFAULT '[]'")?;
    ensure_column(conn, "games", "categories", "TEXT NOT NULL DEFAULT '[]'")?;
    ensure_column(conn, "games", "publishers", "TEXT NOT NULL DEFAULT '[]'")?;
    ensure_column(conn, "games", "review_total", "INTEGER")?;
    ensure_column(conn, "games", "metacritic", "INTEGER")?;
    ensure_column(conn, "games", "description_original", "TEXT")?;

    // platform 是安装来源，不是资料提供商。旧版本匹配 Steam 时会把本地副本
    // 也改成 steam；按实际安装路径纠正一次（Steam 库 / Epic / 其他本地）。
    conn.execute_batch(
        r#"
        UPDATE games
           SET platform = CASE
                 WHEN lower(exe_path) LIKE '%\steamapps\common\%' THEN 'steam'
                 WHEN lower(exe_path) LIKE '%\epic games\%' THEN 'epic'
                 WHEN platform = 'epic' THEN 'epic'
                 ELSE 'local'
               END
         WHERE exe_path IS NOT NULL AND trim(exe_path) <> '';
        "#,
    )?;

    // 老库只有 PRAGMA foreign_keys=ON，没有真正的 REFERENCES。
    // 这里做一次事务性重建，给子表补上 ON DELETE CASCADE；失败就保留旧表，
    // 启动流程仍能继续（显式删除和事务已经覆盖主要路径）。
    if let Err(e) = migrate_foreign_keys(conn) {
        eprintln!("外键迁移失败，继续使用旧表结构：{e}");
    }

    // 默认标签只在「第一次建库」时播种一次。用户如果把标签全删了，
    // 下次启动不该又冒出来——所以用一个设置项记住已经播种过。
    if get_setting(conn, "tags_seeded")?.is_none() {
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM tags", [], |r| r.get(0))?;
        if count == 0 {
            let defaults = [
                ("动作", "#e0645a"),
                ("角色扮演", "#a78bfa"),
                ("独立", "#7fd4a2"),
                ("模拟", "#e8b45a"),
            ];
            for (name, color) in defaults {
                conn.execute("INSERT OR IGNORE INTO tags (name, color) VALUES (?1, ?2)", params![name, color])?;
            }
        }
        set_setting(conn, "tags_seeded", "1")?;
    }
    Ok(())
}

/// 标签名与颜色统一在这里校验，命令层不用重复。
fn validate_tag(name: &str, color: &str) -> Result<(String, String)> {
    let name = name.trim();
    if name.is_empty() {
        return Err(anyhow!("标签名不能为空"));
    }
    if name.chars().count() > 12 {
        return Err(anyhow!("标签名最多 12 个字"));
    }
    let color = color.trim().to_ascii_lowercase();
    let valid = color.len() == 7
        && color.starts_with('#')
        && color[1..].chars().all(|c| c.is_ascii_hexdigit());
    if !valid {
        return Err(anyhow!("颜色格式应为 #rrggbb"));
    }
    Ok((name.to_string(), color))
}

fn json_vec(raw: Option<String>) -> Vec<String> {
    raw.and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
        .unwrap_or_default()
}

fn json_trailers(raw: Option<String>) -> Vec<Trailer> {
    raw.and_then(|s| serde_json::from_str::<Vec<Trailer>>(&s).ok())
        .unwrap_or_default()
}

fn ensure_column(conn: &Connection, table: &str, column: &str, ddl: &str) -> Result<()> {
    let exists = {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
        let mut rows = stmt.query([])?;
        let mut found = false;
        while let Some(row) = rows.next()? {
            let name: String = row.get(1)?;
            if name == column {
                found = true;
                break;
            }
        }
        found
    };
    if !exists {
        conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {column} {ddl}"), [])?;
    }
    Ok(())
}

fn game_from_row(row: &Row<'_>) -> rusqlite::Result<Game> {
    Ok(Game {
        id: row.get("id")?,
        title: row.get("title")?,
        title_en: row.get("title_en")?,
        appid: row.get("appid")?,
        platform: row.get("platform")?,
        exe_path: row.get("exe_path")?,
        work_dir: row.get("work_dir")?,
        args: row.get("args")?,
        cover_path: row.get("cover_path")?,
        banner_path: row.get("banner_path")?,
        tint_a: row.get("tint_a")?,
        tint_b: row.get("tint_b")?,
        playtime_sec: row.get("playtime_sec")?,
        last_played_at: row.get("last_played_at")?,
        added_at: row.get("added_at")?,
        favorite: row.get::<_, i64>("favorite")? != 0,
        hidden: row.get::<_, i64>("hidden")? != 0,
        studio: row.get("studio")?,
        release_date: row.get("release_date")?,
        description: row.get("description")?,
        description_original: row.get("description_original")?,
        screenshots: json_vec(row.get::<_, Option<String>>("screenshots")?),
        genres: json_vec(row.get::<_, Option<String>>("genres")?),
        movies: json_trailers(row.get::<_, Option<String>>("movies")?),
        categories: json_vec(row.get::<_, Option<String>>("categories")?),
        publishers: json_vec(row.get::<_, Option<String>>("publishers")?),
        review_total: row.get("review_total")?,
        metacritic: row.get("metacritic")?,
        tags: Vec::new(),
        ach_unlocked: row.get("ach_unlocked")?,
        ach_total: row.get("ach_total")?,
        ach_source: row.get("ach_source")?,
        mod_count: row.get("mod_count")?,
        mods_dir: row.get("mods_dir")?,
        running: false,
        session_sec: 0,
    })
}

pub fn list_games(conn: &Connection) -> Result<Vec<Game>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT g.*,
               (SELECT COUNT(*) FROM achievements a WHERE a.game_id = g.id)                  AS ach_total,
               (SELECT COUNT(*) FROM achievements a WHERE a.game_id = g.id AND a.unlocked=1) AS ach_unlocked,
               (SELECT COUNT(*) FROM mods m WHERE m.game_id = g.id)                          AS mod_count
        FROM games g
        ORDER BY COALESCE(g.last_played_at, '') DESC, g.added_at DESC
        "#,
    )?;

    let mut games = stmt
        .query_map([], game_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    // 标签一次性取回，避免 N+1
    let mut tags_by_game: HashMap<String, Vec<Tag>> = HashMap::new();
    let mut tag_stmt = conn.prepare(
        "SELECT gt.game_id, t.id, t.name, t.color FROM game_tags gt JOIN tags t ON t.id = gt.tag_id",
    )?;
    let rows = tag_stmt.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            Tag { id: r.get(1)?, name: r.get(2)?, color: r.get(3)? },
        ))
    })?;
    for row in rows {
        let (game_id, tag) = row?;
        tags_by_game.entry(game_id).or_default().push(tag);
    }
    for g in &mut games {
        if let Some(tags) = tags_by_game.remove(&g.id) {
            g.tags = tags;
        }
    }
    Ok(games)
}

pub fn get_game(conn: &Connection, game_id: &str) -> Result<Option<Game>> {
    let games = list_games(conn)?;
    Ok(games.into_iter().find(|g| g.id == game_id))
}

pub fn list_tags(conn: &Connection) -> Result<Vec<Tag>> {
    let mut stmt = conn.prepare("SELECT id, name, color FROM tags ORDER BY id")?;
    let rows = stmt.query_map([], |r| Ok(Tag { id: r.get(0)?, name: r.get(1)?, color: r.get(2)? }))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn create_tag(conn: &Connection, name: &str, color: &str) -> Result<Tag> {
    let (name, color) = validate_tag(name, color)?;
    if conn
        .query_row("SELECT id FROM tags WHERE name = ?1", params![name], |r| r.get::<_, i64>(0))
        .optional()?
        .is_some()
    {
        return Err(anyhow!("已经有同名标签「{name}」"));
    }
    conn.execute("INSERT INTO tags (name, color) VALUES (?1, ?2)", params![name, color])?;
    let tag = conn.query_row(
        "SELECT id, name, color FROM tags WHERE id = ?1",
        params![conn.last_insert_rowid()],
        |r| Ok(Tag { id: r.get(0)?, name: r.get(1)?, color: r.get(2)? }),
    )?;
    Ok(tag)
}

pub fn update_tag(conn: &Connection, id: i64, name: &str, color: &str) -> Result<Tag> {
    let (name, color) = validate_tag(name, color)?;
    let clash = conn
        .query_row(
            "SELECT id FROM tags WHERE name = ?1 AND id <> ?2",
            params![name, id],
            |r| r.get::<_, i64>(0),
        )
        .optional()?
        .is_some();
    if clash {
        return Err(anyhow!("已经有同名标签「{name}」"));
    }
    let changed = conn.execute(
        "UPDATE tags SET name = ?1, color = ?2 WHERE id = ?3",
        params![name, color, id],
    )?;
    if changed == 0 {
        return Err(anyhow!("标签不存在"));
    }
    let tag = conn.query_row(
        "SELECT id, name, color FROM tags WHERE id = ?1",
        params![id],
        |r| Ok(Tag { id: r.get(0)?, name: r.get(1)?, color: r.get(2)? }),
    )?;
    Ok(tag)
}

/// 删除标签，同时清掉它和游戏之间的关联（只删关系，不动游戏）。
pub fn delete_tag(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM game_tags WHERE tag_id = ?1", params![id])?;
    let removed = conn.execute("DELETE FROM tags WHERE id = ?1", params![id])?;
    if removed == 0 {
        return Err(anyhow!("标签不存在"));
    }
    Ok(())
}

pub fn list_achievements(conn: &Connection, game_id: &str) -> Result<Vec<Achievement>> {
    let mut stmt = conn.prepare(
        "SELECT id, game_id, api_name, name, description, icon_url, icon_gray_url, hidden, global_percent,
                unlocked, unlocked_at, source, tint_a, tint_b
         FROM achievements WHERE game_id = ?1
         ORDER BY unlocked DESC, COALESCE(unlocked_at, '') DESC, id ASC",
    )?;
    let rows = stmt.query_map(params![game_id], |r| {
        Ok(Achievement {
            id: r.get(0)?,
            game_id: r.get(1)?,
            api_name: r.get(2)?,
            name: r.get(3)?,
            description: r.get(4)?,
            icon_url: r.get(5)?,
            icon_gray_url: r.get(6)?,
            hidden: r.get::<_, i64>(7)? != 0,
            global_percent: r.get(8)?,
            unlocked: r.get::<_, i64>(9)? != 0,
            unlocked_at: r.get(10)?,
            source: r.get(11)?,
            tint_a: r.get::<_, Option<String>>(12)?.unwrap_or_else(|| "#3d7fb5".into()),
            tint_b: r.get::<_, Option<String>>(13)?.unwrap_or_else(|| "#16324a".into()),
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn list_mods(conn: &Connection, game_id: &str) -> Result<Vec<ModEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, game_id, dir_name, name, version, size_bytes, enabled, order_index
         FROM mods WHERE game_id = ?1 ORDER BY order_index, id",
    )?;
    let rows = stmt.query_map(params![game_id], |r| {
        Ok(ModEntry {
            id: r.get(0)?,
            game_id: r.get(1)?,
            dir_name: r.get(2)?,
            name: r.get(3)?,
            version: r.get(4)?,
            size_bytes: r.get(5)?,
            enabled: r.get::<_, i64>(6)? != 0,
            order_index: r.get(7)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    let v = conn
        .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get::<_, String>(0))
        .optional()?;
    Ok(v)
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn bool_setting(conn: &Connection, key: &str, default: bool) -> bool {
    match get_setting(conn, key) {
        Ok(Some(v)) => v == "1" || v.eq_ignore_ascii_case("true"),
        _ => default,
    }
}

/// 记录一次启动会话：写 launch_log，结束时累加时长
pub fn log_session_start(conn: &Connection, game_id: &str, started_at: &str) -> Result<i64> {
    conn.execute(
        "INSERT INTO launch_logs (game_id, started_at) VALUES (?1, ?2)",
        params![game_id, started_at],
    )?;
    Ok(conn.last_insert_rowid())
}

/// 周期性写入当前会话时长，作为星匣异常退出时的恢复依据。
pub fn checkpoint_session(conn: &Connection, log_id: i64, session_sec: i64) -> Result<()> {
    conn.execute(
        "UPDATE launch_logs SET session_sec = ?1 WHERE id = ?2 AND ended_at IS NULL",
        params![session_sec.max(0), log_id],
    )?;
    Ok(())
}

/// 启动时收尾上次没结算的会话：把最后检查点计入游戏时长，并补上结束时间。
/// 星匣退出时游戏可能仍在运行，这里只结算“已经观测到”的部分，不伪造结束原因。
pub fn recover_open_sessions(conn: &Connection) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    let rows: Vec<(i64, String, Option<i64>)> = {
        let mut stmt = tx.prepare(
            "SELECT id, game_id, session_sec FROM launch_logs WHERE ended_at IS NULL",
        )?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        rows
    };
    let now = Utc::now().to_rfc3339();
    for (id, game_id, session_sec) in rows {
        let sec = session_sec.unwrap_or(0).max(0);
        if sec > 0 {
            tx.execute(
                "UPDATE games SET playtime_sec = playtime_sec + ?1 WHERE id = ?2",
                params![sec, game_id],
            )?;
        }
        tx.execute(
            "UPDATE launch_logs SET ended_at = ?1, session_sec = ?2 WHERE id = ?3",
            params![now, sec, id],
        )?;
    }
    tx.commit()?;
    Ok(())
}

pub fn log_session_end(conn: &Connection, log_id: i64, exit_code: Option<i32>, session_sec: i64) -> Result<()> {
    let ended = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE launch_logs SET ended_at = ?1, exit_code = ?2, session_sec = ?3 WHERE id = ?4",
        params![ended, exit_code, session_sec, log_id],
    )?;
    Ok(())
}

pub fn add_playtime(conn: &Connection, game_id: &str, session_sec: i64) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE games SET playtime_sec = playtime_sec + ?1, last_played_at = ?2 WHERE id = ?3",
        params![session_sec.max(0), now, game_id],
    )?;
    Ok(())
}

pub fn mark_last_played(conn: &Connection, game_id: &str, at: &str) -> Result<()> {
    conn.execute("UPDATE games SET last_played_at = ?1 WHERE id = ?2", params![at, game_id])?;
    Ok(())
}
