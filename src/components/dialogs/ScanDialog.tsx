import { useEffect, useMemo, useState } from "react";
import type { ScanPick, ScanResult } from "@/types";
import { t } from "@/i18n/zh-CN";
import { Dialog } from "@/components/Dialog";
import { useApp } from "@/stores/app";
import { useUi } from "@/stores/ui";
import { toast } from "@/stores/toasts";
import { IconCheck, IconEpic, IconRefresh, IconSteam } from "@/components/Icons";

export function ScanDialog() {
  const close = useUi((s) => s.close);
  const games = useApp((s) => s.games);
  const scan = useApp((s) => s.scan);
  const importPicks = useApp((s) => s.importPicks);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const known = useMemo(() => {
    const set = new Set<string>();
    for (const g of games) {
      if (g.exePath) set.add(g.exePath.toLowerCase());
      if (g.platform === "steam" && g.appid) set.add(`steam:${g.appid}`);
    }
    return set;
  }, [games]);

  const key = (p: ScanPick) => (p.appid ? `${p.source}:${p.appid}` : p.exePath.toLowerCase());
  const isKnown = (p: ScanPick) => known.has(key(p)) || (p.exePath ? known.has(p.exePath.toLowerCase()) : false);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await scan();
      setResult(res);
      const pickable = res.picks.filter((p) => !isKnown(p));
      setSelected(new Set(pickable.map(key)));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void run();
  }, []);

  const toggle = (p: ScanPick) => {
    const k = key(p);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const doImport = async () => {
    if (!result || selected.size === 0) return;
    setImporting(true);
    try {
      const picks = result.picks.filter((p) => selected.has(key(p)));
      const n = await importPicks(picks);
      const first = picks[0];
      close();
      toast.info(t("scan.ok", { n }), first ? `《${first.title}》等 ${n} 个` : "", "扫描");
    } catch (e) {
      toast.warn("导入失败", String(e), "扫描");
    } finally {
      setImporting(false);
    }
  };

  const picks = result?.picks ?? [];
  const newCount = picks.filter((p) => !isKnown(p)).length;

  return (
    <Dialog
      title={t("scan.title")}
      subtitle={t("scan.subtitle")}
      onClose={close}
      wide
      footer={
        <>
          <button className="btn-secondary" onClick={() => void run()} disabled={loading}>
            <IconRefresh size={12} />
            {t("scan.rescan")}
          </button>
          <div className="spacer" />
          <span className="form-hint" style={{ marginTop: 0 }}>
            {loading ? t("scan.scanning") : t("scan.found", { n: newCount })}
          </span>
          <button className="btn-primary" onClick={() => void doImport()} disabled={loading || importing || newCount === 0}>
            {t("scan.import", { n: selected.size })}
          </button>
        </>
      }
    >
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 46, opacity: 1 - i * 0.16 }} />
          ))}
          <div className="form-hint" style={{ marginTop: 6 }}>
            正在解析 libraryfolders.vdf 与 Epic 的 *.item 清单…
          </div>
        </div>
      ) : error ? (
        <div className="empty-panel" style={{ marginTop: 0 }}>
          <h4>扫描失败</h4>
          <p>{error}</p>
        </div>
      ) : picks.length === 0 ? (
        <div className="empty-panel" style={{ marginTop: 0 }}>
          <h4>{t("scan.empty")}</h4>
          <p>{t("scan.emptyHint")}</p>
        </div>
      ) : (
        <>
          <div className="kv-list" style={{ marginBottom: 14 }}>
            <div className="kv">
              <IconSteam size={13} />
              <span className="k">{t("scan.steamRoot")}</span>
              <span className="v" title={result?.steamRoot ?? ""}>{result?.steamRoot ?? "未检测到 Steam"}</span>
              <span className="tag" style={{ marginLeft: 0 }}>
                {result?.steamCount ?? 0}
              </span>
            </div>
            <div className="kv">
              <IconEpic size={13} />
              <span className="k">{t("scan.epicRoot")}</span>
              <span className="v" title={result?.epicRoot ?? ""}>{result?.epicRoot ?? "未检测到 Epic"}</span>
              <span className="tag" style={{ marginLeft: 0 }}>
                {result?.epicCount ?? 0}
              </span>
            </div>
          </div>

          {result?.warnings && result.warnings.length > 0 && (
            <div
              style={{
                border: "1px solid rgba(224,100,90,.3)",
                background: "rgba(224,100,90,.07)",
                borderRadius: 8,
                padding: "9px 11px",
                marginBottom: 12,
                fontSize: 10.5,
                color: "var(--text-2)",
                lineHeight: 1.8,
              }}
            >
              {result.warnings.map((w, i) => (
                <div key={i}>· {w}</div>
              ))}
            </div>
          )}

          <div className="scan-list">
            {picks.map((p) => {
              const k = key(p);
              const knownItem = isKnown(p);
              const on = selected.has(k);
              return (
                <button
                  className="scan-row"
                  key={`${p.source}-${k}`}
                  onClick={() => !knownItem && toggle(p)}
                  disabled={knownItem}
                  style={{ opacity: knownItem ? 0.5 : 1, textAlign: "left", width: "100%" }}
                >
                  <span className={`checkbox${on || knownItem ? " is-on" : ""}${knownItem ? " is-disabled" : ""}`}>
                    <IconCheck size={10} />
                  </span>
                  <span style={{ minWidth: 0, flex: "1 1 auto" }}>
                    <span className="nm" style={{ display: "block" }}>
                      {p.title}
                    </span>
                    <span className="path" style={{ display: "block" }}>
                      {p.exePath}
                    </span>
                  </span>
                  {p.playtimeSec > 0 && (
                    <span className="tag" style={{ marginLeft: 0 }}>
                      {(p.playtimeSec / 3600).toFixed(1)}h
                    </span>
                  )}
                  <span className="tag" style={{ marginLeft: 0 }}>
                    {knownItem ? t("scan.already") : p.source === "steam" ? "Steam" : "Epic"}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Dialog>
  );
}
