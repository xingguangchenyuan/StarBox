import { useEffect, useMemo, useRef, useState } from "react";
import type { Game, SortKey } from "@/types";
import { useApp } from "@/stores/app";
import { useUi } from "@/stores/ui";
import { toast } from "@/stores/toasts";
import { t } from "@/i18n/zh-CN";
import {
  PLATFORM_LABEL,
  SORT_LABEL,
  SORT_ORDER,
  achPercent,
  fmtHoursShort,
  isRecent,
  relDay,
  sortGames,
} from "@/lib/format";
import { IconEpic, IconGamepad, IconPlay, IconStarFilled, IconSteam } from "@/components/Icons";
import { CoverBackdrop, coverUrl } from "@/components/art";
import { matchQuery } from "@/lib/search";
import { api } from "@/lib/api";
import { ContextMenu } from "@/components/ContextMenu";

type MenuHandler = (e: React.MouseEvent, game: Game) => void;

function PlatBadge({ platform }: { platform: Game["platform"] }) {
  const Icon = platform === "steam" ? IconSteam : platform === "epic" ? IconEpic : IconGamepad;
  return (
    <span className="plat-badge" title={PLATFORM_LABEL[platform]}>
      <Icon size={11} />
    </span>
  );
}

function GameCard({ game, onMenu }: { game: Game; onMenu: MenuHandler }) {
  const select = useApp((s) => s.select);
  const launch = useApp((s) => s.launch);
  const pct = achPercent(game);
  const full = game.achTotal > 0 && game.achUnlocked === game.achTotal;
  // titleEn 是商店中文名，title 是原名：底栏优先中文名
  const primary = game.titleEn || game.title;
  const hasCover = !!coverUrl(game);

  const onPlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await launch(game.id);
    if (!res.ok) toast.warn("启动失败", res.error ?? "", "启动");
    else if (res.focused) toast.info("已切回游戏窗口", game.title);
  };

  return (
    <div
      className={`card${game.hidden ? " is-hidden" : ""}${game.running ? " is-running" : ""}${full ? " is-full" : ""}`}
      role="button"
      tabIndex={0}
      data-game-card={game.id}
      onClick={() => select(game.id)}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          void launch(game.id).then((res) => {
            if (!res.ok) toast.warn("启动失败", res.error ?? "", "启动");
          });
        } else {
          select(game.id);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e, game);
      }}
      title={`${game.title}${game.titleEn ? ` · ${game.titleEn}` : ""}${game.studio ? ` · ${game.studio}` : ""}`}
    >
      <div className="cover">
        <CoverBackdrop game={game} />
        <PlatBadge platform={game.platform} />
        {game.running && (
          <span className="run-dot" title={t("rail.runningNow")}>
            <i />
          </span>
        )}
        {game.favorite && !game.running && (
          <span className="fav-mark">
            <IconStarFilled size={11} />
          </span>
        )}
        {/* 有真实封面时不常驻文字，悬停才从底部渐显；占位封面才常驻 */}
        <div className={`titles${hasCover ? " is-overlay" : ""}`}>
          <div className="t-en">{game.title}</div>
          {game.titleEn && <div className="t-cn">{game.titleEn}</div>}
        </div>
        <span
          className="play-hint"
          role="button"
          tabIndex={-1}
          onClick={(e) => void onPlay(e)}
          title={game.running ? t("hero.runningAction") : t("hero.play")}
        >
          <IconPlay size={16} />
        </span>
        {game.achTotal > 0 && (
          <div className={`prog${full ? " is-full" : ""}`} title={`成就 ${game.achUnlocked} / ${game.achTotal}`}>
            <i style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="card-meta">
        {/* 占位封面已经把名字写在画面上，底栏不再重复 */}
        {hasCover && <span className="nm">{primary}</span>}
        <span className="sub">
          <span className="tm">{fmtHoursShort(game.playtimeSec)}</span>
          {game.achTotal > 0 && (
            <span className={`ach-num${full ? " is-full" : ""}`}>
              {game.achUnlocked}/{game.achTotal}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function GameRow({ game, onMenu }: { game: Game; onMenu: MenuHandler }) {
  const select = useApp((s) => s.select);
  const launch = useApp((s) => s.launch);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    e.stopPropagation();
    void launch(game.id).then((res) => {
      if (!res.ok) toast.warn("启动失败", res.error ?? "", "启动");
    });
  };
  return (
    <button
      className={`row-item${game.running ? " is-running" : ""}`}
      data-game-row={game.id}
      onClick={() => select(game.id)}
      onKeyDown={onKey}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e, game);
      }}
    >
      <span
        className="thumb"
        style={
          coverUrl(game)
            ? { backgroundImage: `url("${coverUrl(game)}")` }
            : { backgroundImage: `linear-gradient(160deg, ${game.tintA}, ${game.tintB})` }
        }
      />
      <span className="info">
        <span className="nm">
          {game.titleEn || game.title}
          {game.titleEn && <em>{game.title}</em>}
          {game.running && <span className="run" />}
        </span>
        <span className="sub">
          {game.studio ?? "—"}
          {game.achTotal > 0 && <span>· 成就 {achPercent(game)}%</span>}
        </span>
      </span>
      <span className="col plat-col">
        <PlatBadge platform={game.platform} />
      </span>
      <span className="col tags-col">{game.tags.length ? game.tags.map((x) => x.name).join(" · ") : "—"}</span>
      <span className="col hrs-col">{fmtHoursShort(game.playtimeSec)}</span>
      <span className="col last-col">{game.lastPlayedAt ? relDay(game.lastPlayedAt) : "—"}</span>
      <span className="col ach-col">
        {game.achTotal > 0 ? (
          <>
            {game.achUnlocked}/{game.achTotal}
            <i className="mini-bar">
              <b style={{ width: `${achPercent(game)}%` }} />
            </i>
          </>
        ) : (
          "—"
        )}
      </span>
    </button>
  );
}

