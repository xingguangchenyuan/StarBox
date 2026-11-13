import { useEffect, useMemo, useState } from "react";
import type { Achievement, Game } from "@/types";
import { useApp } from "@/stores/app";
import { useUi } from "@/stores/ui";
import { toast } from "@/stores/toasts";
import { t } from "@/i18n/zh-CN";
import { achPercent, fmtDateTime } from "@/lib/format";
import { IconAch, IconDownload, IconKey, IconStar } from "@/components/Icons";
import { assetUrl } from "@/lib/api";

type Filter = "all" | "on" | "off" | "hide";

function AchGlyph({ a }: { a: Achievement }) {
  const src = assetUrl(a.iconUrl);
  return (
    <div className="ach-ico" style={{ ["--a" as string]: a.tintA, ["--b" as string]: a.tintB }}>
      {src ? (
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

export function AchievementsPane({ game }: { game: Game }) {
  const achievements = useApp((s) => s.achievements[game.id]);
  const loadAchievements = useApp((s) => s.loadAchievements);
  const unlock = useApp((s) => s.unlockAchievement);
  const refreshAchievements = useApp((s) => s.refreshAchievements);
  const syncAchievements = useApp((s) => s.syncAchievements);
  const settings = useApp((s) => s.settings);
  const open = useUi((s) => s.open);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setFilter("all");
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

  const list = useMemo(() => {
    if (filter === "on") return all.filter((a) => a.unlocked);
    if (filter === "off") return all.filter((a) => !a.unlocked);
    if (filter === "hide") return all.filter((a) => a.hidden);
    return all;
  }, [all, filter]);

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

  const chips: Array<{ k: Filter; label: string }> = [
    { k: "all", label: t("ach.all", { n: counts.all }) },
    { k: "on", label: t("ach.unlocked", { n: counts.on }) },
    { k: "off", label: t("ach.locked", { n: counts.off }) },
    { k: "hide", label: t("ach.hidden", { n: counts.hide }) },
  ];

  return (
    <>
      <div className="ach-head">
        <div className="ring-lg" style={{ ["--p" as string]: pct }}>
          <i>{pct}%</i>
        </div>
        <div>
          <div className="big">
            {game.achUnlocked}
            <span> / {game.achTotal}</span>
            {game.achTotal > 0 && game.achUnlocked === game.achTotal && (
              <span style={{ color: "var(--gold)", fontSize: 11, marginLeft: 8 }}>全成就</span>
            )}
          </div>
          <div className="sm">
            已解锁 · {counts.hide} 个隐藏成就
          </div>
        </div>
        <div className={`src${game.achSource === "none" ? " is-off" : ""}`}>
          <i />
          {sourceLabel}
        </div>
      </div>

      <div className="chips-bar">
        <div className="chip-line">
          {chips.map((c) => (
            <button key={c.k} className={`chip${filter === c.k ? " is-on" : ""}`} onClick={() => setFilter(c.k)}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="spacer" />
        {game.appid && (
          <button className="chip mono-chip" onClick={() => void sync()} disabled={syncing}>
            <IconDownload size={11} />
            {syncing ? "同步中…" : "同步成就"}
          </button>
        )}
        {game.platform === "steam" && game.appid && (
          <button className="chip mono-chip" onClick={fetchDefs} disabled={loading}>
            {settings?.hasApiKey ? <IconDownload size={11} /> : <IconKey size={11} />}
            {loading ? "拉取中…" : all.length ? "重新拉取定义" : t("ach.fetchSteam")}
          </button>
        )}
      </div>

      {all.length === 0 ? (
        <div className="empty-panel">
          <h4>{t("ach.emptyTitle", { n: game.achTotal || 0 })}</h4>
          <p>
            {game.platform === "steam"
              ? t("ach.emptySteam")
              : t("ach.emptyLocal")}
          </p>
          <div className="actions">
            {game.platform === "steam" && game.appid ? (
              <button className="chip is-on" onClick={fetchDefs}>
                {t("ach.fetchSteam")}
              </button>
            ) : (
              <>
                <span className="chip" style={{ opacity: 0.55 }}>
                  {t("ach.fetchLocal")} · 需要 AppID
                </span>
                <span className="chip" style={{ opacity: 0.55 }}>
                  {t("ach.manual")} · 第二版
                </span>
              </>
            )}
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
            return (
              <div className={`ach${a.unlocked ? "" : " is-locked"}`} key={a.id}>
                <AchGlyph a={a} />
                <div className="ach-body">
                  <div className="ach-name">{masked ? "隐藏成就" : a.name}</div>
                  <div className="ach-desc">{masked ? t("ach.hiddenDesc") : a.description || "—"}</div>
                </div>
                <div className="ach-right">
                  {a.globalPercent !== null && (
                    <div className="rar">
                      {a.globalPercent.toFixed(1)}%
                      <div className="bar">
                        <i style={{ width: `${a.globalPercent}%` }} />
                      </div>
                    </div>
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

      {all.length > 0 && game.achSource !== "manual" && (
        <div className="opt-hint" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 7 }}>
          <IconStar size={12} />
          手动标记的成就会写入本地库，来源标为「手动补录」，不影响游戏本身的存档。
        </div>
      )}
    </>
  );
}
