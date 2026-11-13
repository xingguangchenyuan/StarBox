import { useEffect, useMemo, useState } from "react";
import type { Game } from "@/types";
import { useApp } from "@/stores/app";
import { toast } from "@/stores/toasts";
import { t } from "@/i18n/zh-CN";
import { PLATFORM_SOURCE, achPercent, fmtDate, fmtHours, relDay } from "@/lib/format";
import { IconAch, IconChevronRight, IconDownload, IconImage } from "@/components/Icons";
import { api, assetUrl } from "@/lib/api";
import { patternFor } from "@/components/Icons";
import { useUi } from "@/stores/ui";
import { Lightbox } from "@/components/Lightbox";

export function OverviewPane({ game }: { game: Game }) {
  const tags = useApp((s) => s.tags);
  const achievements = useApp((s) => s.achievements[game.id]);
  const loadAchievements = useApp((s) => s.loadAchievements);
  const toggleTag = useApp((s) => s.toggleTag);
  const setTab = useApp((s) => s.setTab);
  const setCover = useApp((s) => s.setCover);
  const openDialog = useUi((s) => s.open);
  const openMatch = useUi((s) => s.openMatch);
  const [fetching, setFetching] = useState(false);
  const [showOriginal, setShowOriginal] = useState(true);
  const [shotIndex, setShotIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!achievements && game.achTotal > 0) void loadAchievements(game.id);
  }, [game.id, game.achTotal, achievements, loadAchievements]);

  const pct = achPercent(game);
  const paragraphs = useMemo(() => (game.description ?? "").split(/\n{2,}/).filter(Boolean), [game.description]);
  const originalParagraphs = useMemo(
    () => (game.descriptionOriginal ?? "").split(/\n{2,}/).filter(Boolean),
    [game.descriptionOriginal],
  );
  const recent = useMemo(
    () =>
      (achievements ?? [])
        .filter((a) => a.unlocked)
        .sort((a, b) => new Date(b.unlockedAt ?? 0).getTime() - new Date(a.unlockedAt ?? 0).getTime())
        .slice(0, 3),
    [achievements],
  );

  const srcText =
    game.platform === "steam" ? "STEAM · appdetails" : game.platform === "epic" ? "EPIC · 本地清单" : "本地 · 手动添加";

  const fetchInfo = async () => {
    setFetching(true);
    const res = await useApp.getState().refreshSteam(game.id);
    setFetching(false);
    if (!res.ok) toast.warn("资料抓取失败", res.message, "Steam");
    else toast.info(t("game.infoFetched"), res.message ?? game.title, "Steam");
  };

  const changeCover = async () => {
    const path = await api.pickImage();
    if (!path) return;
    await setCover(game.id, path);
    toast.info(t("toast.coverSet"), game.title);
  };

  const openShot = async (url: string) => {
    if (/^https?:/.test(url)) {
      await api.openPath(url);
    }
  };

  return (
    <div className="body-grid">
      <div>
        <div className="sec">
          <div className="sec-title">
            {t("game.about")}
            <span className="mono2">{srcText}</span>
            {game.platform === "steam" && game.appid && (
              <button
                className="chip"
                style={{ marginLeft: "auto", height: 22, fontSize: 10.5 }}
                onClick={fetchInfo}
                disabled={fetching}
              >
                <IconDownload size={11} />
                {fetching ? t("game.refreshing") : t("game.storeInfo")}
              </button>
            )}
          </div>
          {paragraphs.length > 0 ? (
            paragraphs.map((p, i) => (
              <p className="desc" key={i}>
                {p}
              </p>
            ))
          ) : originalParagraphs.length === 0 ? (
            <p className="desc" style={{ color: "var(--text-3)" }}>
              {t("game.noInfo")}
              {game.platform === "steam" && game.appid ? "点右上角「抓取资料」从 Steam 商店拉取简介与截图。" : ""}
            </p>
          ) : null}

          {originalParagraphs.length > 0 && (
            <div className="desc-orig">
              <div className="desc-orig-head">
                <span className="lbl">{t("game.originalDesc")}</span>
                <span className="note">{t("game.originalDescNote")}</span>
                <button className="chip" style={{ marginLeft: "auto", height: 21, fontSize: 10 }} onClick={() => setShowOriginal((v) => !v)}>
                  {showOriginal ? t("game.collapseOriginal") : t("game.expandOriginal")}
                </button>
              </div>
              {showOriginal &&
                originalParagraphs.map((p, i) => (
                  <p className="desc is-orig" key={i}>
                    {p}
                  </p>
                ))}
            </div>
          )}
        </div>

        <div className="sec">
          <div className="sec-title">
            {t("game.screenshots")}
            <span className="mono2">{game.screenshots.length ? `${game.screenshots.length} 张` : "抓取资料后显示"}</span>
          </div>
          <div className="shots">
            {(game.screenshots.length ? game.screenshots.slice(0, 3) : [null, null, null]).map((s, i) => {
              const url = s ? assetUrl(s) : null;
              return (
                <div
                  className={`shot${url ? " has-art" : ""}${url ? " is-zoomable" : ""}`}
                  key={i}
                  style={{
                    ["--a" as string]: game.tintA,
                    ["--b" as string]: game.tintB,
                    ...(url ? { backgroundImage: `url("${url}")` } : {}),
                  }}
                  onClick={() => {
                    if (!s) return;
                    if (game.screenshots.length) setShotIndex(i);
                    else void openShot(s);
                  }}
                  title={url ? "点击查看大图" : undefined}
                >
                  <span className="lbl">0{i + 1}</span>
                </div>
              );
            })}
          </div>
          {game.screenshots.length > 3 && (
            <button className="chip" style={{ marginTop: 8, height: 22, fontSize: 10.5 }} onClick={() => setShotIndex(3)}>
              查看全部 {game.screenshots.length} 张截图
            </button>
          )}
        </div>

        <div className="sec">
          <div className="sec-title">
            {t("game.recentUnlocks")}
            <span className="mono2">{recent.length} 个</span>
          </div>
          <div className="recent">
            {recent.length === 0 ? (
              <div className="rc" style={{ flex: "1 1 auto", color: "var(--text-3)", fontSize: 11.5, lineHeight: 1.75, padding: 12 }}>
                {t("game.noUnlocks")}
              </div>
            ) : (
              recent.map((a) => (
                <div className="rc" key={a.id}>
                  <div
                    className="ico"
                    style={
                      assetUrl(a.iconUrl)
                        ? { backgroundImage: `url("${assetUrl(a.iconUrl)}")` }
                        : { ["--a" as string]: a.tintA, ["--b" as string]: a.tintB }
                    }
                  >
                    {!assetUrl(a.iconUrl) && <IconAch index={patternFor(a.apiName) % 13} size={14} />}
                  </div>
                  <div className="tx">
                    <div className="n">{a.name}</div>
                    <div className="d">
                      {a.globalPercent !== null ? `${a.globalPercent.toFixed(1)}% · ` : ""}
                      {a.unlockedAt ? fmtDate(a.unlockedAt) : ""}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <aside className="side">
        <div className="panel">
          <div className="row">
            <span className="k">{t("game.source")}</span>
            <span className="v hi">{PLATFORM_SOURCE[game.platform]}</span>
          </div>
          <div className="row">
            <span className="k">{t("game.appid")}</span>
            <span className="v">{game.appid ?? "—"}</span>
          </div>
          <div className="row col">
            <span className="k">{t("game.installPath")}</span>
            <span className="v" title={game.workDir ?? game.exePath ?? ""} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {game.workDir ?? game.exePath ?? "—"}
            </span>
          </div>
          <div className="row">
            <span className="k">{t("game.totalPlaytime")}</span>
            <span className="v">{fmtHours(game.playtimeSec)}</span>
          </div>
          <div className="row">
            <span className="k">{t("game.lastPlayed")}</span>
            <span className="v">{relDay(game.lastPlayedAt)}</span>
          </div>
          <div className="row">
            <span className="k">{t("game.addedAt")}</span>
            <span className="v">{fmtDate(game.addedAt)}</span>
          </div>
          {game.publishers.length > 0 && (
            <div className="row">
              <span className="k">发行商</span>
              <span className="v" title={game.publishers.join(" / ")}>{game.publishers.join(" / ")}</span>
            </div>
          )}
          {(game.reviewTotal ?? 0) > 0 && (
            <div className="row">
              <span className="k">Steam 评测</span>
              <span className="v">
                {game.reviewTotal! >= 10000 ? `${(game.reviewTotal! / 10000).toFixed(1)} 万条` : `${game.reviewTotal} 条`}
              </span>
            </div>
          )}
          {game.metacritic !== null && (
            <div className="row">
              <span className="k">Metacritic</span>
              <span className="v">{game.metacritic}</span>
            </div>
          )}
        </div>

        {(game.genres.length > 0 || game.categories.length > 0) && (
          <div className="panel" style={{ marginTop: 12 }}>
            <div className="row" style={{ borderBottom: 0, paddingBottom: 2 }}>
              <span className="k">Steam 分类</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "4px 0 10px" }}>
              {[...game.genres, ...game.categories].slice(0, 10).map((name) => (
                <span className="chip is-static" key={name}>
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="panel" style={{ marginTop: 12 }}>
          <div className="row" style={{ borderBottom: 0, paddingBottom: 2 }}>
            <span className="k">Steam 资料</span>
            <button
              className="chip"
              style={{ marginLeft: "auto", height: 20, fontSize: 10, padding: "0 7px" }}
              onClick={() => openMatch(game.id)}
              title={game.appid ? t("match.rematch") : t("match.entry")}
            >
              {game.appid ? t("match.rematch") : t("match.entry")}
            </button>
          </div>
          <div className="form-hint" style={{ marginTop: 2, marginBottom: 6 }}>
            {game.appid
              ? `已绑定 AppID ${game.appid}。匹配不对可以换一个；换了之后成就、简介、截图都会重新拉取。`
              : "本地游戏没有 AppID：按名字在 Steam 商店里搜一次，绑定后就能拿到简介、截图和成就定义（不需要 Steam ID）。"}
          </div>
        </div>

        <div className="panel" style={{ marginTop: 12 }}>
          <div className="row" style={{ borderBottom: 0, paddingBottom: 2 }}>
            <span className="k">{t("game.tags")}</span>
            <button
              className="chip"
              style={{ marginLeft: "auto", height: 20, fontSize: 10, padding: "0 7px" }}
              onClick={() => openDialog("settings")}
            >
              {t("game.manageTags")}
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "4px 0 10px" }}>
            {tags.map((tg) => {
              const on = game.tags.some((x) => x.id === tg.id);
              return (
                <button
                  key={tg.id}
                  className={`chip${on ? " is-on" : ""}`}
                  style={{ height: 22, fontSize: 10.5, ...(on ? { borderColor: `${tg.color}66`, color: tg.color, background: `${tg.color}1a` } : {}) }}
                  onClick={() => void toggleTag(game.id, tg.id)}
                >
                  {tg.name}
                </button>
              );
            })}
          </div>
        </div>

        <button className="achbar" onClick={() => setTab("ach")}>
          <div className="ring" style={{ ["--p" as string]: pct }}>
            <i>{pct}%</i>
          </div>
          <div>
            <div className="t1">{t("game.progress")}</div>
            <div className="t2">{t("game.unlockedOf", { a: game.achUnlocked, b: game.achTotal })}</div>
          </div>
          <div className="go">
            <IconChevronRight size={14} />
          </div>
        </button>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="chip" onClick={changeCover} style={{ flex: 1, justifyContent: "center" }}>
            <IconImage size={12} />
            {t("game.changeCover")}
          </button>
          <button
            className="chip"
            onClick={() => (game.workDir ? void api.revealInExplorer(game.exePath ?? game.workDir) : undefined)}
            style={{ flex: 1, justifyContent: "center" }}
          >
            {t("game.openFolder")}
          </button>
        </div>

      </aside>

      {shotIndex !== null && game.screenshots.length > 0 && (
        <Lightbox
          shots={game.screenshots}
          index={Math.min(shotIndex, game.screenshots.length - 1)}
          onClose={() => setShotIndex(null)}
          onIndex={setShotIndex}
        />
      )}
    </div>
  );
}
