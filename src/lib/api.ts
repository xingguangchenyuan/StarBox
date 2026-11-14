/**
 * 唯一的后端出入口。
 * - 桌面版（Tauri）：所有调用走 Rust 命令，图片走 asset 协议。
 * - 浏览器（纯前端调试）：走 demo.ts 的本地演示数据。
 */
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Achievement,
  AchSource,
  AchievementFetchResult,
  AppInfo,
  FolderCandidate,
  Game,
  LaunchInfo,
  ModEntry,
  ScanPick,
  ScanResult,
  Settings,
  SteamRefreshResult,
  SteamSearchItem,
  AchievementSyncResult,
  SyncAllResult,
  Tag,
} from "@/types";
import { demoApi } from "@/lib/demo";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const isDemo = !isTauri;

const cmd = <T>(name: string, args?: Record<string, unknown>): Promise<T> => invoke<T>(name, args);

export const api = {
  appInfo: (): Promise<AppInfo> => (isTauri ? cmd("app_info") : demoApi.appInfo()),

  listGames: (): Promise<Game[]> => (isTauri ? cmd("list_games") : demoApi.listGames()),
  listTags: (): Promise<Tag[]> => (isTauri ? cmd("list_tags") : demoApi.listTags()),
  createTag: (name: string, color: string): Promise<Tag> =>
    isTauri ? cmd("create_tag", { name, color }) : demoApi.createTag(name, color),
  updateTag: (id: number, name: string, color: string): Promise<Tag> =>
    isTauri ? cmd("update_tag", { id, name, color }) : demoApi.updateTag(id, name, color),
  deleteTag: (id: number): Promise<void> =>
    isTauri ? cmd("delete_tag", { id }) : demoApi.deleteTag(id),

  addGame: (path: string, workDir?: string | null): Promise<Game> =>
    isTauri ? cmd("add_game", { path, workDir: workDir ?? null }) : demoApi.addGame(path),
  deleteGame: (gameId: string): Promise<void> =>
    isTauri ? cmd("delete_game", { gameId }) : demoApi.deleteGame(gameId),
  setFavorite: (gameId: string, favorite: boolean): Promise<void> =>
    isTauri ? cmd("set_favorite", { gameId, favorite }) : demoApi.setFavorite(gameId, favorite),
  setHidden: (gameId: string, hidden: boolean): Promise<void> =>
    isTauri ? cmd("set_hidden", { gameId, hidden }) : demoApi.setHidden(gameId, hidden),
  setTags: (gameId: string, tagIds: number[]): Promise<void> =>
    isTauri ? cmd("set_game_tags", { gameId, tagIds }) : demoApi.setTags(gameId, tagIds),
  setTitles: (gameId: string, title: string, titleEn: string | null): Promise<void> =>
    isTauri ? cmd("set_game_titles", { gameId, title, titleEn }) : demoApi.setTitles(gameId, title, titleEn),
  updatePaths: (gameId: string, exePath: string, workDir: string, args: string): Promise<void> =>
    isTauri
      ? cmd("update_game_paths", { gameId, exePath, workDir, args })
      : demoApi.updatePaths(gameId, exePath, workDir, args),
  setCover: (gameId: string, path: string | null): Promise<void> =>
    isTauri ? cmd("set_game_cover", { gameId, path }) : demoApi.setCover(gameId, path),
  setAchSource: (gameId: string, source: AchSource): Promise<void> =>
    isTauri ? cmd("set_ach_source", { gameId, source }) : Promise.resolve(),

  scanLibraries: (): Promise<ScanResult> => (isTauri ? cmd("scan_libraries") : demoApi.scanLibraries()),
  importPicks: (picks: ScanPick[]): Promise<Game[]> =>
    isTauri ? cmd("import_scan", { picks }) : demoApi.importPicks(picks),
  scanFolder: (path: string): Promise<FolderCandidate[]> =>
    isTauri ? cmd("scan_folder", { path }) : demoApi.scanFolder(path),

  refreshSteamData: (gameId: string, force: boolean): Promise<SteamRefreshResult> =>
    isTauri ? cmd("refresh_steam_data", { gameId, force }) : demoApi.refreshSteam(gameId),
  searchSteam: (query: string): Promise<SteamSearchItem[]> =>
    isTauri ? cmd("search_steam", { query }) : demoApi.searchSteam(query),
  searchSteamForGame: (gameId: string): Promise<SteamSearchItem[]> =>
    isTauri ? cmd("search_steam_for_game", { gameId }) : demoApi.searchSteamForGame(gameId),
  matchSteam: (gameId: string, appid: number): Promise<SteamRefreshResult> =>
    isTauri ? cmd("match_steam", { gameId, appid }) : demoApi.matchSteam(gameId, appid),

  fetchAchievements: (gameId: string): Promise<AchievementFetchResult> =>
    isTauri ? cmd("fetch_achievements", { gameId }) : demoApi.fetchAchievements(gameId),
  listAchievements: (gameId: string): Promise<Achievement[]> =>
    isTauri ? cmd("list_achievements", { gameId }) : demoApi.listAchievements(gameId),
  syncAchievements: async (
    gameId: string,
    mode: "auto" | "steam" | "local" = "auto",
  ): Promise<AchievementSyncResult> => {
    if (isTauri) return cmd("sync_achievements", { gameId, mode });
    const g = (await demoApi.listGames()).find((x) => x.id === gameId);
    if (!g) throw new Error("游戏不存在");
    return {
      game: g,
      source: "local",
      unlocked: g.achUnlocked,
      total: g.achTotal,
      newlyUnlocked: 0,
      message: "浏览器预览不同步本地文件",
    };
  },
  syncAllAchievements: async (mode: "auto" | "steam" | "local" = "auto"): Promise<SyncAllResult> => {
    if (isTauri) return cmd("sync_all_achievements", { mode });
    return { total: 0, synced: 0, failed: 0, steam: 0, local: 0, unlocked: 0, message: "浏览器预览不同步" };
  },
  detectSteamId: (): Promise<string | null> =>
    isTauri ? cmd("detect_steam_id") : Promise.resolve(null),
  setAchievementUnlocked: (achievementId: number, unlocked: boolean): Promise<void> =>
    isTauri
      ? cmd("set_achievement_unlocked", { achievementId, unlocked })
      : demoApi.setAchievementUnlocked(achievementId, unlocked),

  launch: (gameId: string): Promise<LaunchInfo> => (isTauri ? cmd("launch_game", { gameId }) : demoApi.launch(gameId)),
  stop: (gameId: string): Promise<boolean> => (isTauri ? cmd("stop_game", { gameId }) : demoApi.stop(gameId)),

  listMods: (gameId: string): Promise<ModEntry[]> =>
    isTauri ? cmd("list_mods", { gameId }) : demoApi.listMods(gameId),
  scanMods: (gameId: string): Promise<ModEntry[]> =>
    isTauri ? cmd("scan_mods", { gameId }) : demoApi.scanMods(gameId),
  setModsDir: (gameId: string, dir: string): Promise<void> =>
    isTauri ? cmd("set_mods_dir", { gameId, dir }) : demoApi.setModsDir(gameId, dir),
  setModEnabled: (modId: number, enabled: boolean): Promise<void> =>
    isTauri ? cmd("set_mod_enabled", { modId, enabled }) : demoApi.setModEnabled(modId, enabled),

  openDataDir: (): Promise<void> => (isTauri ? cmd("open_data_dir") : Promise.resolve()),

  getSettings: (): Promise<Settings> => (isTauri ? cmd("get_settings") : demoApi.getSettings()),
  saveSettings: (
    patch: Partial<Settings> & { steamApiKey?: string; clearSteamId?: boolean; clearApiKey?: boolean },
  ): Promise<Settings> =>
    isTauri ? cmd("save_settings", { patch }) : demoApi.saveSettings(patch),

  async openPath(path: string): Promise<void> {
    if (!isTauri) return;
    const { openPath } = await import("@tauri-apps/plugin-opener");
    await openPath(path);
  },

  async openUrl(url: string): Promise<void> {
    if (!isTauri) return;
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  },

  async revealInExplorer(path: string): Promise<void> {
    if (!isTauri) return;
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    await revealItemInDir(path);
  },

  async pickExe(): Promise<string | null> {
    if (!isTauri) return "D:\\Games\\Demo\\DemoGame.exe";
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({
      multiple: false,
      directory: false,
      title: "选择游戏可执行文件",
      filters: [{ name: "可执行文件", extensions: ["exe", "lnk", "bat"] }],
    });
    return typeof picked === "string" ? picked : null;
  },

  async pickFolder(title = "选择文件夹"): Promise<string | null> {
    if (!isTauri) return "F:\\Games\\Demo";
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: false, directory: true, title });
    return typeof picked === "string" ? picked : null;
  },

  async pickImage(): Promise<string | null> {
    if (!isTauri) return null;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({
      multiple: false,
      directory: false,
      title: "选择封面图片",
      filters: [{ name: "图片", extensions: ["jpg", "jpeg", "png", "webp"] }],
    });
    return typeof picked === "string" ? picked : null;
  },
};

