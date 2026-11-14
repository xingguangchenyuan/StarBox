import { create } from "zustand";
import type {
  Achievement,
  AchievementSyncResult,
  AchSource,
  AppInfo,
  Game,
  ScanPick,
  ScanResult,
  Settings,
  SortKey,
  SyncAllResult,
  Tag,
  ViewKey,
} from "@/types";
import { api, isDemo } from "@/lib/api";
import { SORT_ORDER } from "@/lib/format";
import { toast } from "@/stores/toasts";

/** 每个游戏一条标签写入队列，避免连点两个标签时后一次覆盖前一次 */
const tagQueue = new Map<string, Promise<unknown>>();

export type GameTab = "overview" | "ach" | "mod" | "opts";

interface Session {
  pid: number;
  startedAt: string;
}

interface AppState {
  ready: boolean;
  booting: boolean;
  games: Game[];
  tags: Tag[];
  settings: Settings | null;
  info: AppInfo | null;
  sessions: Record<string, Session>;
  selectedId: string | null;
  tab: GameTab;
  view: ViewKey;
  platform: "all" | "steam" | "epic" | "local";
  query: string;
  sort: SortKey;
  viewMode: "grid" | "list";
  cardSize: "standard" | "large";
  achievements: Record<string, Achievement[]>;
  refreshing: boolean;
  refreshProgress: { done: number; total: number } | null;
  /** 启动中的游戏：防止连点「开始游戏」拉起两个进程 */
  launching: Record<string, boolean>;
  /** 首屏加载失败原因（DB 损坏、命令缺失等），库视图据此提示而不是显示成空库 */
  loadError: string | null;

  bootstrap: () => Promise<void>;
  reload: () => Promise<void>;
  reloadTags: () => Promise<void>;
  createTag: (name: string, color: string) => Promise<Tag>;
  updateTag: (id: number, name: string, color: string) => Promise<void>;
  deleteTag: (id: number) => Promise<void>;
  select: (id: string | null, tab?: GameTab) => void;
  setTab: (tab: GameTab) => void;
  setView: (v: ViewKey) => void;
  setPlatform: (p: AppState["platform"]) => void;
  setQuery: (q: string) => void;
  cycleSort: () => void;
  setSort: (s: SortKey) => void;
  setViewMode: (m: "grid" | "list") => void;
  setCardSize: (s: "standard" | "large") => void;
  toggleFavorite: (id: string) => Promise<void>;
  setHidden: (gameId: string, hidden: boolean) => Promise<boolean>;
  toggleTag: (gameId: string, tagId: number) => Promise<void>;
  launch: (id: string) => Promise<{ ok: boolean; error?: string; focused?: boolean }>;
  stop: (id: string) => Promise<void>;
  addGame: (path: string, workDir?: string | null) => Promise<{ game: Game; existed: boolean }>;
  importPicks: (picks: ScanPick[]) => Promise<number>;
  scan: () => Promise<ScanResult>;
  loadAchievements: (gameId: string) => Promise<Achievement[]>;
  refreshAchievements: (gameId: string) => Promise<number>;
  unlockAchievement: (gameId: string, achievementId: number, unlocked: boolean) => Promise<void>;
  syncAchievements: (gameId: string, mode?: "auto" | "steam" | "local") => Promise<AchievementSyncResult>;
  syncAllAchievements: (mode?: "auto" | "steam" | "local") => Promise<SyncAllResult>;
  /** 后端成就计数变化时让对应游戏的成就缓存失效，面板可见就重取。 */
  refreshGameAchievements: (gameId: string) => Promise<void>;
  refreshSteam: (gameId: string) => Promise<{ ok: boolean; message?: string }>;
  matchSteam: (gameId: string, appid: number) => Promise<void>;
  refreshAllSteam: () => Promise<{ ok: number; fail: number; total: number }>;
  updateTitles: (gameId: string, title: string, titleEn: string | null) => Promise<void>;
  removeGame: (gameId: string) => Promise<void>;
  updatePaths: (gameId: string, exe: string, workDir: string, args: string) => Promise<void>;
  setCover: (gameId: string, path: string | null) => Promise<void>;
  setAchSource: (gameId: string, source: AchSource) => Promise<void>;
  patchSettings: (
    patch: Partial<Settings> & { steamApiKey?: string; clearSteamId?: boolean; clearApiKey?: boolean },
  ) => Promise<void>;
  markStarted: (gameId: string, pid: number, startedAt: string) => void;
  markExited: (gameId: string, sessionSec: number) => void;
}

