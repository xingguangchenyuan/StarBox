import { useEffect, useMemo, useState } from "react";
import type { Achievement, Game } from "@/types";
import { useApp } from "@/stores/app";
import { useUi } from "@/stores/ui";
import { toast } from "@/stores/toasts";
import { t } from "@/i18n/zh-CN";
import { achPercent, fmtDateTime, relDay } from "@/lib/format";
import { IconAch, IconDownload, IconKey, IconLock, IconStar } from "@/components/Icons";
import { assetUrl } from "@/lib/api";
import { ContextMenu } from "@/components/ContextMenu";

type Filter = "all" | "on" | "off" | "hide";
type Sort = "default" | "rarity" | "time";

function AchGlyph({ a, masked }: { a: Achievement; masked: boolean }) {
  const src = assetUrl(a.iconUrl);
  return (
    <div className="ach-ico" style={{ ["--a" as string]: a.tintA, ["--b" as string]: a.tintB }}>
      {masked ? (
        <IconLock size={18} />
      ) : src ? (
        <img
          src={src}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <IconAch index={a.id} />
      )}
    </div>
  );
}

/** 全球解锁率 → 稀有度分级（方案 3.2） */
function rarity(p: number | null): { key: string; label: string } | null {
  if (p === null) return null;
  if (p < 2) return { key: "mythic", label: "极稀有" };
  if (p < 10) return { key: "rare", label: "稀有" };
  if (p < 50) return { key: "uncommon", label: "少见" };
  return { key: "common", label: "常见" };
}

