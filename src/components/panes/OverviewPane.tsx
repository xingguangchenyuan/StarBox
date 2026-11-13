import { useEffect, useMemo, useState } from "react";
import type { Game } from "@/types";
import { useApp } from "@/stores/app";
import { toast } from "@/stores/toasts";
import { t } from "@/i18n/zh-CN";
import { PLATFORM_SOURCE, fmtDate, fmtDateTime, fmtHours, relDay } from "@/lib/format";
import { IconAch, IconCopy, IconDownload, IconFolder, IconImage, IconStar } from "@/components/Icons";
import { api, assetUrl } from "@/lib/api";
import { patternFor } from "@/components/Icons";
import { useUi } from "@/stores/ui";
import { Lightbox } from "@/components/Lightbox";

/** 长路径从中间省略，保留盘符和末级目录 */
function midEllipsis(path: string, max = 48): string {
  if (path.length <= max) return path;
  const head = path.slice(0, 14);
  const tail = path.slice(path.length - (max - 15));
  return `${head}…${tail}`;
}

export function OverviewPane({ game }: { game: Game }) {
  const tags = useApp((s) => s.tags);
  const achievements = useApp((s) => s.achievements[game.id]);
  const loadAchievements = useApp((s) => s.loadAchievements);
  const toggleTag = useApp((s) => s.toggleTag);
  const setCover = useApp((s) => s.setCover);
  const openDialog = useUi((s) => s.open);
  const openMatch = useUi((s) => s.openMatch);
  const [fetching, setFetching] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [shotIndex, setShotIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!achievements && game.achTotal > 0) void loadAchievements(game.id);
  }, [game.id, game.achTotal, achievements, loadAchievements]);

  const paragraphs = useMemo(() => (game.description ?? "").split(/\n{2,}/).filter(Boolean), [game.description]);
  const originalParagraphs = useMemo(
    () => (game.descriptionOriginal ?? "").split(/\n{2,}/).filter(Boolean),
    [game.descriptionOriginal],
  );
  const hasOriginal = originalParagraphs.length > 0 && game.descriptionOriginal !== game.description;
  const recent = useMemo(
    () =>
      (achievements ?? [])
        .filter((a) => a.unlocked)
        .sort((a, b) => new Date(b.unlockedAt ?? 0).getTime() - new Date(a.unlockedAt ?? 0).getTime())
        .slice(0, 3),
    [achievements],
  );

  const installPath = game.workDir ?? game.exePath ?? "";

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

  const copyPath = async () => {
    if (!installPath) return;
    try {
      await navigator.clipboard.writeText(installPath);
      toast.info("路径已复制", installPath, "本地");
    } catch {
      toast.warn("复制失败", "可以手动选中路径", "本地");
    }
  };

  return (
    <div className="body-grid">
      <div className="ov-main">
        <div className="sec">
          <div className="sec-title">
            {t("game.about")}
            <span className="mono2">{PLATFORM_SOURCE[game.platform]}</span>
            {game.platform === "steam" && game.appid && (
              <button className="ghost-mini" onClick={fetchInfo} disabled={fetching} title="从 Steam 商店重新抓取简介与截图">
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
            <p className="desc is-empty">
              {t("game.noInfo")}
              {game.platform === "steam" && game.appid ? "点右上角「抓取资料」从 Steam 商店拉取简介与截图。" : ""}
            </p>
          ) : null}

          {hasOriginal && (
            <div className="desc-orig">
              <button className="orig-toggle" onClick={() => setShowOriginal((v) => !v)}>
                {showOriginal ? "收起英文原文" : "显示英文原文"}
                <span className={`caret${showOriginal ? " is-open" : ""}`}>▾</span>
              </button>
              {showOriginal && (
                <div className="orig-body">
                  {originalParagraphs.map((p, i) => (
                    <p className="desc is-orig" key={i}>
                      {p}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {game.screenshots.length > 0 && (
          <div className="sec">
            <div className="sec-title">
              {t("game.screenshots")}
              <span className="mono2">{game.screenshots.length} 张</span>
            </div>
            <div className="shots">
              {game.screenshots.slice(0, 3).map((s, i) => {
                const url = assetUrl(s);
                return (
                  <button
                    className="shot is-zoomable"
                    key={i}
                    style={url ? { backgroundImage: `url("${url}")` } : undefined}
                    onClick={() => setShotIndex(i)}
                    title="点击查看大图"
                  >
                    <span className="zoom">
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <circle cx="7" cy="7" r="4.4" />
                        <path d="M10.4 10.4L14 14M7 5.2v3.6M5.2 7h3.6" />
                      </svg>
                    </span>
                  </button>
                );
              })}
            </div>
            {game.screenshots.length > 3 && (
              <button className="ghost-mini" style={{ marginTop: 8 }} onClick={() => setShotIndex(3)}>
                查看全部 {game.screenshots.length} 张截图
              </button>
            )}
          </div>
        )}

        {recent.length > 0 && (
          <div className="sec">
            <div className="sec-title">
              {t("game.recentUnlocks")}
              <span className="mono2">{recent.length} 个</span>
            </div>
            <div className="recent">
              {recent.map((a) => (
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
                    <div className="d">{fmtDateTime(a.unlockedAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <aside className="side">
        <div className="info-card">
          <div className="info-card-title">游戏信息</div>
          <div className="kv-line">
            <span className="k">{t("game.source")}</span>
            <span className="v hi">{PLATFORM_SOURCE[game.platform]}</span>
          </div>
          <div className="kv-line">
            <span className="k">开发商</span>
            <span className="v">{game.studio ?? "—"}</span>
          </div>
          {game.publishers.length > 0 && (
            <div className="kv-line">
              <span className="k">发行商</span>
              <span className="v" title={game.publishers.join(" / ")}>
                {game.publishers.join(" / ")}
              </span>
            </div>
          )}
          <div className="kv-line">
            <span className="k">发行日期</span>
            <span className="v">{game.releaseDate ?? "—"}</span>
          </div>
          {(game.reviewTotal ?? 0) > 0 && (
            <div className="kv-line">
              <span className="k">Steam 评测</span>
              <span className="v">
                {game.reviewTotal! >= 10000 ? `${(game.reviewTotal! / 10000).toFixed(1)} 万条` : `${game.reviewTotal} 条`}
              </span>
            </div>
          )}
          {game.metacritic !== null && (
            <div className="kv-line">
              <span className="k">Metacritic</span>
              <span className="v">{game.metacritic}</span>
            </div>
          )}
        </div>

        <div className="info-card">
          <div className="info-card-title">
            本地信息
            <button className="ghost-mini" onClick={() => openMatch(game.id)}>
              {game.appid ? "更换匹配" : "匹配 Steam"}
            </button>
          </div>
          <div className="kv-line col">
            <span className="k">{t("game.installPath")}</span>
            <span className="path-row">
              <span className="v path" title={installPath || "—"} style={{ direction: "ltr" }}>
                {installPath ? midEllipsis(installPath) : "—"}
              </span>
              <button className="mini-icon" title="复制路径" aria-label="复制路径" onClick={() => void copyPath()} disabled={!installPath}>
                <IconCopy size={12} />
              </button>
              <button
                className="mini-icon"
                title={t("game.openFolder")}
                aria-label={t("game.openFolder")}
                disabled={!installPath}
                onClick={() => installPath && void api.revealInExplorer(game.exePath ?? installPath)}
              >
                <IconFolder size={12} />
              </button>
            </span>
          </div>
          <div className="kv-line">
            <span className="k">{t("game.totalPlaytime")}</span>
            <span className="v mono">{fmtHours(game.playtimeSec)}</span>
          </div>
          <div className="kv-line">
            <span className="k">{t("game.lastPlayed")}</span>
            <span className="v">{relDay(game.lastPlayedAt)}</span>
          </div>
          <div className="kv-line">
            <span className="k">{t("game.addedAt")}</span>
            <span className="v">{fmtDate(game.addedAt)}</span>
          </div>
          <div className="kv-line">
            <span className="k">{t("game.appid")}</span>
            <span className="v mono">{game.appid ?? "—"}</span>
          </div>
        </div>

        {(game.genres.length > 0 || game.categories.length > 0) && (
          <div className="info-card">
            <div className="info-card-title">Steam 分类</div>
            <div className="chip-wrap">
              {[...game.genres, ...game.categories].slice(0, 12).map((name) => (
                <span className="chip is-static" key={name}>
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="info-card">
          <div className="info-card-title">
            {t("game.tags")}
            <button className="ghost-mini" onClick={() => openDialog("settings")}>
              {t("game.manageTags")}
            </button>
          </div>
          <div className="chip-wrap">
            {tags.length === 0 && <span className="muted-note">还没有分类标签。</span>}
            {tags.map((tg) => {
              const on = game.tags.some((x) => x.id === tg.id);
              return (
                <button
                  key={tg.id}
                  className={`chip${on ? " is-on" : ""}`}
                  style={on ? { borderColor: `${tg.color}66`, color: tg.color, background: `${tg.color}1a` } : undefined}
                  onClick={() => void toggleTag(game.id, tg.id)}
                >
                  {tg.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="side-actions">
          <button className="btn-secondary" onClick={() => void changeCover()}>
            <IconImage size={12} />
            {t("game.changeCover")}
          </button>
          <button className="btn-secondary" onClick={() => void copyPath()} disabled={!installPath}>
            <IconStar size={12} />
            复制安装路径
          </button>
        </div>

        {game.appid && (
          <div className="fetch-status">
            <span className="dot" />
            {game.description ? "商店资料已缓存 · 断网可看" : "尚未抓取商店资料"}
          </div>
        )}
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
