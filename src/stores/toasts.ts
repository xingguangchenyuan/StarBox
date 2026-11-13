import { create } from "zustand";

export type ToastKind = "info" | "ach" | "warn";

export interface ToastItem {
  id: number;
  kicker: string;
  title: string;
  meta?: string;
  kind: ToastKind;
  iconUrl?: string | null;
  createdAt: number;
}

interface ToastState {
  items: ToastItem[];
  push: (t: Omit<ToastItem, "id" | "createdAt">, ttl?: number) => void;
  dismiss: (id: number) => void;
}

let seq = 1;

export const useToasts = create<ToastState>((set, get) => ({
  items: [],
  push(t, ttl = 3400) {
    const id = seq++;
    const item: ToastItem = { ...t, id, createdAt: Date.now() };
    set({ items: [...get().items.slice(-3), item] });
    window.setTimeout(() => get().dismiss(id), ttl);
  },
  dismiss(id) {
    set({ items: get().items.filter((x) => x.id !== id) });
  },
}));

export const toast = {
  info(title: string, meta?: string, kicker = "星匣") {
    useToasts.getState().push({ kicker, title, meta, kind: "info" });
  },
  achievement(title: string, meta?: string, iconUrl?: string | null) {
    useToasts.getState().push({ kicker: "成就解锁", title, meta, kind: "ach", iconUrl }, 4600);
  },
  warn(title: string, meta?: string, kicker = "出错了") {
    useToasts.getState().push({ kicker, title, meta, kind: "warn" }, 5200);
  },
};
