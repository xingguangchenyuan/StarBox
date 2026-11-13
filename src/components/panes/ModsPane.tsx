import { useEffect, useState } from "react";
import type { Game, ModEntry } from "@/types";
import { useApp } from "@/stores/app";
import { toast } from "@/stores/toasts";
import { t } from "@/i18n/zh-CN";
import { fmtBytes } from "@/lib/format";
import { IconFolder, IconRefresh } from "@/components/Icons";
import { api } from "@/lib/api";

export function ModsPane({ game }: { game: Game }) {
  const [mods, setMods] = useState<ModEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const reload = useApp((s) => s.reload);

  const dir = game.modsDir ?? (game.workDir ? `${game.workDir}\\mods` : null);

  const load = async (scan: boolean) => {
    setLoading(true);
    try {
      const list = scan ? await api.scanMods(game.id) : await api.listMods(game.id);
      setMods(list);
      if (scan) await reload();
    } catch (e) {
      toast.warn("MOD 读取失败", String(e), "MOD");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(false);
  }, [game.id]);

  const chooseDir = async () => {
    const picked = await api.pickFolder("选择 MOD 根目录");
    if (!picked) return;
    await api.setModsDir(game.id, picked);
    await reload();
    await load(true);
    toast.info("MOD 目录已设置", picked, "MOD");
  };

  const toggle = async (m: ModEntry) => {
    const enabled = !m.enabled;
    setMods((list) => list.map((x) => (x.id === m.id ? { ...x, enabled } : x)));
    try {
      await api.setModEnabled(m.id, enabled);
      toast.info(enabled ? t("mod.enabled") : t("mod.disabled"), m.name, "MOD");
    } catch (e) {
      setMods((list) => list.map((x) => (x.id === m.id ? { ...x, enabled: m.enabled } : x)));
      toast.warn("MOD 切换失败", String(e), "MOD");
    }
  };

  return (
    <>
      <div className="mod-head">
        <span className="path" title={dir ?? ""}>
          {dir ?? "— 未指定目录"}
        </span>
        <div className="spacer" />
        {mods.length > 0 && (
          <span className="mod-count">
            已启用 {mods.filter((m) => m.enabled).length} / {mods.length}
          </span>
        )}
        <button className="ghost-mini" onClick={chooseDir}>
          <IconFolder size={11} />
          {mods.length ? "更换目录" : t("mod.choose")}
        </button>
        <button className="btn-secondary sm" onClick={() => void load(true)} disabled={loading}>
          <IconRefresh size={11} />
          {loading ? "扫描中…" : t("mod.rescan")}
        </button>
        {dir && (
          <button className="icon-btn sm" title={t("mod.open")} aria-label={t("mod.open")} onClick={() => void api.revealInExplorer(dir)}>
            <IconFolder size={13} />
          </button>
        )}
      </div>

      {mods.length > 0 ? (
        <div className="mods">
          {mods.map((m) => (
            <div className={`mod${m.enabled ? "" : " is-off"}`} key={m.id}>
              <button
                className={`switch${m.enabled ? " is-on" : ""}`}
                onClick={() => void toggle(m)}
                role="switch"
                aria-checked={m.enabled}
                aria-label={`${m.enabled ? "禁用" : "启用"} ${m.name}`}
              />
              <div className="mb" onClick={() => void toggle(m)} style={{ cursor: "pointer" }}>
                <div className="mn">{m.name}</div>
                <div className="mv">{m.version ?? m.dirName}</div>
              </div>
              <span className="sz">{fmtBytes(m.sizeBytes)}</span>
            </div>
          ))}
          <div className="opt-hint" style={{ marginTop: 12 }}>
            {t("mod.orderHint")}。禁用会把目录移进 <span className="mono">_disabled</span>，不会删除任何文件。
          </div>
        </div>
      ) : (
        <div className="empty-panel">
          <h4>{t("mod.none")}</h4>
          <p>{t("mod.noneHint")}</p>
          <div className="actions">
            <button className="chip is-on" onClick={chooseDir}>
              {t("mod.choose")}
            </button>
            {dir && (
              <button className="chip" onClick={() => void load(true)}>
                {t("mod.rescan")}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
