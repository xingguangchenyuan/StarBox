import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
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

  return (
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
          <div
            onClick={onDropZoneClick}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 150,
              background: "rgba(6,12,18,.78)",
              backdropFilter: "blur(2px)",
              display: "grid",
              placeItems: "center",
              pointerEvents: "auto",
            }}
          >
            <div
              style={{
                border: "1.5px dashed rgba(102,192,244,.55)",
                borderRadius: 14,
                padding: "40px 56px",
                textAlign: "center",
                background: "rgba(22,32,45,.55)",
              }}
            >
              <IconDownload size={26} />
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 12 }}>松手就加入游戏库</div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 6 }}>
                拖入 exe，或整个游戏文件夹
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {booting && !ready && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "var(--bg)",
            display: "grid",
            placeItems: "center",
            color: "var(--text-3)",
            fontSize: 11.5,
            letterSpacing: "0.18em",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 9,
                background: "var(--hi)",
                animation: "breathe 1.2s ease-in-out infinite",
              }}
            />
            正在打开星匣…
          </div>
        </div>
      )}
    </div>
  );
}
