import { useMemo } from "react";
import { useApp } from "@/stores/app";
import { toast } from "@/stores/toasts";
import { t } from "@/i18n/zh-CN";
import { achPercent, fmtDuration, relDay } from "@/lib/format";
import { IconChevronRight, IconPlay, IconScan, IconPlus } from "@/components/Icons";
import { useUi } from "@/stores/ui";
import { useClock } from "@/stores/clock";
import { bannerUrl } from "@/components/art";

export function LibraryHero() {
  const games = useApp((s) => s.games);
  const sessions = useApp((s) => s.sessions);
  const launch = useApp((s) => s.launch);
  const select = useApp((s) => s.select);
  const open = useUi((s) => s.open);
  const showHidden = useApp((s) => s.settings?.showHidden ?? false);
  // 订阅每秒的时钟，否则「已游玩 6 秒」会停在挂载那一刻
  const now = useClock((s) => s.now);

  const visible = useMemo(() => games.filter((g) => !g.hidden || showHidden), [games, showHidden]);

  const feature = useMemo(() => {
    if (!visible.length) return null;
    const running = visible.filter((g) => g.running || sessions[g.id]);
    if (running.length) {
      return running.sort((a, b) => {
        const at = new Date(sessions[a.id]?.startedAt ?? 0).getTime();
        const bt = new Date(sessions[b.id]?.startedAt ?? 0).getTime();
        return at - bt;
      })[0];
    }
    const played = visible
      .filter((g) => g.lastPlayedAt)
      .sort((a, b) => new Date(b.lastPlayedAt ?? 0).getTime() - new Date(a.lastPlayedAt ?? 0).getTime());
    if (played.length) return played[0];
    return visible.slice().sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())[0];
  }, [visible, sessions]);

  if (!feature) {
    return (
      <section className="hero is-empty">
        <div className="hero-art">
          <div className="fill" />
          <div className="shapes" />
          <div className="scrim" />
        </div>
        <div className="hero-body">
          <div className="eyebrow">
            <span className="dot is-idle" />
            星匣 · 你的本机游戏库
          </div>
          <h1 className="hero-title">
            还没有游戏<small>ADD YOUR FIRST ONE</small>
          </h1>
          <div className="hero-meta">
            <span>扫描本机已装的 Steam / Epic 库，或者直接挑一个 exe、拖一个文件夹进来。</span>
          </div>
          <div className="hero-actions">
            <button className="btn-play" onClick={() => open("scan")}>
              <IconScan size={15} />
              扫描本机游戏库
            </button>
            <button className="btn-ghost" onClick={() => open("add")}>
              <IconPlus size={14} />
              手动添加
            </button>
          </div>
        </div>
      </section>
    );
  }

  const running = feature.running || !!sessions[feature.id];
  const sessionSec = sessions[feature.id]
    ? Math.max(0, Math.floor((now - new Date(sessions[feature.id].startedAt).getTime()) / 1000))
    : 0;
  const cover = bannerUrl(feature);
  const pct = achPercent(feature);
  const primary = feature.titleEn || feature.title;
  const secondary = feature.titleEn ? feature.title : null;

  const eyebrow = running ? (
    <>
      <span className="dot" />
      {t("hero.running", { time: fmtDuration(sessionSec) })}
    </>
  ) : feature.lastPlayedAt ? (
    <>
      <span className="dot is-idle" />
      {t("hero.resume", { when: relDay(feature.lastPlayedAt) })}
    </>
  ) : (
    <>
      <span className="dot is-idle" />
      {t("hero.firstRun")}
    </>
  );

  const onPlay = async () => {
    const res = await launch(feature.id);
    if (!res.ok) {
      toast.warn(`《${feature.title}》无法启动`, res.error);
      return;
    }
    if (running) {
      toast.info(
        `《${feature.title}》`,
        res.focused ? "游戏窗口已置于最前" : "游戏正在运行，但没找到可切回的窗口",
        res.focused ? "已切回" : "运行中",
      );
      return;
    }
    toast.info(`《${feature.title}》`, "正在启动…", "启动中");
  };

  return (
    <section className={`hero${cover ? " has-art" : ""}`}>
      <div className="hero-art" style={{ ["--a" as string]: feature.tintA }}>
        {cover ? (
          <div className="art-img" style={{ backgroundImage: `url("${cover}")` }} />
        ) : (
          <div className="fill" />
        )}
        <div className="tint" />
        <div className="shapes" />
        <div className="scrim" />
      </div>

      <div className="hero-body">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="hero-title">
          {primary}
          {secondary && <small>{secondary}</small>}
        </h1>
        <div className="hero-meta">
          {feature.studio && <span>{feature.studio}</span>}
          {feature.releaseDate && (
            <>
              {feature.studio && <span className="sep" />}
              <span>{feature.releaseDate.slice(0, 4)}</span>
            </>
          )}
          {feature.tags.map((tg) => (
            <span
              className="tag-chip"
              key={tg.id}
              style={{ color: tg.color, background: `${tg.color}1f`, borderColor: `${tg.color}55` }}
            >
              {tg.name}
            </span>
          ))}
          <span className="sep" />
          <span className="tm">
            总时长 {feature.playtimeSec > 0 ? `${(feature.playtimeSec / 3600).toFixed(1)} 小时` : "尚未游玩"}
          </span>
        </div>

        {feature.achTotal > 0 && (
          <button className="hero-ach" onClick={() => select(feature.id, "ach")} title={t("hero.achievements", { a: feature.achUnlocked, b: feature.achTotal })}>
            <span className="bar">
              <i style={{ width: `${pct}%` }} />
            </span>
            <b>{feature.achUnlocked}</b>
            <span className="of">/ {feature.achTotal} 成就</span>
          </button>
        )}

        <div className="hero-actions">
          <button className="btn-play" onClick={onPlay}>
            <IconPlay size={15} />
            {running ? t("hero.runningAction") : t("hero.play")}
          </button>
          <button className="btn-ghost" onClick={() => select(feature.id)}>
            {t("hero.viewDetail")}
            <IconChevronRight size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}