export function AchievementsPane({ game }: { game: Game }) {
  const achievements = useApp((s) => s.achievements[game.id]);
  const loadAchievements = useApp((s) => s.loadAchievements);
  const unlock = useApp((s) => s.unlockAchievement);
  const refreshAchievements = useApp((s) => s.refreshAchievements);
  const syncAchievements = useApp((s) => s.syncAchievements);
  const settings = useApp((s) => s.settings);
  const open = useUi((s) => s.open);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("default");
  const [sortOpen, setSortOpen] = useState<{ x: number; y: number } | null>(null);
  const [moreOpen, setMoreOpen] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setFilter("all");
    setSort("default");
    void loadAchievements(game.id).catch(() => undefined);
  }, [game.id, loadAchievements]);

  const all = achievements ?? [];
  const pct = achPercent(game);
  const counts = useMemo(
    () => ({
      all: all.length,
      on: all.filter((a) => a.unlocked).length,
      off: all.filter((a) => !a.unlocked).length,
      hide: all.filter((a) => a.hidden).length,
    }),
    [all],
  );

  const lastUnlock = useMemo(() => {
    const times = all.filter((a) => a.unlocked && a.unlockedAt).map((a) => new Date(a.unlockedAt!).getTime());
    return times.length ? new Date(Math.max(...times)).toISOString() : null;
  }, [all]);

  const list = useMemo(() => {
    let out = all;
    if (filter === "on") out = out.filter((a) => a.unlocked);
    if (filter === "off") out = out.filter((a) => !a.unlocked);
    if (filter === "hide") out = out.filter((a) => a.hidden);
    if (sort === "rarity") {
      out = out.slice().sort((a, b) => (a.globalPercent ?? 101) - (b.globalPercent ?? 101));
    } else if (sort === "time") {
      out = out.slice().sort((a, b) => {
        const at = a.unlockedAt ? new Date(a.unlockedAt).getTime() : 0;
        const bt = b.unlockedAt ? new Date(b.unlockedAt).getTime() : 0;
        return bt - at;
      });
    }
    return out;
  }, [all, filter, sort]);

  const sourceLabel =
    game.achSource === "steam"
      ? t("ach.sourceSteam")
      : game.achSource === "local"
        ? t("ach.sourceLocal")
        : game.achSource === "manual"
          ? t("ach.sourceManual")
          : t("ach.sourceNone");

  const fetchDefs = async () => {
    if (!settings?.hasApiKey) {
      toast.warn(t("ach.needKey"), "设置 → Steam Web API Key", "缺少 API Key");
      open("settings");
      return;
    }
    setLoading(true);
    try {
      const n = await refreshAchievements(game.id);
      toast.info(t("ach.fetched", { n }), game.title, "Steam");
    } catch (e) {
      toast.warn("成就定义拉取失败", String(e), "Steam");
    } finally {
      setLoading(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await syncAchievements(game.id, "auto");
      toast.info(
        res.message ?? `已同步 ${res.unlocked}/${res.total}`,
        game.title,
        res.source === "steam" ? "Steam" : "本地成就",
      );
    } catch (e) {
      toast.warn("成就同步失败", String(e), "成就");
    } finally {
      setSyncing(false);
    }
  };

  const filters: Array<{ k: Filter; label: string; n: number }> = [
    { k: "all", label: "全部", n: counts.all },
    { k: "on", label: "已解锁", n: counts.on },
    { k: "off", label: "未解锁", n: counts.off },
    { k: "hide", label: "隐藏", n: counts.hide },
  ];

  const SORT_LABEL: Record<Sort, string> = { default: "默认顺序", rarity: "按稀有度", time: "按解锁时间" };

  return (
    <>
      <div className="ach-head">
        <div className="ring-lg" style={{ ["--p" as string]: pct }}>
          <i>{pct}%</i>
        </div>
        <div className="ach-head-tx">
          <div className="big">
            {game.achUnlocked}
            <span> / {game.achTotal} 已解锁</span>
            {game.achTotal > 0 && game.achUnlocked === game.achTotal && (
              <span className="perfect">全成就</span>
            )}
          </div>
          <div className="sm">
            {counts.hide > 0 ? `${counts.hide} 个隐藏成就` : "没有隐藏成就"}
            {lastUnlock && ` · 最近解锁 ${relDay(lastUnlock)}`}
          </div>
        </div>
        <div className={`src${game.achSource === "none" ? " is-off" : ""}`} title={lastUnlock ? `最近一次解锁：${fmtDateTime(lastUnlock)}` : "尚无解锁记录"}>
          <i />
          {sourceLabel}
        </div>
      </div>

      <div className="chips-bar">
        <div className="seg" role="group" aria-label="成就筛选">
          {filters.map((c) => (
            <button
              key={c.k}
              className={`seg-item is-wide${filter === c.k ? " is-on" : ""}`}
              onClick={() => setFilter(c.k)}
              aria-pressed={filter === c.k}
            >
              {c.label}
              <span className="n">{c.n}</span>
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button
          className="ghost-mini sort-trigger"
          aria-haspopup="menu"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setSortOpen({ x: r.right - 176, y: r.bottom + 6 });
          }}
        >
          {SORT_LABEL[sort]}
          <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6.5l4 4 4-4" />
          </svg>
        </button>
        {game.appid && (
          <button className="btn-secondary sm" onClick={() => void sync()} disabled={syncing}>
            <IconDownload size={11} />
            {syncing ? "同步中…" : "同步成就"}
          </button>
        )}
        <button
          className="icon-btn sm"
          title="更多"
          aria-label="更多成就操作"
          aria-haspopup="menu"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMoreOpen({ x: r.right - 200, y: r.bottom + 6 });
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <circle cx="3.2" cy="8" r="1.3" />
            <circle cx="8" cy="8" r="1.3" />
            <circle cx="12.8" cy="8" r="1.3" />
          </svg>
        </button>
      </div>

      {all.length === 0 ? (
        <div className="empty-panel ach-empty">
          <div className="empty-art">
            <IconAch size={30} index={3} />
          </div>
          <h4>{game.achTotal > 0 ? `已知 ${game.achTotal} 个成就，定义还没缓存` : "还没有成就数据"}</h4>
          <p>
            {game.platform === "steam"
              ? t("ach.emptySteam")
              : t("ach.emptyLocal")}
          </p>
          <div className="actions">
            {game.platform === "steam" && game.appid ? (
              <button className="btn-primary" onClick={() => void fetchDefs()}>
                <IconDownload size={12} />
                {t("ach.fetchSteam")}
              </button>
            ) : (
              <button className="btn-secondary" onClick={() => open("settings")}>
                <IconKey size={12} />
                去设置填写 Steam Key
              </button>
            )}
            <button className="btn-secondary" onClick={() => open("settings")}>
              了解本地成就文件
            </button>
          </div>
        </div>
      ) : list.length === 0 ? (
        <div className="empty-panel">
          <h4>这个筛选下没有成就</h4>
          <p>换一个筛选，或者点「全部」。</p>
        </div>
      ) : (
        <div className="ach-grid">
          {list.map((a) => {
            const masked = a.hidden && !a.unlocked;
            const r = masked ? null : rarity(a.globalPercent);
            return (
              <div className={`ach${a.unlocked ? "" : " is-locked"}${masked ? " is-masked" : ""}`} key={a.id}>
                <AchGlyph a={a} masked={masked} />
                <div className="ach-body">
                  <div className="ach-name">{masked ? "隐藏成就" : a.name}</div>
                  <div className="ach-desc">{masked ? "解锁后可见" : a.description || "—"}</div>
                </div>
                <div className="ach-right">
                  {r ? (
                    <span
                      className={`rar-badge is-${r.key}`}
                      title={`全球 ${a.globalPercent!.toFixed(1)}% 的玩家解锁了此成就`}
                    >
                      {r.label} · {a.globalPercent!.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="rar-badge is-none">全球数据缺失</span>
                  )}
                  <div className="when">
                    {a.unlocked ? (a.unlockedAt ? fmtDateTime(a.unlockedAt) : "已解锁") : t("ach.lockedLabel")}
                  </div>
                  <button
                    className="ach-lock-btn"
                    onClick={() => void unlock(game.id, a.id, !a.unlocked)}
                    title={a.unlocked ? "撤销这个成就" : "标记为已达成"}
                  >
                    {a.unlocked ? t("ach.lockAgain") : t("ach.unlockManual")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {all.length > 0 && (
        <div className="opt-hint ach-foot">
          <IconStar size={12} />
          手动标记的成就会写入本地库，来源标为「手动补录」，不影响游戏本身的存档。
        </div>
      )}

      {sortOpen && (
        <ContextMenu
          x={sortOpen.x}
          y={sortOpen.y}
          width={176}
          onClose={() => setSortOpen(null)}
          title="排序"
          items={[
            { label: SORT_LABEL.default, checked: sort === "default", onSelect: () => setSort("default") },
            { label: SORT_LABEL.rarity, checked: sort === "rarity", onSelect: () => setSort("rarity") },
            { label: SORT_LABEL.time, checked: sort === "time", onSelect: () => setSort("time") },
          ]}
        />
      )}

      {moreOpen && (
        <ContextMenu
          x={moreOpen.x}
          y={moreOpen.y}
          width={200}
          onClose={() => setMoreOpen(null)}
          items={[
            {
              label: loading ? "拉取中…" : "重新拉取定义",
              disabled: loading || !game.appid,
              onSelect: () => void fetchDefs(),
            },
            {
              label: "查看 Steam 成就页",
              disabled: !game.appid,
              onSelect: () => void (game.appid && window.open(`https://steamcommunity.com/stats/${game.appid}/achievements`)),
            },
            { separator: true },
            { label: "成就来源说明", onSelect: () => open("settings") },
          ]}
        />
      )}
    </>
  );
}
