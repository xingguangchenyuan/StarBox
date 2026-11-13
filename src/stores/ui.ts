import { create } from "zustand";

export type DialogKind = "settings" | "add" | "scan" | "tags" | "shortcuts" | "match" | null;

interface UiState {
  dialog: DialogKind;
  /** 拖入/选择文件夹后，添加弹层要自动扫描的路径 */
  pendingFolder: string | null;
  /** 「匹配 Steam」弹层针对哪个游戏 */
  matchGameId: string | null;
  open: (d: Exclude<DialogKind, null>) => void;
  openAddAt: (path: string) => void;
  openMatch: (gameId: string) => void;
  close: () => void;
  lighten: number;
  setLighten: (v: number) => void;
}

export const useUi = create<UiState>((set) => ({
  dialog: null,
  pendingFolder: null,
  matchGameId: null,
  open: (dialog) => set({ dialog, pendingFolder: null, matchGameId: null }),
  openAddAt: (path) => set({ dialog: "add", pendingFolder: path, matchGameId: null }),
  openMatch: (gameId) => set({ dialog: "match", matchGameId: gameId, pendingFolder: null }),
  close: () => set({ dialog: null, pendingFolder: null, matchGameId: null }),
  lighten: 0,
  setLighten: (lighten) => set({ lighten }),
}));
