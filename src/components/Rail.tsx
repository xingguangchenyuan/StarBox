import { useMemo, useState } from "react";
import type { Game, ViewKey } from "@/types";
import { useApp } from "@/stores/app";
import { useUi } from "@/stores/ui";
import { toast } from "@/stores/toasts";
import { t } from "@/i18n/zh-CN";
import { isRecent, fmtHoursShort } from "@/lib/format";
import { IconClock, IconGrid, IconPlay, IconPlus, IconSettings, IconStarFilled, IconStar } from "@/components/Icons";
import { ThumbArt } from "@/components/art";
import { matchQuery } from "@/lib/search";
import { api } from "@/lib/api";
import { ContextMenu } from "@/components/ContextMenu";

export function Rail() {
  const games = useApp((s) => s.games);
  const tags = useApp((s) => s.tags);
  const query = useApp((s) => s.query);
  const view = useApp((s) => s.view);
  const selectedId = useApp((s) => s.selectedId);
  const sessions = useApp((s) => s.sessions);
  const setView = useApp((s) => s.setView);
  const select = useApp((s) => s.select);
  const setQuery = useApp((s) => s.setQuery);
  const reload = useApp((s) => s.reload);
  const toggleFavorite = useApp((s) => s.toggleFavorite);
  const removeGame = useApp((s) => s.removeGame);
  const open = useUi((s) => s.open);
  const [menu, setMenu] = useState<{ x: number; y: number; game: Game } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const showHidden = useApp((s) => s.settings?.showHidden ?? false);
  const visible = useMemo(() => games.filter((g) => !g.hidden || showHidden), [games, showHidden]);

  const counts = useMemo(() => {
    const running = visible.filter((g) => g.running || sessions[g.id]).length;
    return {
      all: visible.length,
      recent: visible.filter((g) => isRecent(g)).length,
      running,
      fav: visible.filter((g) => g.favorite).length,
      tags: Object.fromEntries(tags.map((tg) => [tg.id, visible.filter((g) => g.tags.some((x) => x.id === tg.id)).length])),
    };
  }, [visible, tags, sessions]);

  const filtered = useMemo(() => visible.filter((g) => matchQuery(g, query)), [visible, query]);

  const navItem = (key: ViewKey, icon: React.ReactNode, label: string, n: number, hot = false) => {
    const on = view === key && !selectedId;
    return (
      <button
        key={key}
        className={`f-item${on ? " is-on" : ""}${hot ? " is-hot" : ""}`}
        onClick={() => {
          setQuery("");
          setView(key);
        }}
        aria-current={on ? "page" : undefined}
      >
        {icon}
        <span className="lbl">{label}</span>
        <span className={`n${n === 0 ? " is-zero" : ""}`}>{n}</span>
      </button>
    );
  };

  return (
    <aside className="rail">
      <div className="brand">
        <svg className="brand-mark" viewBox="0 0 24 24" fill="none">
          <rect x="2.5" y="2.5" width="19" height="19" rx="4.5" stroke="#66c0f4" strokeWidth="1.6" />
          <path
            d="M12 6.4l1.62 3.62 3.94.44-2.92 2.68.79 3.88L12 15.1l-3.43 1.92.79-3.88-2.92-2.68 3.94-.44z"
            fill="#66c0f4"
          />
        </svg>
        <span className="brand-name">
          {t("app.name")}
          <em>{t("app.latin")}</em>
        </span>
      </div>

      <nav className="filters" aria-label="游戏库筛选">
        {navItem("all", <IconGrid className="ico" />, t("rail.all"), counts.all)}
        {navItem("recent", <IconClock className="ico" />, t("rail.recent"), counts.recent)}
        {navItem("running", <IconPlay className="ico" strokeWidth={1.4} />, t("rail.running"), counts.running, true)}
        {navItem("fav", <IconStar className="ico" />, t("rail.favorite"), counts.fav)}
        {tags.map((tg, i) => (
          <button
            key={tg.id}
            className={`f-item${view === `tag:${tg.id}` && !selectedId ? " is-on" : ""}`}
            style={i === 0 ? { marginTop: 6 } : undefined}
            onClick={() => {
              setQuery("");
              setView(`tag:${tg.id}`);
            }}
          >
            <span className="tag-dot" style={{ background: tg.color }} />
            <span className="lbl">{tg.name}</span>
            <span className={`n${counts.tags[tg.id] === 0 ? " is-zero" : ""}`}>{counts.tags[tg.id] ?? 0}</span>
          </button>
        ))}
      </nav>

      <div className="f-sep" />

      <div className="lib-head">
        <span className="t">{query ? t("rail.searchResult") : t("rail.allGames")}</span>
        {query ? (
          <button className="lib-clear" onClick={() => setQuery("")} title="清除搜索">
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
            清除搜索
          </button>
        ) : (
          <span className="c">{filtered.length}</span>
        )}
      </div>

      <div className="games" role="listbox" aria-label={t("rail.allGames")}>
        {filtered.length === 0 && (
          <div className="lib-empty">
            <b>{t("rail.emptyTitle")}</b>
            {t("rail.emptyHint")}
          </div>
        )}
        {filtered.map((g) => {
          const on = selectedId === g.id;
          const running = g.running || !!sessions[g.id];
          const menuOn = menu?.game.id === g.id;
          return (
            <div
              key={g.id}
              className={`g${on ? " is-on" : ""}${g.hidden ? " is-hidden" : ""}${menuOn ? " is-menu" : ""}`}
              onClick={() => select(g.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setConfirmRemove(false);
                setMenu({ x: e.clientX, y: e.clientY, game: g });
              }}
              role="option"
              aria-selected={on}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  select(g.id);
                }
              }}
              title={`${g.title}${g.titleEn ? ` · ${g.titleEn}` : ""}${g.studio ? ` · ${g.studio}` : ""}`}
            >
              <ThumbArt game={g} className="gt" />
              <span className="gx">
                <span className="gn">
                  <span className="orig">{g.title}</span>
                  {g.titleEn && <span className="zh">{g.titleEn}</span>}
                </span>
                <span className="gs">{fmtHoursShort(g.playtimeSec)}</span>
              </span>
              {running ? (
                <span className="run" title="运行中" />
              ) : g.favorite ? (
                <IconStarFilled className="fav" size={10} />
              ) : null}
              <button
                className="g-more"
                title={t("rail.more")}
                aria-label={`${g.title} ${t("rail.more")}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setConfirmRemove(false);
                  setMenu({ x: r.right - 8, y: r.bottom + 4, game: g });
                }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                  <circle cx="3.2" cy="8" r="1.3" />
                  <circle cx="8" cy="8" r="1.3" />
                  <circle cx="12.8" cy="8" r="1.3" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      <div className="rail-foot">
        <button className="foot-btn" onClick={() => open("add")}>
          <IconPlus className="ico" />
          {t("rail.addGame")}
        </button>
        <button className="foot-btn push" onClick={() => open("settings")}>
          <IconSettings className="ico" />
          {t("rail.settings")}
        </button>
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
              label: menu.game.favorite ? t("rail.unfavorite") : t("rail.favoriteAction"),
              onSelect: () => {
                void toggleFavorite(menu.game.id);
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
    </aside>
  );
}