/** 把本地路径转成 webview 可加载的 URL；https 原样返回。 */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  if (!isTauri) return null;
  return convertFileSrc(path);
}

/** 后端事件 */
export type BackendEvents = {
  started: (p: { gameId: string; pid: number; startedAt: string }) => void;
  exited: (p: { gameId: string; exitCode: number | null; sessionSec: number; crashed: boolean }) => void;
  unlocked: (p: { gameId: string; achievementId: number; name: string; description: string; iconUrl: string | null }) => void;
  achievementsSynced: (p: {
    gameId: string;
    newlyUnlocked: number;
    unlocked: number;
    total: number;
    source: string;
  }) => void;
  scanProgress: (p: { step: string; done: number; total: number }) => void;
  libraryUpdated: (gameId: string) => void;
};

export async function subscribeEvents(events: BackendEvents): Promise<() => void> {
  if (!isTauri) return () => {};
  // 六个监听一起注册：任何一路失败都把已注册的退掉，别留下半套监听。
  const regs: Array<Promise<UnlistenFn>> = [
    listen("game://started", (e) => events.started(e.payload as never)),
    listen("game://exited", (e) => events.exited(e.payload as never)),
    listen("achievement://unlocked", (e) => events.unlocked(e.payload as never)),
    listen("achievement://synced", (e) => events.achievementsSynced(e.payload as never)),
    listen("scan://progress", (e) => events.scanProgress(e.payload as never)),
    listen("library://updated", (e) => events.libraryUpdated(e.payload as string)),
  ];
  try {
    const unlisteners = await Promise.all(regs);
    return () => unlisteners.forEach((un) => un());
  } catch (e) {
    for (const reg of regs) {
      try {
        (await reg)();
      } catch {
        /* 注册本身就失败了，没有可退订的 */
      }
    }
    throw e;
  }
}
