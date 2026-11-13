import { create } from "zustand";

/** 运行中游戏需要每秒刷新一次「本次已游玩」，集中一个时钟避免各处各开定时器。 */
export const useClock = create<{ now: number; setNow: (n: number) => void }>((set) => ({
  now: Date.now(),
  setNow: (now) => set({ now }),
}));

export function sessionSeconds(startedAt: string | undefined, now = Date.now()): number {
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
}
