import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { Rail } from "@/components/Rail";
import { LibraryView } from "@/components/LibraryView";
import { GameView } from "@/components/GameView";
import { Toasts } from "@/components/Toasts";
import { AddGameDialog } from "@/components/dialogs/AddGameDialog";
import { ScanDialog } from "@/components/dialogs/ScanDialog";
import { SettingsDialog } from "@/components/dialogs/SettingsDialog";
import { MatchSteamDialog } from "@/components/dialogs/MatchSteamDialog";
import { useApp } from "@/stores/app";
import { useUi } from "@/stores/ui";
import { useClock } from "@/stores/clock";
import { toast } from "@/stores/toasts";
import { isTauri, subscribeEvents } from "@/lib/api";
import { fmtDuration } from "@/lib/format";
import { t } from "@/i18n/zh-CN";
import { IconDownload } from "@/components/Icons";
import { useHashRoute } from "@/lib/route";

export default function App() {
  const booting = useApp((s) => s.booting);
  const ready = useApp((s) => s.ready);
  const selectedId = useApp((s) => s.selectedId);
  const sessions = useApp((s) => s.sessions);
  const bootstrap = useApp((s) => s.bootstrap);
  const select = useApp((s) => s.select);
  const dialog = useUi((s) => s.dialog);
  const matchGameId = useUi((s) => s.matchGameId);
  const games = useApp((s) => s.games);
  const matchGame = matchGameId ? games.find((g) => g.id === matchGameId) ?? null : null;
  const setNow = useClock((s) => s.setNow);
  const [dragOver, setDragOver] = useState(false);

  useHashRoute();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // 运行中游戏每秒刷新时长
  const hasRunning = Object.keys(sessions).length > 0;
  useEffect(() => {
    if (!hasRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasRunning, setNow]);

  // 后端事件
  useEffect(() => {
    let dispose: (() => void) | undefined;
    void subscribeEvents({
      started: (p) => useApp.getState().markStarted(p.gameId, p.pid, p.startedAt),
      exited: (p) => {
        const game = useApp.getState().games.find((g) => g.id === p.gameId);
        useApp.getState().markExited(p.gameId, p.sessionSec);
        if (p.crashed) {
          toast.warn(
            t("toast.crashed"),
            `${game?.title ?? ""} · exit ${p.exitCode ?? "?"} · ${fmtDuration(p.sessionSec)}`,
            "异常退出",
          );
        } else {
          toast.info(t("toast.exited"), `${game?.title ?? ""} · ${fmtDuration(p.sessionSec)}`, "已退出");
        }
      },
      unlocked: (p) => toast.achievement(p.name, p.description, p.iconUrl),
      achievementsSynced: (p) => {
        const game = useApp.getState().games.find((g) => g.id === p.gameId);
        toast.info(
          `新解锁 ${p.newlyUnlocked} 个 · ${p.unlocked}/${p.total}`,
          game?.title ?? "",
          p.source === "steam" ? "Steam 成就" : "本地成就",
        );
      },
      scanProgress: () => undefined,
      libraryUpdated: (gameId) => {
        const store = useApp.getState();
        void store.reload();
        if (gameId) void store.refreshGameAchievements(gameId);
      },
    }).then((d) => {
      dispose = d;
    });
    return () => dispose?.();
  }, []);

  // 拖拽入库
  useEffect(() => {
    if (!isTauri) {
      const over = (e: DragEvent) => {
        e.preventDefault();
        setDragOver(true);
      };
      const leave = () => setDragOver(false);
      const drop = (e: DragEvent) => {
        e.preventDefault();
        setDragOver(false);
      };
      window.addEventListener("dragover", over);
      window.addEventListener("dragleave", leave);
      window.addEventListener("drop", drop);
      return () => {
        window.removeEventListener("dragover", over);
        window.removeEventListener("dragleave", leave);
        window.removeEventListener("drop", drop);
      };
    }

    let dispose: (() => void) | undefined;
    void (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      dispose = await getCurrentWebview().onDragDropEvent(async (event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") setDragOver(true);
        if (payload.type === "leave") setDragOver(false);
        if (payload.type === "drop") {
          setDragOver(false);
          const path = payload.paths[0];
          if (!path) return;
          // 文件夹交给「扫描候选」流程，文件直接入库
          if (!/\.(exe|lnk|bat|cmd)$/i.test(path)) {
            useUi.getState().openAddAt(path);
            return;
          }
          try {
            // 拖入的若是文件夹，以它为工作目录；文件则用同目录
            const isDir = !/\.(exe|lnk|bat|cmd)$/i.test(path);
            const { game, existed } = await useApp.getState().addGame(path, isDir ? path : null);
            useApp.getState().select(game.id);
            if (existed) toast.info(t("toast.alreadyInLibrary"), `《${game.title}》`, t("toast.addedMeta"));
            else toast.info(t("toast.added"), `《${game.title}》`, t("toast.addedMeta"));
          } catch (e) {
            toast.warn("拖入失败", String(e), t("rail.addGame"));
          }
        }
      });
    })();
    return () => dispose?.();
  }, []);

  // 减少动效：设置项或系统偏好任一开启即生效
  const reduceMotion = useApp((s) => s.settings?.reduceMotion ?? false);
  const [systemReduce, setSystemReduce] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setSystemReduce(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const calm = reduceMotion || systemReduce;
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = calm ? "true" : "false";
  }, [calm]);

  // 键盘：方向键走封面墙 / 列表 / 侧栏，1–4 切页签，F 收藏，Ctrl+Enter 启动
  useEffect(() => {
    const isArrow = (key: string) =>
      key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown";

    // 一维列表（侧栏 / 列表视图）只做前后移动
    const moveLinear = (nodes: HTMLElement[], current: HTMLElement, key: string) => {
      const i = Math.max(0, nodes.indexOf(current));
      const step = key === "ArrowUp" || key === "ArrowLeft" ? -1 : 1;
      const next = nodes[Math.min(nodes.length - 1, Math.max(0, i + step))];
      next?.focus();
      next?.scrollIntoView({ block: "nearest" });
    };

    // 封面墙按几何位置找最近卡片，列数变化时也不会跑丢
    const moveGrid = (nodes: HTMLElement[], current: HTMLElement, key: string) => {
      const cr = current.getBoundingClientRect();
      let best: HTMLElement | null = null;
      let bestScore = Infinity;
      for (const c of nodes) {
        if (c === current) continue;
        const r = c.getBoundingClientRect();
        const dx = r.left - cr.left;
        const dy = r.top - cr.top;
        let ok = false;
        if (key === "ArrowLeft") ok = dx < -4 && Math.abs(dy) < r.height / 2;
        if (key === "ArrowRight") ok = dx > 4 && Math.abs(dy) < r.height / 2;
        if (key === "ArrowUp") ok = dy < -4 && Math.abs(dx) < r.width / 2;
        if (key === "ArrowDown") ok = dy > 4 && Math.abs(dx) < r.width / 2;
        if (!ok) continue;
        const score = Math.abs(dx) + Math.abs(dy);
        if (score < bestScore) {
          bestScore = score;
          best = c;
        }
      }
      if (best) best.focus();
    };

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (useUi.getState().dialog) return;
      const store = useApp.getState();
      const active = document.activeElement as HTMLElement | null;

      // 侧栏列表在库视图和详情页都常驻，方向键都能走
      if (isArrow(e.key) && active?.closest(".rail .games")) {
        const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-rail-game]"));
        if (nodes.includes(active)) {
          e.preventDefault();
          moveLinear(nodes, active, e.key);
          return;
        }
      }

      if (store.selectedId) {
        const tabs = ["overview", "ach", "mod", "opts"] as const;
        const idx = Number(e.key) - 1;
        if (idx >= 0 && idx < tabs.length && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          store.setTab(tabs[idx]);
          return;
        }
        if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          void store.toggleFavorite(store.selectedId);
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          void store.launch(store.selectedId).then((res) => {
            if (!res.ok) toast.warn("启动失败", res.error ?? "", "启动");
          });
          return;
        }
        return;
      }

      if (!isArrow(e.key)) return;
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(
          store.viewMode === "grid" ? "[data-game-card]" : "[data-game-row]",
        ),
      );
      if (!nodes.length) return;
      if (!active || !nodes.includes(active)) {
        e.preventDefault();
        nodes[0].focus();
        nodes[0].scrollIntoView({ block: "nearest" });
        return;
      }
      e.preventDefault();
      if (store.viewMode === "grid") moveGrid(nodes, active, e.key);
      else moveLinear(nodes, active, e.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Esc 返回游戏库；Ctrl+K 回到库并聚焦搜索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 截图查看器打开时，Esc 只关它，不要顺带退出游戏详情
      if (document.querySelector(".lightbox")) return;
      if (e.key === "Escape" && !useUi.getState().dialog && useApp.getState().selectedId) {
        select(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && useApp.getState().selectedId) {
        e.preventDefault();
        select(null);
        window.setTimeout(() => {
          const input = document.querySelector<HTMLInputElement>(".search input");
          input?.focus();
        }, 30);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select]);

  const onDropZoneClick = useCallback(() => setDragOver(false), []);

  // 首屏不要白屏：按真实布局画骨架（侧栏 8 行、封面墙 2 排）
  if (booting && !ready) return <BootSkeleton />;

  return (
    <MotionConfig reducedMotion={calm ? "always" : "user"}>
      <div className="app">
        <Rail />
        <main className="stage">
          {selectedId ? <GameView gameId={selectedId} /> : <LibraryView />}
        </main>

        <Toasts />

        <AnimatePresence>
          {dialog === "add" && <AddGameDialog key="add" />}
          {dialog === "scan" && <ScanDialog key="scan" />}
          {dialog === "settings" && <SettingsDialog key="settings" />}
          {dialog === "match" && matchGame && <MatchSteamDialog key={`match-${matchGame.id}`} game={matchGame} />}
        </AnimatePresence>

        <AnimatePresence>
          {dragOver && (
            <div className="drop-overlay" onClick={onDropZoneClick}>
              <div className="drop-box">
                <IconDownload size={26} />
                <div className="drop-title">松手就加入游戏库</div>
                <div className="drop-hint">拖入 exe，或整个游戏文件夹</div>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

function BootSkeleton() {
  return (
    <div className="app boot-skel" aria-busy="true" aria-label="正在加载游戏库">
      <aside className="rail">
        <div className="brand">
          <div className="skeleton sk-mark" />
          <div className="skeleton sk-brand" />
        </div>
        <div className="sk-nav">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="skeleton sk-navrow" key={i} />
          ))}
        </div>
        <div className="sk-games">
          {Array.from({ length: 8 }).map((_, i) => (
            <div className="skeleton sk-gamerow" key={i} />
          ))}
        </div>
      </aside>
      <main className="stage">
        <div className="sk-head">
          <div className="skeleton sk-title" />
          <div className="skeleton sk-sub" />
        </div>
        <div className="sk-wall">
          {Array.from({ length: 12 }).map((_, i) => (
            <div className="skeleton sk-card" key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}
