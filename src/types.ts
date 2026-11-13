/** 与 Rust 端 serde 结构一一对应；改动时两边同步。 */

export type Platform = "steam" | "epic" | "local";

export type AchSource = "steam" | "local" | "manual" | "none";

export type UnlockSource = "steam" | "local" | "manual";

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Game {
  id: string;
  title: string;
  titleEn: string | null;
  appid: number | null;
  platform: Platform;
  exePath: string | null;
  workDir: string | null;
  args: string | null;
  coverPath: string | null;
  bannerPath: string | null;
  tintA: string;
  tintB: string;
  playtimeSec: number;
  lastPlayedAt: string | null;
  addedAt: string;
  favorite: boolean;
  hidden: boolean;
  studio: string | null;
  releaseDate: string | null;
  description: string | null;
  /** 商店英文原文简介，详情页排在中文之后 */
  descriptionOriginal: string | null;
  screenshots: string[];
  genres: string[];
  publishers: string[];
  categories: string[];
  reviewTotal: number | null;
  metacritic: number | null;
  tags: Tag[];
  achUnlocked: number;
  achTotal: number;
  achSource: AchSource;
  modCount: number;
  modsDir: string | null;
  running: boolean;
  sessionSec: number;
  copedbId: number | null;
}

export interface Achievement {
  id: number;
  gameId: string;
  apiName: string;
  name: string;
  description: string;
  iconUrl: string | null;
  iconGrayUrl: string | null;
  hidden: boolean;
  globalPercent: number | null;
  unlocked: boolean;
  unlockedAt: string | null;
  source: UnlockSource;
  tintA: string;
  tintB: string;
}

export interface ModEntry {
  id: number;
  gameId: string;
  dirName: string;
  name: string;
  version: string | null;
  sizeBytes: number;
  enabled: boolean;
  orderIndex: number;
}

export type ScanSource = "steam" | "epic";

export interface ScanPick {
  source: ScanSource;
  appid: number | null;
  title: string;
  installDir: string;
  exePath: string;
  playtimeSec: number;
  lastPlayedAt: string | null;
}

export interface ScanResult {
  picks: ScanPick[];
  steamRoot: string | null;
  epicRoot: string | null;
  steamCount: number;
  epicCount: number;
  warnings: string[];
  alreadyInLibrary: number;
}

/** 选文件夹添加时扫出来的候选启动程序 */
export interface FolderCandidate {
  path: string;
  name: string;
  sizeBytes: number;
  likelyMain: boolean;
  inLibrary: boolean;
}

/** Steam 商店搜索候选（本地游戏匹配 AppID 用） */
export interface SteamSearchItem {
  appid: number;
  name: string;
  nameEn: string | null;
  tinyImage: string | null;
  price: string | null;
  /** 与本地游戏名的相似度（0–100）；手动输入关键词搜索时为 null */
  score: number | null;
}

export interface Settings {
  hasApiKey: boolean;
  steamId: string | null;
  sortDefault: SortKey;
  viewMode: "grid" | "list";
  cardSize: "standard" | "large";
  reduceMotion: boolean;
  showHidden: boolean;
  locale: string;
  dataDir: string;
  version: string;
}

export interface AppInfo {
  version: string;
  dataDir: string;
  demo: boolean;
}

export type SortKey = "recent" | "hours" | "name" | "added";

export type ViewKey = "all" | "recent" | "running" | "fav" | `tag:${number}`;

export interface RunningSession {
  gameId: string;
  pid: number;
  startedAt: string;
  sessionSec: number;
}

export interface LaunchInfo {
  gameId: string;
  pid: number;
  startedAt: string;
  /** 游戏本就在运行时，是否真的把它的窗口切到了最前 */
  focused: boolean;
}

export interface SteamRefreshResult {
  game: Game;
  coverDownloaded: boolean;
  message: string | null;
}

export interface AchievementFetchResult {
  game: Game;
  count: number;
  message: string | null;
}

/** 一次成就同步的结果 */
export interface AchievementSyncResult {
  game: Game;
  source: "steam" | "local";
  unlocked: number;
  total: number;
  newlyUnlocked: number;
  message: string | null;
}

export interface SyncAllResult {
  total: number;
  synced: number;
  failed: number;
  steam: number;
  local: number;
  unlocked: number;
  message: string | null;
}
