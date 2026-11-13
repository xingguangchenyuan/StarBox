import type { Game, Platform, SortKey } from "@/types";

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export function fmtHours(sec: number): string {
  if (!sec || sec < 60) return "尚未游玩";
  const h = sec / 3600;
  return `${h.toFixed(1)} 小时`;
}

export function fmtHoursShort(sec: number): string {
  if (!sec || sec < 60) return "—";
  const h = sec / 3600;
  return h >= 100 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分钟`;
  return `${s} 秒`;
}

export function fmtBytes(bytes: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i < 2 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  // 兼容 "2026-08-02 21:14" 与 RFC3339
  const normalized = iso.includes("T") ? iso : iso.replace(" ", "T");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return "—";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return "—";
  return `${fmtDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DAY = 86_400_000;

/** 今天 14:20 / 昨天 22:41 / 10 月 28 日 / 2025 年 6 月 3 日 */
export function relDay(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return "尚未游玩";
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diffDays === 0) return `今天 ${hm}`;
  if (diffDays === 1) return `昨天 ${hm}`;
  if (diffDays < 7) return `${diffDays} 天前`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/** 距离今天多少天，用于「最近游玩」判定 */
export function daysSince(iso: string | null | undefined): number {
  const d = parseDate(iso);
  if (!d) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - d.getTime()) / DAY);
}

export function isRecent(g: Game, days = 30): boolean {
  return daysSince(g.lastPlayedAt) <= days;
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  steam: "Steam",
  epic: "Epic",
  local: "本地",
};

export const PLATFORM_SHORT: Record<Platform, string> = {
  steam: "ST",
  epic: "EP",
  local: "本地",
};

export const PLATFORM_SOURCE: Record<Platform, string> = {
  steam: "Steam 库",
  epic: "Epic 库",
  local: "本地添加",
};

export const SORT_LABEL: Record<SortKey, string> = {
  recent: "最近游玩 ↓",
  hours: "时长 ↓",
  name: "名称 A–Z",
  added: "添加时间 ↓",
};

export const SORT_ORDER: SortKey[] = ["recent", "hours", "name", "added"];

export function sortGames(list: Game[], sort: SortKey): Game[] {
  const l = list.slice();
  switch (sort) {
    case "hours":
      return l.sort((a, b) => b.playtimeSec - a.playtimeSec || a.title.localeCompare(b.title, "zh-Hans-CN"));
    case "name":
      return l.sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN"));
    case "added":
      return l.sort((a, b) => (parseDate(b.addedAt)?.getTime() ?? 0) - (parseDate(a.addedAt)?.getTime() ?? 0));
    case "recent":
    default:
      return l.sort((a, b) => {
        const at = parseDate(a.lastPlayedAt)?.getTime() ?? 0;
        const bt = parseDate(b.lastPlayedAt)?.getTime() ?? 0;
        return bt - at || b.playtimeSec - a.playtimeSec;
      });
  }
}

export function achPercent(g: Pick<Game, "achTotal" | "achUnlocked">): number {
  if (!g.achTotal) return 0;
  return Math.round((g.achUnlocked / g.achTotal) * 100);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 路径文件名（同时支持 \ 与 /） */
export function baseName(p: string | null | undefined): string {
  if (!p) return "";
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

export function stripExe(name: string): string {
  return name.replace(/\.(exe|EXE|bat|BAT|lnk)$/u, "");
}

export function initials(name: string): string {
  const words = name.split(/[\s:·\-—]+/u).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
