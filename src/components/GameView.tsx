import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/stores/app";
import { useUi } from "@/stores/ui";
import { toast } from "@/stores/toasts";
import { t } from "@/i18n/zh-CN";
import { achPercent, fmtClock, fmtHours, relDay } from "@/lib/format";
import { IconChevronDown, IconDots, IconPlay, IconStarFilled, IconStar, IconStop } from "@/components/Icons";
import { api } from "@/lib/api";
import { bannerUrl } from "@/components/art";
import { OverviewPane } from "@/components/panes/OverviewPane";
import { AchievementsPane } from "@/components/panes/AchievementsPane";
import { ModsPane } from "@/components/panes/ModsPane";
import { OptionsPane } from "@/components/panes/OptionsPane";
import type { GameTab } from "@/stores/app";
import { useClock, sessionSeconds } from "@/stores/clock";
import { ContextMenu } from "@/components/ContextMenu";

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
  const setView = useApp((s) => s.setView);
  const launch = useApp((s) => s.launch);
  const stopGame = useApp((s) => s.stop);
  const toggleFavorite = useApp((s) => s.toggleFavorite);
  const reload = useApp((s) => s.reload);
  const now = useClock((s) => s.now);
  const paneRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [tabInd, setTabInd] = useState<{ left: number; width: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [playMenu, setPlayMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [justFailed, setJustFailed] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const game = useMemo(() => games.find((g) => g.id === gameId), [games, gameId]);

  useEffect(() => {
    setConfirmDelete(false);
    setConfirmStop(false);
    setMenu(null);
    setPlayMenu(null);
    setJustFailed(false);
    setScrolled(false);
    paneRef.current?.scrollTo({ top: 0 });
  }, [gameId]);

  useEffect(() => {
    if (!justFailed) return;
    const id = window.setTimeout(() => setJustFailed(false), 3 * 60 * 1000);
    return () => window.clearTimeout(id);
  }, [justFailed]);

  // 页签下划线随当前页签滑动（160ms），窗口变宽时重新量
  useLayoutEffect(() => {
    const wrap = tabsRef.current;
    if (!wrap) return;
    const measure = () => {
      const on = wrap.querySelector<HTMLElement>(".tab.is-on");
      if (on) setTabInd({ left: on.offsetLeft, width: on.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [tab, gameId, games]);

  if (!game) return null;

  const running = game.running || !!sessions[game.id];
  const elapsed = running ? sessionSeconds(sessions[game.id]?.startedAt, now) : 0;
  const banner = bannerUrl(game);
  const pct = achPercent(game);
  const broken = !game.exePath && !game.workDir;
  const primary = game.titleEn || game.title;
  const secondary = game.titleEn ? game.title : null;

  const onPlay = async () => {
    if (busy) return;
    setBusy(true);
    const res = await launch(game.id);
    setBusy(false);
    if (!res.ok) {
      setJustFailed(true);
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
      setConfirmStop(false);
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

  const relocate = async () => {
    const path = await api.pickExe();
    if (!path) return;
    const dir = path.replace(/[\\/][^\\/]+$/, "");
    await useApp.getState().updatePaths(game.id, path, dir, game.args ?? "");
    await reload();
    toast.info("已重新定位", path);
  };

  const hasCustomCover = !!game.coverPath && !/^https?:/.test(game.coverPath);

  return (
    <div className="view-in game-view">
      <section className={`hero3${banner ? " has-art" : ""}`}>
        <div className="hero3-art" style={{ ["--a" as string]: game.tintA }}>
          {banner ? (
            <div className="art-img" style={{ backgroundImage: `url("${banner}")` }} />
          ) : (
            <div className="fill" />
          )}
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
            <span>所有游戏</span>
            <i>/</i>
            <b>{primary}</b>
          </div>
          <div className="spacer" />
          <button
            className="icon-btn"
            title={t("rail.more")}
            aria-label={t("rail.more")}
            aria-haspopup="menu"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setMenu({ x: r.right - 200, y: r.bottom + 6 });
            }}
          >
            <IconDots size={15} />
          </button>
        </div>

        <div className="hero3-body">
          <h1 className="hero3-title">
            <span>{primary}</span>
          </h1>
          {secondary && <div className="hero3-sub">{secondary}</div>}
          <div className="hero3-meta">
            {game.studio && <span>{game.studio}</span>}
            {game.releaseDate && (
              <>
                <span className="sep" />
                <span>{game.releaseDate}</span>
              </>
            )}
            <span className="sep" />
            <span className="src-txt">{game.platform === "steam" ? "Steam" : game.platform === "epic" ? "Epic" : "本地添加"}</span>
            {game.tags.map((tg) => (
              <button
                className="tag-chip"
                key={tg.id}
                style={{ color: tg.color, background: `${tg.color}1f`, borderColor: `${tg.color}55` }}
                onClick={() => {
                  select(null);
                  setView(`tag:${tg.id}`);
                }}
              >
                {tg.name}
              </button>
            ))}
          </div>

          <div className="hero3-actions">
            <div className={`play-split${running ? " is-running" : ""}`}>
              <button
                className={`play-main${broken ? " is-broken" : ""}`}
                onClick={() => void (broken ? relocate() : onPlay())}
                disabled={busy}
              >
                {busy ? <span className="spin" /> : broken ? <IconStop size={14} /> : <IconPlay size={15} />}
                {busy
                  ? "正在启动…"
                  : broken
                    ? "找不到程序 · 重新定位"
                    : running
                      ? t("game.running")
                      : t("game.play")}
                {running && !busy && <span className="run-time">{fmtClock(elapsed)}</span>}
              </button>
              {!broken && (
                <button
                  className="play-chev"
                  aria-label="启动选项"
                  aria-haspopup="menu"
                  onClick={(e) => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setPlayMenu({ x: r.right - 200, y: r.bottom + 6 });
                  }}
                >
                  <IconChevronDown size={11} />
                </button>
              )}
            </div>

            <button
              className={`fav-btn${game.favorite ? " is-on" : ""}`}
              title={game.favorite ? t("game.favorited") : t("game.favorite")}
              aria-label={game.favorite ? t("game.favorited") : t("game.favorite")}
              onClick={() => void toggleFavorite(game.id)}
            >
              {game.favorite ? <IconStarFilled size={15} /> : <IconStar size={15} />}
            </button>

            <div className="hero3-stats">
              <span>
                已玩 <b>{fmtHours(game.playtimeSec)}</b>
              </span>
              <span className="sep" />
              <span>上次 {relDay(game.lastPlayedAt)}</span>
            </div>
          </div>

          {justFailed && (
            <div className="launch-fail">
              启动失败，可能是路径失效或程序被移动。点「找不到程序 · 重新定位」可以指到新的 exe。
            </div>
          )}
        </div>
      </section>

      <section className={`under${scrolled ? " is-scrolled" : ""}`}>
        <div className="tabs" role="tablist" ref={tabsRef}>
          {tabInd && <span className="tab-ind" style={{ transform: `translateX(${tabInd.left}px)`, width: tabInd.width }} />}
          {TABS.map((x) => (
            <button
              key={x.key}
              className={`tab${tab === x.key ? " is-on" : ""}`}
              onClick={() => setTab(x.key)}
              role="tab"
              aria-selected={tab === x.key}
            >
              {x.label}
              {x.key === "ach" && game.achTotal > 0 && <span className="n">{game.achTotal}</span>}
              {x.key === "mod" && game.modCount > 0 && <span className="n">{game.modCount}</span>}
            </button>
          ))}
          <div className="spacer" />
          <span className={`tab-ach${pct === 100 ? " is-full" : ""}`}>
            成就 {game.achUnlocked}/{game.achTotal}
          </span>
        </div>

        <div
          className="pane-scroll"
          id="pane-scroll"
          ref={paneRef}
          onScroll={(e) => setScrolled((e.currentTarget as HTMLElement).scrollTop > 24)}
        >
          {tab === "overview" && (
            <div className="pane-fade" key="overview">
              <OverviewPane game={game} />
            </div>
          )}
          {tab === "ach" && (
            <div className="pane-fade" key="ach">
              <AchievementsPane game={game} />
            </div>
          )}
          {tab === "mod" && (
            <div className="pane-fade" key="mod">
              <ModsPane game={game} />
            </div>
          )}
          {/* 启动选项常驻挂载、切走时只隐藏：否则「未保存的修改」会随卸载静默丢失 */}
          <div className="pane-fade" style={{ display: tab === "opts" ? undefined : "none" }}>
            <OptionsPane game={game} />
          </div>
        </div>
      </section>

      {playMenu && (
        <ContextMenu
          x={playMenu.x}
          y={playMenu.y}
          width={200}
          onClose={() => setPlayMenu(null)}
          items={[
            {
              label: t("game.openFolder"),
              disabled: !game.workDir && !game.exePath,
              onSelect: () => void api.revealInExplorer(game.exePath ?? game.workDir!),
            },
            {
              label: "带参数启动",
              disabled: !game.args,
              hint: game.args ?? "未设置",
              onSelect: () => void onPlay(),
            },
            ...(running
              ? [
                  { separator: true },
                  {
                    label: confirmStop ? "再点一次结束游戏" : t("game.stop"),
                    danger: true,
                    onSelect: () => {
                      if (!confirmStop) {
                        setConfirmStop(true);
                        return false;
                      }
                      void onStop();
                    },
                  },
                ]
              : []),
          ]}
        />
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          width={200}
          onClose={() => {
            setMenu(null);
            setConfirmDelete(false);
          }}
          title={game.title}
          items={[
            {
              label: game.appid ? t("match.rematch") : t("match.entry"),
              onSelect: () => useUi.getState().openMatch(game.id),
            },
            { label: t("game.changeCover"), onSelect: () => void changeCover() },
            ...(hasCustomCover
              ? [{ label: t("game.resetCover"), onSelect: () => void resetCover() }]
              : []),
            { separator: true },
            {
              label: t("game.openFolder"),
              disabled: !game.exePath && !game.workDir,
              onSelect: () => void api.revealInExplorer(game.exePath ?? game.workDir!),
            },
            {
              label: game.hidden ? t("game.showHidden") : t("game.hidden"),
              onSelect: () => {
                void (async () => {
                  await api.setHidden(game.id, !game.hidden);
                  await reload();
                  toast.info(game.hidden ? t("game.showHidden") : t("game.hidden"), game.title);
                  if (!game.hidden) select(null);
                })();
              },
            },
            { separator: true },
            {
              label: confirmDelete ? t("game.deleteConfirm") : t("game.deleteGame"),
              danger: true,
              onSelect: () => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return false;
                }
                void (async () => {
                  try {
                    // 走 store：运行中的游戏会先结束进程，再删库并清会话
                    await useApp.getState().removeGame(game.id);
                    toast.info(t("toast.removed"), game.title);
                  } catch (e) {
                    toast.warn("移除失败", String(e));
                  }
                })();
              },
            },
          ]}
        />
      )}
    </div>
  );
}
