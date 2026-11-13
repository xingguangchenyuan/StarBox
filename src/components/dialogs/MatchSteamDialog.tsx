import { useEffect, useRef, useState } from "react";
import type { Game, SteamSearchItem } from "@/types";
import { t } from "@/i18n/zh-CN";
import { Dialog } from "@/components/Dialog";
import { api } from "@/lib/api";
import { useApp } from "@/stores/app";
import { useUi } from "@/stores/ui";
import { toast } from "@/stores/toasts";
import { IconSearch, IconSteam } from "@/components/Icons";

/** 本地游戏没有 AppID 时，按名字搜 Steam 商店手动绑定。 */
export function MatchSteamDialog({ game }: { game: Game }) {
  const close = useUi((s) => s.close);
  const matchSteam = useApp((s) => s.matchSteam);
  const [query, setQuery] = useState(game.title);
  const [items, setItems] = useState<SteamSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [binding, setBinding] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = async (term: string) => {
    const q = term.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const list = await api.searchSteam(q);
      setItems(list);
      if (list.length === 0) setError(t("match.none"));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  // 开屏直接按「游戏名 + 目录名 + exe 信息」搜一遍，用户不用自己猜关键词
  const runForGame = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.searchSteamForGame(game.id);
      setItems(list);
      if (list.length === 0) {
        const fallback = await api.searchSteam(game.title);
        setItems(fallback);
        if (fallback.length === 0) setError(t("match.none"));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    inputRef.current?.focus();
    void runForGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bind = async (item: SteamSearchItem) => {
    setBinding(item.appid);
    try {
      await matchSteam(game.id, item.appid);
      close();
      toast.info(t("match.done"), `${game.title} → ${item.name}`, "Steam");
    } catch (e) {
      toast.warn(t("match.failed"), String(e), "Steam");
    } finally {
      setBinding(null);
    }
  };

  return (
    <Dialog
      title={t("match.title")}
      subtitle={t("match.subtitle")}
      onClose={close}
      wide
      footer={
        <>
          <span className="form-hint" style={{ marginTop: 0 }}>
            {t("match.hint")}
          </span>
          <div className="spacer" />
          <button className="btn-secondary" onClick={close}>
            {t("common.close")}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div className="search" style={{ flex: "1 1 auto" }}>
          <IconSearch />
          <input
            ref={inputRef}
            value={query}
            spellCheck={false}
            placeholder={t("match.placeholder")}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void run(query);
            }}
          />
        </div>
        <button className="btn-primary" onClick={() => void run(query)} disabled={loading}>
          {loading ? t("match.searching") : t("common.search")}
        </button>
      </div>

      {error && !loading && (
        <div className="form-hint" style={{ color: "var(--warn)" }}>
          {error}
        </div>
      )}

      <div className="match-list">
        {items.map((it) => (
          <button
            className="match-row"
            key={it.appid}
            disabled={binding !== null}
            onClick={() => void bind(it)}
          >
            <span className="mi">
              {it.tinyImage ? <img src={it.tinyImage} alt="" loading="lazy" /> : <IconSteam size={16} />}
            </span>
            <span className="mt">
              <span className="nm">
                {it.name}
                {it.score !== null && it.score >= 95 && (
                  <span className="tag" style={{ marginLeft: 6, padding: "0 5px", height: 15, lineHeight: "15px" }}>
                    {t("match.likely")}
                  </span>
                )}
              </span>
              <span className="id">
                {it.nameEn && it.nameEn !== it.name ? `${it.nameEn} · ` : ""}AppID {it.appid}
                {it.price ? ` · ${it.price}` : ""}
                {it.score !== null ? ` · ${t("match.similar", { n: it.score })}` : ""}
              </span>
            </span>
            <span className="go">{binding === it.appid ? t("match.binding") : t("match.bind")}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