const SCROLL_KEY = "sb.libraryScroll";

export function GameWall() {
  const games = useApp((s) => s.games);
  const view = useApp((s) => s.view);
  const platform = useApp((s) => s.platform);
  const query = useApp((s) => s.query);
  const sort = useApp((s) => s.sort);
  const viewMode = useApp((s) => s.viewMode);
  const cardSize = useApp((s) => s.cardSize);
  const tags = useApp((s) => s.tags);
  const showHidden = useApp((s) => s.settings?.showHidden ?? false);
  const sessions = useApp((s) => s.sessions);
  const setPlatform = useApp((s) => s.setPlatform);
  const setView = useApp((s) => s.setView);
  const setQuery = useApp((s) => s.setQuery);
  const select = useApp((s) => s.select);
  const removeGame = useApp((s) => s.removeGame);
  const reload = useApp((s) => s.reload);
  const open = useUi((s) => s.open);
  const wallRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef("");
  const [menu, setMenu] = useState<{ x: number; y: number; game: Game } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [sortOpen, setSortOpen] = useState<{ x: number; y: number } | null>(null);
  const [dir, setDir] = useState<"asc" | "desc" | null>(null);

  // 从详情页返回时封面墙位置不丢：挂载时还原，滚动时记下。
  // 用 sessionStorage 而不是组件 state：详情页会卸载整个库视图。
  useEffect(() => {
    const el = wallRef.current;
    if (!el) return;
    const saved = Number(sessionStorage.getItem(SCROLL_KEY) || "0");
    if (saved > 0) el.scrollTop = saved;
    const onScroll = () => sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // 换筛选/搜索/排序/视图后回到顶部，否则会停在上一组结果的位置。
  // 用「上次的筛选签名」比较而不是 useRef(bool)：StrictMode 会把 effect 跑两遍，
  // 布尔开关会在第二次误判成「切换了筛选」把刚还原的位置清掉。
  useEffect(() => {
    const key = [view, platform, query, sort, viewMode].join("|");
    const prev = filtersRef.current;
    filtersRef.current = key;
    if (!prev || prev === key) return;
    const el = wallRef.current;
    if (el) el.scrollTop = 0;
    sessionStorage.setItem(SCROLL_KEY, "0");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, platform, query, sort, viewMode]);

  const onMenu: MenuHandler = (e, game) => {
    setConfirmRemove(false);
    setMenu({ x: e.clientX, y: e.clientY, game });
  };

  const visible = useMemo(() => games.filter((g) => !g.hidden || showHidden), [games, showHidden]);

  const totals = useMemo(() => {
    const hours = visible.reduce((s, g) => s + g.playtimeSec, 0) / 3600;
    const ach = visible.reduce((s, g) => s + g.achUnlocked, 0);
    return { games: visible.length, hours, ach };
  }, [visible]);

  const list = useMemo(() => {
    const filtered = visible.filter((g) => {
      if (platform !== "all" && g.platform !== platform) return false;
      if (!matchQuery(g, query)) return false;
      if (view === "recent") return isRecent(g, 30);
      if (view === "running") return g.running || !!sessions[g.id];
      if (view === "fav") return g.favorite;
      if (view.startsWith("tag:")) {
        const id = Number(view.slice(4));
        return g.tags.some((x) => x.id === id);
      }
      return true;
    });
    const ordered = sortGames(filtered, sort);
    // 名称的天然顺序是 A–Z，其他排序的天然顺序是「多/近/新」在前
    const naturalAsc = sort === "name";
    const isAsc = dir === null ? naturalAsc : dir === "asc";
    if (isAsc !== naturalAsc) ordered.reverse();
    return ordered;
  }, [visible, platform, query, view, sort, sessions, dir]);

  const viewName = useMemo(() => {
    if (view === "all") return t("rail.allGames");
    if (view === "recent") return t("rail.recent");
    if (view === "running") return t("rail.running");
    if (view === "fav") return t("rail.favorite");
    const id = Number(view.slice(4));
    return tags.find((x) => x.id === id)?.name ?? t("rail.allGames");
  }, [view, tags]);

  // 侧栏筛选 + 来源筛选叠加时，标题要说清当前组合
  const filtered = platform !== "all" || query !== "";
  const title = query ? `搜索“${query}”` : viewName;
  const naturalAsc = sort === "name";
  const isAsc = dir === null ? naturalAsc : dir === "asc";

  const platforms: Array<{ k: "all" | "steam" | "epic" | "local"; label: string }> = [
    { k: "all", label: t("shelf.allPlatforms") },
    { k: "steam", label: "Steam" },
    { k: "epic", label: "Epic" },
    { k: "local", label: "本地" },
  ];

  const clearFilters = () => {
    setPlatform("all");
    setQuery("");
    if (view !== "all") setView("all");
  };

  const pickSort = (k: SortKey) => {
    const active = sort === k;
    useApp.getState().setSort(k);
    // 点已激活的列 = 切升降序（表头箭头跟着翻），其它列回到默认方向
    setDir(active ? (isAsc ? "desc" : "asc") : null);
  };

  const hourText = totals.hours >= 1000 ? Math.round(totals.hours) : totals.hours.toFixed(1);

  return (
    <section className="shelf">
      <div className="shelf-head">
        <div className="shelf-head-main">
          <div className="shelf-title-line">
            <span className="shelf-title">{title}</span>
            <span className="shelf-count">{list.length}</span>
            {filtered && (
              <button className="lib-clear" onClick={clearFilters}>
                {t("shelf.clearFilters")}
              </button>
            )}
          </div>
          <div className="shelf-sum">
            {totals.games} 个游戏 · {hourText} 小时 · {totals.ach} 个成就
          </div>
        </div>
        <div className="right">
          <div className="seg" role="group" aria-label="来源筛选">
            {platforms.map((p) => (
              <button
                key={p.k}
                className={`seg-item is-wide${platform === p.k ? " is-on" : ""}`}
                onClick={() => setPlatform(p.k)}
                aria-pressed={platform === p.k}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            className="sortbtn"
            aria-haspopup="menu"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setSortOpen({ x: r.right - 176, y: r.bottom + 6 });
            }}
          >
            <span className="k">{t("shelf.sort")}</span>：
            {SORT_LABEL[sort]}
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6.5l4 4 4-4" />
            </svg>
          </button>
        </div>
      </div>

      <div ref={wallRef} className={`wall ${viewMode === "grid" ? (cardSize === "large" ? "wide-view" : "grid-view") : ""}`}>
        {list.length === 0 ? (
          <div className="wall-empty">
            <div className="t">{query ? `没有找到“${query}”` : t("shelf.emptyTitle")}</div>
            <div className="h">{query ? "试试拼音首字母，或者清空搜索。" : t("shelf.emptyHint")}</div>
            <div className="acts">
              {query ? (
                <button className="chip is-on" onClick={() => setQuery("")}>
                  清空搜索
                </button>
              ) : (
                <>
                  <button className="chip is-on" onClick={() => open("scan")}>
                    扫描本机游戏库
                  </button>
                  <button className="chip" onClick={() => open("add")}>
                    {t("rail.addGame")}
                  </button>
                </>
              )}
              {filtered && !query && (
                <button className="chip" onClick={clearFilters}>
                  {t("shelf.clearFilters")}
                </button>
              )}
            </div>
          </div>
        ) : viewMode === "grid" ? (
          list.map((g) => <GameCard key={g.id} game={g} onMenu={onMenu} />)
        ) : (
          <div className="rows">
            <div className="rows-head">
              <button className="col-h main" onClick={() => pickSort("name")}>
                游戏
                {sort === "name" && <span className="dir">{isAsc ? "↑" : "↓"}</span>}
              </button>
              <span className="col-h plat-col">来源</span>
              <span className="col-h tags-col">分类</span>
              <button className="col-h hrs-col" onClick={() => pickSort("hours")}>
                时长
                {sort === "hours" && <span className="dir">{isAsc ? "↑" : "↓"}</span>}
              </button>
              <button className="col-h last-col" onClick={() => pickSort("recent")}>
                上次游玩
                {sort === "recent" && <span className="dir">{isAsc ? "↑" : "↓"}</span>}
              </button>
              <span className="col-h ach-col">成就</span>
            </div>
            {list.map((g) => (
              <GameRow key={g.id} game={g} onMenu={onMenu} />
            ))}
          </div>
        )}
      </div>

      {sortOpen && (
        <ContextMenu
          x={sortOpen.x}
          y={sortOpen.y}
          width={176}
          onClose={() => setSortOpen(null)}
          items={[
            ...SORT_ORDER.map((k) => ({
              label: SORT_LABEL[k],
              checked: sort === k,
              onSelect: () => pickSort(k),
            })),
            { separator: true },
            { label: "升序", checked: isAsc, onSelect: () => setDir("asc") },
            { label: "降序", checked: !isAsc, onSelect: () => setDir("desc") },
          ]}
        />
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => {
            setMenu(null);
            setConfirmRemove(false);
          }}
          title={menu.game.title}
          items={[
            { label: t("hero.play"), onSelect: () => void useApp.getState().launch(menu.game.id) },
            { label: t("rail.openDetail"), onSelect: () => select(menu.game.id) },
            { separator: true },
            {
              label: menu.game.favorite ? t("rail.unfavorite") : t("rail.favoriteAction"),
              onSelect: () => {
                void useApp.getState().toggleFavorite(menu.game.id);
              },
            },
            {
              label: menu.game.hidden ? t("game.showHidden") : t("game.hidden"),
              onSelect: () => {
                void (async () => {
                  await api.setHidden(menu.game.id, !menu.game.hidden);
                  await reload();
                })();
              },
            },
            { separator: true },
            {
              label: t("game.changeCover"),
              onSelect: () => {
                void (async () => {
                  const path = await api.pickImage();
                  if (!path) return;
                  await useApp.getState().setCover(menu.game.id, path);
                  toast.info(t("toast.coverSet"), menu.game.title);
                })();
              },
            },
            {
              label: menu.game.appid ? t("match.rematch") : t("match.entry"),
              onSelect: () => useUi.getState().openMatch(menu.game.id),
            },
            {
              label: t("game.openFolder"),
              disabled: !menu.game.exePath && !menu.game.workDir,
              onSelect: () => {
                void api.revealInExplorer(menu.game.exePath ?? menu.game.workDir!);
              },
            },
            { separator: true },
            {
              label: confirmRemove ? t("game.deleteConfirm") : t("game.deleteGame"),
              danger: true,
              onSelect: () => {
                if (!confirmRemove) {
                  setConfirmRemove(true);
                  return false;
                }
                const target = menu.game;
                void removeGame(target.id)
                  .then(() => toast.info(t("toast.removed"), target.title))
                  .catch((e) => toast.warn("移除失败", String(e)));
                return;
              },
            },
          ]}
        />
      )}
    </section>
  );
}
