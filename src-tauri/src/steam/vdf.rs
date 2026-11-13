//! 最小可用的 Valve KeyValues（VDF）解析器。
//! 只处理 Steam 的 libraryfolders.vdf / *.acf / localconfig.vdf 这三种真实结构：
//! 嵌套对象、带引号的键值、// 注释。

use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq)]
pub enum Vdf {
    Str(String),
    Obj(BTreeMap<String, Vdf>),
}

impl Vdf {
    pub fn get(&self, key: &str) -> Option<&Vdf> {
        match self {
            Vdf::Obj(map) => map.get(key),
            _ => None,
        }
    }

    /// 大小写不敏感取子节点（Steam 的键名大小写并不统一）
    pub fn get_ci(&self, key: &str) -> Option<&Vdf> {
        let Vdf::Obj(map) = self else { return None };
        if let Some(v) = map.get(key) {
            return Some(v);
        }
        let lower = key.to_lowercase();
        map.iter().find(|(k, _)| k.to_lowercase() == lower).map(|(_, v)| v)
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Vdf::Str(s) => Some(s.as_str()),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        self.as_str().and_then(|s| s.trim().parse::<i64>().ok())
    }

    /// 对象里所有值（按 key 升序）
    pub fn values(&self) -> Vec<&Vdf> {
        match self {
            Vdf::Obj(map) => map.values().collect(),
            _ => Vec::new(),
        }
    }
}

struct Parser {
    chars: Vec<char>,
    pos: usize,
}

impl Parser {
    fn new(src: &str) -> Self {
        Self { chars: src.chars().collect(), pos: 0 }
    }

    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    fn bump(&mut self) -> Option<char> {
        let c = self.peek();
        if c.is_some() {
            self.pos += 1;
        }
        c
    }

    fn skip_ws(&mut self) {
        loop {
            match self.peek() {
                Some(c) if c.is_whitespace() => {
                    self.pos += 1;
                }
                Some('/') if self.chars.get(self.pos + 1) == Some(&'/') => {
                    while let Some(c) = self.peek() {
                        self.pos += 1;
                        if c == '\n' {
                            break;
                        }
                    }
                }
                Some('\u{feff}') | Some('\0') => {
                    self.pos += 1;
                }
                _ => break,
            }
        }
    }

    fn read_token(&mut self) -> Option<String> {
        self.skip_ws();
        match self.peek() {
            Some('"') => {
                self.pos += 1;
                let mut s = String::new();
                while let Some(c) = self.bump() {
                    if c == '"' {
                        break;
                    }
                    if c == '\\' {
                        if let Some(next) = self.bump() {
                            s.push(next);
                            continue;
                        }
                    }
                    s.push(c);
                }
                Some(s)
            }
            Some('{') | Some('}') => {
                let c = self.bump()?;
                Some(c.to_string())
            }
            _ => {
                let mut s = String::new();
                while let Some(c) = self.peek() {
                    if c.is_whitespace() || c == '{' || c == '}' || c == '"' {
                        break;
                    }
                    s.push(c);
                    self.pos += 1;
                }
                if s.is_empty() {
                    None
                } else {
                    Some(s)
                }
            }
        }
    }

    fn parse_obj(&mut self) -> Option<Vdf> {
        let mut map = BTreeMap::new();
        loop {
            self.skip_ws();
            match self.peek() {
                None => break,
                Some('}') => {
                    self.pos += 1;
                    break;
                }
                _ => {}
            }
            let key = self.read_token()?;
            if key == "}" {
                break;
            }
            if key == "{" {
                continue;
            }
            self.skip_ws();
            match self.peek() {
                Some('{') => {
                    self.pos += 1;
                    let child = self.parse_obj()?;
                    map.insert(key, child);
                }
                _ => {
                    let value = self.read_token().unwrap_or_default();
                    map.insert(key, Vdf::Str(value));
                }
            }
        }
        Some(Vdf::Obj(map))
    }
}

pub fn parse(src: &str) -> Vdf {
    let mut p = Parser::new(src);
    // 顶层可能带一个根键（libraryfolders / AppState / UserLocalConfigStore）
    match p.parse_obj() {
        Some(v) => v,
        None => Vdf::Obj(BTreeMap::new()),
    }
}

pub fn parse_file(path: &std::path::Path) -> Option<Vdf> {
    let raw = std::fs::read_to_string(path).ok()?;
    Some(parse(&raw))
}
