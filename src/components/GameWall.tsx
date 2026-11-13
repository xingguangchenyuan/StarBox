import { useMemo, useState } from "react";
import type { Game } from "@/types";
import { useApp } from "@/stores/app";
import { useUi } from "@/stores/ui";
import { toast } from "@/stores/toasts";
import { t } from "@/i18n/zh-CN";
import {
  PLATFORM_SHORT,
  SORT_LABEL,
  achPercent,
  fmtHoursShort,
  isRecent,
  relDay,
  sortGames,
} from "@/lib/format";
import { IconStarFilled, IconPlus } from "@/components/Icons";
import { CoverBackdrop, coverUrl } from "@/components/art";
import { matchQuery } from "@/lib/search";
import { api } from "@/lib/api";
import { ContextMenu } from "@/components/ContextMenu";

type MenuHandler = (e: React.MouseEvent, game: Game) => void;

function GameCard({ game, onMenu }: { game: Game; onMenu: MenuHandler }) {
  const select = useApp((s) => s.select);
  const pct = achPercent(game);
  return (
    <button
      className={`card${game.hidden ? " is-hidden" : ""}`}
      onClick={() => select(game.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e, game);
      }}
      title={`${game.title}${game.titleEn ? ` · ${game.titleEn}` : ""}${game.studio ? ` · ${game.studio}` : ""}`}
    >
      <div className={`cover${game.running ? " is-running" : ""}`}>
        <CoverBackdrop game={game} />
        {game.running && (
          <div className="running">
            <i />
            运行中
          </div>
        )}
        {game.favorite && !game.running && (
          <span className="fav-mark">
            <IconStarFilled size={11} />
          </span>
        )}
        <div className="titles">
          <div className="t-en">{game.titleEn || game.title}</div>
          {game.titleEn && <div className="t-cn">{game.title}</div>}
        </div>
        {game.achTotal > 0 && (
          <div className="prog" title={`成就 ${game.achUnlocked} / ${game.achTotal}`}>
            <i style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="card-meta">
        <span className="plat">{PLATFORM_SHORT[game.platform]}</span>
        <span>{fmtHoursShort(game.playtimeSec)}</span>
        {game.achTotal > 0 && (
          <span className={`meta-ach${game.achUnlocked === game.achTotal ? " is-full" : ""}`}>
            {game.achUnlocked}/{game.achTotal}
          </span>
        )}
      </div>
    </button>
  );
}

function GameRow({ game, onMenu }: { game: Game; onMenu: MenuHandler }) {
  const select = useApp((s) => s.select);
  return (
    <button
      className="row-item"
      onClick={() => select(game.id)}
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
          {game.title}
          {game.titleEn && <em>{game.titleEn}</em>}
          {game.running && <span className="run" style={{ width: 5, height: 5, borderRadius: 9, background: "var(--ok)" }} />}
        </span>
        <span className="sub">
          <span className="plat" style={{ fontSize: 9, border: "1px solid var(--line-soft)", borderRadius: 3, padding: "0 3px" }}>
            {PLATFORM_SHORT[game.platform]}
          </span>
          {game.studio ?? "—"}
          {game.tags.length > 0 && <span>· {game.tags.map((x) => x.name).join(" / ")}</span>}
        </span>
      </span>
      <span className="col" style={{ width: 74 }}>
        <span className="k">时长</span>
        {fmtHoursShort(game.playtimeSec)}
      </span>
      <span className="col" style={{ width: 96 }}>
        <span className="k">上次游玩</span>
        {game.lastPlayedAt ? relDay(game.lastPlayedAt) : "—"}
      </span>
      <span className="col" style={{ width: 62 }}>
        <span className="k">成就</span>
        {game.achTotal > 0 ? `${game.achUnlocked}/${game.achTotal}` : "—"}
      </span>
    </button>
  );
}

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
  const cycleSort = useApp((s) => s.cycleSort);
  const setView = useApp((s) => s.setView);
  const select = useApp((s) => s.select);
  const removeGame = useApp((s) => s.removeGame);
  const reload = useApp((s) => s.reload);
  const open = useUi((s) => s.open);
  const [menu, setMenu] = useState<{ x: number; y: number; game: Game } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const onMenu: MenuHandler = (e, game) => {
    setConfirmRemove(false);
    setMenu({ x: e.clientX, y: e.clientY, game });
  };

  const list = useMemo(() => {
    const filtered = games.filter((g) => {
      if (g.hidden && !showHidden) return false;
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
    return sortGames(filtered, sort);
  }, [games, platform, query, view, sort, sessions, showHidden]);

  const title = useMemo(() => {
    if (view === "all") return t("rail.allGames");
    if (view === "recent") return t("rail.recent");
    if (view === "running") return t("rail.running");
    if (view === "fav") return t("rail.favorite");
    const id = Number(view.slice(4));
    return tags.find((x) => x.id === id)?.name ?? t("rail.allGames");
  }, [view, tags]);

  const platforms: Array<{ k: "all" | "steam" | "epic" | "local"; label: string }> = [
    { k: "all", label: t("shelf.allPlatforms") },
    { k: "steam", label: "Steam" },
    { k: "epic", label: "Epic" },
    { k: "local", label: "本地" },
  ];

  return (
    <section className="shelf">
      <div className="shelf-head">
        <span className="shelf-title">{title}</span>
        <span className="shelf-count">{list.length}</span>
        <div className="right">
          <div className="chip-line">
            {platforms.map((p) => (
              <button
                key={p.k}
                className={`chip${platform === p.k ? " is-on" : ""}`}
                onClick={() => setPlatform(p.k)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button className="sortbtn" onClick={cycleSort} title="切换排序">
            {SORT_LABEL[sort]}
          </button>
        </div>
      </div>

      <div className={`wall ${viewMode === "grid" ? (cardSize === "large" ? "wide-view" : "grid-view") : ""}`}>
        {list.length === 0 ? (
          <div style={{ padding: "40px 2px" }}>
            <div style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 6 }}>{t("shelf.emptyTitle")}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.9, marginBottom: 16 }}>
              {t("shelf.emptyHint")}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="chip is-on" onClick={() => open("scan")}>
                扫描本机游戏库
              </button>
              <button className="chip" onClick={() => setView("all")}>
                {t("rail.all")}
              </button>
              <button className="chip" onClick={() => open("add")}>
                <IconPlus size={11} />
                {t("rail.addGame")}
              </button>
            </div>
          </div>
        ) : viewMode === "grid" ? (
          list.map((g) => <GameCard key={g.id} game={g} onMenu={onMenu} />)
        ) : (
          <div className="rows">
            {list.map((g) => (
              <GameRow key={g.id} game={g} onMenu={onMenu} />
            ))}
          </div>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => {
            setMenu(null);
            setConfirmRemove(false);
          }}
          items={[
            { label: t("rail.openDetail"), onSelect: () => select(menu.game.id) },
            {
              label: t("game.openFolder"),
              disabled: !menu.game.exePath && !menu.game.workDir,
              onSelect: () => {
                void api.revealInExplorer(menu.game.exePath ?? menu.game.workDir!);
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
