import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/stores/app";
import { toast } from "@/stores/toasts";
import { t } from "@/i18n/zh-CN";
import { PLATFORM_SOURCE, achPercent } from "@/lib/format";
import { IconPlay, IconStarFilled, IconStar, IconStop } from "@/components/Icons";
import { api } from "@/lib/api";
import { bannerUrl } from "@/components/art";
import { OverviewPane } from "@/components/panes/OverviewPane";
import { AchievementsPane } from "@/components/panes/AchievementsPane";
import { ModsPane } from "@/components/panes/ModsPane";
import { OptionsPane } from "@/components/panes/OptionsPane";
import type { GameTab } from "@/stores/app";

const TABS: Array<{ key: GameTab; label: string }> = [
  { key: "overview", label: t("game.tabs.overview") },
  { key: "ach", label: t("game.tabs.achievements") },
  { key: "mod", label: t("game.tabs.mods") },
  { key: "opts", label: t("game.tabs.options") },
];

export function GameView({ gameId }: { gameId: string }) {
  const games = useApp((s) => s.games);
  const sessions = useApp((s) => s.sessions);
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const select = useApp((s) => s.select);
  const launch = useApp((s) => s.launch);
  const stopGame = useApp((s) => s.stop);
  const toggleFavorite = useApp((s) => s.toggleFavorite);
  const reload = useApp((s) => s.reload);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const game = useMemo(() => games.find((g) => g.id === gameId), [games, gameId]);

  useEffect(() => {
    setConfirmDelete(false);
    setMenuOpen(false);
  }, [gameId]);

  useEffect(() => {
    const onDoc = () => setMenuOpen(false);
    if (menuOpen) {
      document.addEventListener("click", onDoc);
      return () => document.removeEventListener("click", onDoc);
    }
  }, [menuOpen]);

  if (!game) return null;

  const running = game.running || !!sessions[game.id];
  const sessionSec = sessions[game.id]
    ? Math.max(0, Math.floor((Date.now() - new Date(sessions[game.id].startedAt).getTime()) / 1000))
    : 0;
  const banner = bannerUrl(game);
  const pct = achPercent(game);

  const onPlay = async () => {
    if (busy) return;
    setBusy(true);
    const res = await launch(game.id);
    setBusy(false);
    if (!res.ok) {
      toast.warn(`《${game.title}》无法启动`, res.error, "启动失败");
      return;
    }
    if (running) {
      toast.info(
        `《${game.title}》`,
        res.focused ? "游戏窗口已置于最前" : "游戏正在运行，但没找到可切回的窗口",
        res.focused ? "已切回" : "运行中",
      );
      return;
    }
    toast.info(`《${game.title}》`, "正在启动…", "启动中");
  };

  const onStop = async () => {
    try {
      await stopGame(game.id);
      toast.info(`《${game.title}》`, "已结束进程", "已退出");
    } catch (e) {
      toast.warn("结束进程失败", String(e), "未退出");
    }
  };

  const changeCover = async () => {
    const path = await api.pickImage();
    if (!path) return;
    await useApp.getState().setCover(game.id, path);
    toast.info(t("toast.coverSet"), game.title);
  };

  const resetCover = async () => {
    await useApp.getState().setCover(game.id, null);
    toast.info(t("toast.coverReset"), game.title);
  };

  const hasCustomCover = !!game.coverPath && !/^https?:/.test(game.coverPath);

  return (
    <div className="view-in" style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}>
      <section className="hero3">
        <div className="hero3-art" style={{ ["--a" as string]: game.tintA }}>
          {banner && <div className="art-img" style={{ backgroundImage: `url("${banner}")` }} />}
          <div className="fill" style={banner ? { opacity: 0.35 } : undefined} />
          <div className="tint" />
          <div className="veil" />
          <div className="scrim" />
        </div>

        <div className="hero3-top">
          <button className="back" onClick={() => select(null)}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M9.6 3.4L5 8l4.6 4.6" />
            </svg>
            {t("game.back")}
          </button>
          <div className="crumb">
            所有游戏 /
            <b>{game.title}</b>
          </div>
          <div className="spacer" />
          <div style={{ position: "relative" }}>
            <button className="icon-btn" title="更多" onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M3 8h.01M8 8h.01M13 8h.01" strokeLinecap="round" />
              </svg>
            </button>
            {menuOpen && (
              <div
                className="menu-pop"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  right: 0,
                  top: 34,
                  width: 190,
                  padding: 5,
                  background: "#121b26",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  boxShadow: "0 18px 44px rgba(0,0,0,.6)",
                  zIndex: 40,
                }}
              >
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    if (game.workDir) void api.revealInExplorer(game.exePath ?? game.workDir);
                  }}
                >
                  {t("game.openFolder")}
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    void changeCover();
                  }}
                >
                  {t("game.changeCover")}
                </button>
                {hasCustomCover && (
                  <button
                    className="menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      void resetCover();
                    }}
                  >
                    {t("game.resetCover")}
                  </button>
                )}
                <button
                  className="menu-item"
                  onClick={async () => {
                    setMenuOpen(false);
                    await api.setHidden(game.id, !game.hidden);
                    await reload();
                    toast.info(game.hidden ? t("game.showHidden") : t("game.hidden"), game.title);
                    if (!game.hidden) select(null);
                  }}
                >
                  {game.hidden ? t("game.showHidden") : t("game.hidden")}
                </button>
                <div style={{ height: 1, background: "var(--line-soft)", margin: "4px 6px" }} />
                <button
                  className="menu-item is-danger"
                  onClick={async () => {
                    if (!confirmDelete) {
                      setConfirmDelete(true);
                      return;
                    }
                    setMenuOpen(false);
                    await api.deleteGame(game.id);
                    select(null);
                    await reload();
                    toast.info(t("toast.removed"), game.title);
                  }}
                >
                  {confirmDelete ? t("game.deleteConfirm") : t("game.deleteGame")}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="hero3-body">
          <h1 className="hero3-title">
            <span>{game.title}</span>
            {game.titleEn && <small>{game.titleEn}</small>}
          </h1>
          <div className="hero3-meta">
            {game.studio && <span>{game.studio}</span>}
            {game.releaseDate && (
              <>
                <span className="sep" />
                <span>{game.releaseDate}</span>
              </>
            )}
            {game.tags.map((tg) => (
              <span className="tagpill" key={tg.id}>
                {tg.name}
              </span>
            ))}
            {(game.studio || game.releaseDate || game.tags.length > 0) && <span className="sep" />}
            <span className="mono">{running ? `本次 ${Math.floor(sessionSec / 60)} 分钟` : PLATFORM_SOURCE[game.platform]}</span>
          </div>
          <div className="hero3-actions">
            <button className="btn-play big" onClick={onPlay} disabled={busy}>
              <IconPlay size={15} />
              {running ? t("game.running") : t("game.play")}
              <span className="chev">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 6.4L8 10.2l4-3.8" />
                </svg>
              </span>
            </button>
            {running && (
              <button className="btn-still" title={t("game.stop")} onClick={onStop}>
                <IconStop size={13} />
              </button>
            )}
            <button className="btn-ghost" onClick={() => setTab("ach")}>
              <IconStar size={14} />
              {t("game.achievements", { a: game.achUnlocked, b: game.achTotal })}
            </button>
            <button
              className={`btn-ghost${game.favorite ? " is-on" : ""}`}
              onClick={() => void toggleFavorite(game.id)}
            >
              {game.favorite ? <IconStarFilled size={14} /> : <IconStar size={14} />}
              {game.favorite ? t("game.favorited") : t("game.favorite")}
            </button>
          </div>
        </div>
      </section>

      <section className="under">
        <div className="tabs" role="tablist">
          {TABS.map((x) => (
            <button
              key={x.key}
              className={`tab${tab === x.key ? " is-on" : ""}`}
              onClick={() => setTab(x.key)}
              role="tab"
              aria-selected={tab === x.key}
            >
              {x.label}
              {x.key === "ach" && <span className="n">{game.achTotal}</span>}
              {x.key === "mod" && <span className="n">{game.modCount}</span>}
            </button>
          ))}
          <div className="spacer" />
          {game.achTotal > 0 && (
            <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)", paddingBottom: 2 }}>
              成就 {game.achUnlocked}/{game.achTotal} · {pct}%
            </span>
          )}
        </div>

        <div className="pane-scroll" id="pane-scroll">
          {tab === "overview" && <OverviewPane game={game} />}
          {tab === "ach" && <AchievementsPane game={game} />}
          {tab === "mod" && <ModsPane game={game} />}
          {tab === "opts" && <OptionsPane game={game} />}
        </div>
      </section>
    </div>
  );
}
