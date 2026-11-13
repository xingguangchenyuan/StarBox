import { useMemo } from "react";
import { useApp } from "@/stores/app";
import { toast } from "@/stores/toasts";
import { t } from "@/i18n/zh-CN";
import { fmtDuration, relDay } from "@/lib/format";
import { IconPlay, IconScan, IconPlus, IconStar } from "@/components/Icons";
import { useUi } from "@/stores/ui";
import { bannerUrl } from "@/components/art";

export function LibraryHero() {
  const games = useApp((s) => s.games);
  const tags = useApp((s) => s.tags);
  const sessions = useApp((s) => s.sessions);
  const launch = useApp((s) => s.launch);
  const select = useApp((s) => s.select);
  const open = useUi((s) => s.open);

  const showHidden = useApp((s) => s.settings?.showHidden ?? false);
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

  const totals = useMemo(() => {
    const hours = visible.reduce((s, g) => s + g.playtimeSec, 0) / 3600;
    const ach = visible.reduce((s, g) => s + g.achUnlocked, 0);
    return { games: visible.length, hours, ach };
  }, [visible]);

  if (!feature) {
    return (
      <section className="hero">
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
    ? Math.max(0, Math.floor((Date.now() - new Date(sessions[feature.id].startedAt).getTime()) / 1000))
    : 0;
  const cover = bannerUrl(feature);

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
    <section className="hero">
      <div className="hero-art" style={{ ["--a" as string]: feature.tintA }}>
        {cover && (
          <div
            className="fill"
            style={{
              backgroundImage: `url("${cover}")`,
              backgroundSize: "cover",
              backgroundPosition: "center 30%",
              opacity: 0.55,
            }}
          />
        )}
        <div className="fill" style={cover ? { opacity: 0.6 } : undefined} />
        <div className="tint" />
        <div className="shapes" />
        <div className="scrim" />
      </div>

      <div className="hero-body">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="hero-title">
          {feature.title}
          {feature.titleEn && <small>{feature.titleEn}</small>}
        </h1>
        <div className="hero-meta">
          {feature.studio && <span>{feature.studio}</span>}
          {feature.releaseDate && (
            <>
              <span className="sep" />
              <span>{feature.releaseDate.slice(0, 4)}</span>
            </>
          )}
          {feature.tags.length > 0 && (
            <>
              <span className="sep" />
              <span>{feature.tags.map((x) => x.name).join(" · ")}</span>
            </>
          )}
          {(feature.studio || feature.releaseDate || feature.tags.length > 0) && <span className="sep" />}
          <span className="mono">总时长 {feature.playtimeSec > 0 ? `${(feature.playtimeSec / 3600).toFixed(1)} 小时` : "尚未游玩"}</span>
        </div>
        <div className="hero-actions">
          <button className="btn-play" onClick={onPlay}>
            <IconPlay size={15} />
            {running ? t("hero.runningAction") : t("hero.play")}
          </button>
          <button
            className="btn-ghost"
            onClick={() => select(feature.id, feature.achTotal > 0 ? "ach" : "overview")}
          >
            <IconStar size={14} />
            {t("hero.achievements", { a: feature.achUnlocked, b: feature.achTotal })}
          </button>
        </div>
        <div className="stats">
          <div className="stat">
            <b>{totals.games}</b>
            <span>{t("hero.games")}</span>
          </div>
          <div className="stat-div" />
          <div className="stat">
            <b>{totals.hours.toFixed(1)}</b>
            <span>{t("hero.hours")}</span>
          </div>
          <div className="stat-div" />
          <div className="stat">
            <b>{totals.ach}</b>
            <span>{t("hero.achievementsUnit")}</span>
          </div>
          <div className="stat-div" />
          <div className="stat">
            <b>{tags.length}</b>
            <span>{t("hero.tags")}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