const byId = (games: Game[], id: string) => games.find((g) => g.id === id);

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  booting: true,
  games: [],
  tags: [],
  settings: null,
  info: null,
  sessions: {},
  selectedId: null,
  tab: "overview",
  view: "all",
  platform: "all",
  query: "",
  sort: "recent",
  viewMode: "grid",
  cardSize: "standard",
  achievements: {},
  refreshing: false,
  refreshProgress: null,
  launching: {},
  loadError: null,

  async bootstrap() {
    const [info, settings, tags] = await Promise.all([
      api.appInfo().catch(() => null),
      api.getSettings().catch(() => null),
      api.listTags().catch(() => [] as Tag[]),
    ]);
    // 库列表失败要明确告诉用户，不能伪装成「库是空的」
    let games: Game[] = [];
    let loadError: string | null = null;
    try {
      games = await api.listGames();
    } catch (e) {
      loadError = String(e);
    }
    const sort = settings?.sortDefault ?? "recent";
    const sessions: Record<string, Session> = {};
    for (const g of games) {
      if (g.running && g.sessionSec > 0) {
        sessions[g.id] = {
          pid: 0,
          startedAt: new Date(Date.now() - g.sessionSec * 1000).toISOString(),
        };
      }
    }
    set({
      info,
      settings,
      games,
      tags,
      sessions,
      sort,
      viewMode: settings?.viewMode ?? "grid",
      cardSize: settings?.cardSize ?? "standard",
      loadError,
      ready: true,
      booting: false,
    });
  },

  async reload() {
    const [games, tags] = await Promise.all([api.listGames(), api.listTags()]);
    const sessions = { ...get().sessions };
    for (const g of games) {
      if (g.running && !sessions[g.id]) {
        sessions[g.id] = { pid: 0, startedAt: new Date(Date.now() - g.sessionSec * 1000).toISOString() };
      }
      if (!g.running && sessions[g.id]) delete sessions[g.id];
    }
    set({ games, tags, sessions });
  },

  async reloadTags() {
    const tags = await api.listTags();
    set({ tags });
  },

  async createTag(name, color) {
    const tag = await api.createTag(name, color);
    await get().reload();
    return tag;
  },

  async updateTag(id, name, color) {
    await api.updateTag(id, name, color);
    // 游戏里内嵌了标签对象，改名/换色后要整库重读
    await get().reload();
  },

  async deleteTag(id) {
    await api.deleteTag(id);
    await get().reload();
  },

  select(id, tab) {
    set({ selectedId: id, tab: tab ?? "overview" });
  },

  setTab(tab) {
    set({ tab });
  },

  setView(v) {
    set({ view: v, selectedId: null });
  },

  setPlatform(p) {
    set({ platform: p });
  },

  setQuery(q) {
    set({ query: q });
  },

  cycleSort() {
    const i = SORT_ORDER.indexOf(get().sort);
    const next = SORT_ORDER[(i + 1) % SORT_ORDER.length];
    set({ sort: next });
    void api.saveSettings({ sortDefault: next }).catch(() => undefined);
  },

  setSort(s) {
    set({ sort: s });
    void api.saveSettings({ sortDefault: s }).catch(() => undefined);
  },

  setViewMode(m) {
    set({ viewMode: m });
    void api.saveSettings({ viewMode: m }).catch(() => undefined);
  },

  setCardSize(s) {
    set({ cardSize: s });
    void api.saveSettings({ cardSize: s }).catch(() => undefined);
  },

  async toggleFavorite(id) {
    const g = byId(get().games, id);
    if (!g) return;
    const favorite = !g.favorite;
    set({ games: get().games.map((x) => (x.id === id ? { ...x, favorite } : x)) });
    try {
      await api.setFavorite(id, favorite);
    } catch (e) {
      // 后端没写进去就别让星标停在假状态
      set((s) => ({ games: s.games.map((x) => (x.id === id ? { ...x, favorite: !favorite } : x)) }));
      toast.warn("收藏失败", String(e));
    }
  },

  /** 隐藏/取消隐藏：写失败要告诉用户，界面也不能假装已经隐藏。 */
  async setHidden(gameId, hidden) {
    try {
      await api.setHidden(gameId, hidden);
      await get().reload();
      return true;
    } catch (e) {
      toast.warn(hidden ? "隐藏失败" : "取消隐藏失败", String(e));
      return false;
    }
  },

  async toggleTag(gameId, tagId) {
    // 连点两个标签时，第二次读到的必须是第一次写完之后的清单，
    // 否则「整表覆盖」会把前一个标签吞掉。这里按游戏串行排队。
    const prev = tagQueue.get(gameId) ?? Promise.resolve();
    const run = prev.then(async () => {
      const g = byId(get().games, gameId);
      if (!g) return;
      const has = g.tags.some((t) => t.id === tagId);
      const tagIds = has ? g.tags.filter((t) => t.id !== tagId).map((t) => t.id) : [...g.tags.map((t) => t.id), tagId];
      try {
        await api.setTags(gameId, tagIds);
        await get().reload();
      } catch (e) {
        toast.warn("标签保存失败", String(e));
      }
    });
    tagQueue.set(
      gameId,
      run.catch(() => undefined),
    );
    return run;
  },

  async launch(id) {
    // 已经在启动中：直接当成成功，避免双击拉起两个进程 / 弹两条错误提示
    if (get().launching[id]) return { ok: true, focused: false };
    const g = byId(get().games, id);
    if (!g) return { ok: false, error: "游戏不存在" };
    set((s) => ({ launching: { ...s.launching, [id]: true } }));
    try {
      const info = await api.launch(id);
      set((s) => ({
        sessions: { ...s.sessions, [id]: { pid: info.pid, startedAt: info.startedAt } },
        games: s.games.map((x) => (x.id === id ? { ...x, running: true, lastPlayedAt: info.startedAt } : x)),
      }));
      return { ok: true, focused: info.focused };
    } catch (e) {
      return { ok: false, error: String(e) };
    } finally {
      set((s) => {
        const launching = { ...s.launching };
        delete launching[id];
        return { launching };
      });
    }
  },

  async stop(id) {
    const ok = await api.stop(id);
    if (!ok) {
      throw new Error("结束进程失败：游戏可能已经退出，或进程树无法访问");
    }
    set((s) => {
      const sessions = { ...s.sessions };
      delete sessions[id];
      return {
        sessions,
        games: s.games.map((x) => (x.id === id ? { ...x, running: false, sessionSec: 0 } : x)),
      };
    });
    void get().reload();
  },

  async addGame(path, workDir) {
    const known = new Set(get().games.map((g) => g.id));
    const game = await api.addGame(path, workDir ?? null);
    await get().reload();
    return { game, existed: known.has(game.id) };
  },

  async importPicks(picks) {
    const added = await api.importPicks(picks);
    await get().reload();
    return added.length;
  },

  async scan() {
    return api.scanLibraries();
  },

  async loadAchievements(gameId) {
    const list = await api.listAchievements(gameId);
    set((s) => ({ achievements: { ...s.achievements, [gameId]: list } }));
    return list;
  },

  async refreshAchievements(gameId) {
    const res = await api.fetchAchievements(gameId);
    await get().reload();
    await get().loadAchievements(gameId);
    return res.count;
  },

  async unlockAchievement(gameId, achievementId, unlocked) {
    try {
      await api.setAchievementUnlocked(achievementId, unlocked);
    } catch (e) {
      // 写失败就别把界面改成「已达成」
      toast.warn("成就标记失败", String(e));
      return;
    }
    set((s) => {
      const list = (s.achievements[gameId] ?? []).map((a) =>
        a.id === achievementId
          ? { ...a, unlocked, unlockedAt: unlocked ? new Date().toISOString() : null, source: unlocked ? ("manual" as const) : a.source }
          : a,
      );
      const count = list.filter((a) => a.unlocked).length;
      return {
        achievements: { ...s.achievements, [gameId]: list },
        games: s.games.map((g) => (g.id === gameId ? { ...g, achUnlocked: count } : g)),
      };
    });
  },

  async syncAchievements(gameId, mode = "auto") {
    const res = await api.syncAchievements(gameId, mode);
    await get().reload();
    await get().loadAchievements(gameId);
    return res;
  },

  async syncAllAchievements(mode = "auto") {
    const res = await api.syncAllAchievements(mode);
    await get().reload();
    set({ achievements: {} });
    const selected = get().selectedId;
    if (selected) {
      try {
        await get().loadAchievements(selected);
      } catch {
        /* 当前游戏可能没有成就 */
      }
    }
    return res;
  },

  async refreshGameAchievements(gameId) {
    set((s) => {
      const achievements = { ...s.achievements };
      delete achievements[gameId];
      return { achievements };
    });
    if (get().selectedId !== gameId) return;
    try {
      await get().loadAchievements(gameId);
    } catch {
      /* 该游戏可能没有成就或暂时读不到 */
    }
  },

  async refreshSteam(gameId) {
    try {
      const res = await api.refreshSteamData(gameId, true);
      await get().reload();
      return { ok: true, message: res.message ?? undefined };
    } catch (e) {
      return { ok: false, message: String(e) };
    }
  },

  async matchSteam(gameId, appid) {
    await api.matchSteam(gameId, appid);
    await get().reload();
    // 绑定后顺手把成就定义拉一次（失败不影响资料）
    try {
      await get().refreshAchievements(gameId);
    } catch {
      /* 没 Key 或该游戏没有成就：资料已经拉到了，不打扰 */
    }
  },

  /** 一次刷新所有带 AppID 的 Steam 游戏，串行 + 小间隔，避免商店限流 */  async refreshAllSteam() {
    const targets = get().games.filter((g) => g.platform === "steam" && g.appid);
    if (!targets.length) return { ok: 0, fail: 0, total: 0 };

    set({ refreshing: true, refreshProgress: { done: 0, total: targets.length } });
    let ok = 0;
    let fail = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        // 先把「正在拉第 i 个」标出来，避免界面停在 0/N 看起来卡死
        set({ refreshProgress: { done: i, total: targets.length } });
        try {
          await api.refreshSteamData(targets[i].id, true);
          ok++;
        } catch {
          fail++;
        }
        set({ refreshProgress: { done: i + 1, total: targets.length } });
        if (i < targets.length - 1) await new Promise((r) => setTimeout(r, 300));
      }
      await get().reload();
    } finally {
      // reload 失败也要复位，否则顶栏「刷新全部资料」会永久置灰
      set({ refreshing: false, refreshProgress: null });
    }
    return { ok, fail, total: targets.length };
  },

  async updateTitles(gameId, title, titleEn) {
    await api.setTitles(gameId, title, titleEn);
    await get().reload();
  },

  async removeGame(gameId) {
    const running = get().games.find((g) => g.id === gameId)?.running || !!get().sessions[gameId];
    if (running) {
      try {
        await api.stop(gameId);
      } catch {
        /* 进程可能已经自己退出 */
      }
    }
    await api.deleteGame(gameId);
    set((s) => {
      const sessions = { ...s.sessions };
      delete sessions[gameId];
      return {
        sessions,
        selectedId: s.selectedId === gameId ? null : s.selectedId,
      };
    });
    await get().reload();
  },

  async updatePaths(gameId, exe, workDir, args) {
    await api.updatePaths(gameId, exe, workDir, args);
    await get().reload();
  },

  async setCover(gameId, path) {
    await api.setCover(gameId, path);
    await get().reload();
  },

  async setAchSource(gameId, source) {
    await api.setAchSource(gameId, source);
    await get().reload();
  },

  async patchSettings(patch) {
    try {
      const settings = await api.saveSettings(patch);
      set({ settings, cardSize: settings.cardSize, viewMode: settings.viewMode });
    } catch (e) {
      toast.warn("设置保存失败", String(e));
      throw e;
    }
  },

  markStarted(gameId, pid, startedAt) {
    set((s) => ({
      sessions: { ...s.sessions, [gameId]: { pid, startedAt } },
      games: s.games.map((g) => (g.id === gameId ? { ...g, running: true, lastPlayedAt: startedAt } : g)),
    }));
  },

  markExited(gameId, sessionSec) {
    set((s) => {
      const sessions = { ...s.sessions };
      delete sessions[gameId];
      return {
        sessions,
        games: s.games.map((g) =>
          g.id === gameId ? { ...g, running: false, sessionSec: 0, playtimeSec: g.playtimeSec + sessionSec } : g,
        ),
      };
    });
    void get().reload();
  },
}));

export const demoMode = isDemo;
