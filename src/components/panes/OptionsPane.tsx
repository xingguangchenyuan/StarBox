import { useEffect, useState } from "react";
import type { Game } from "@/types";
import { useApp } from "@/stores/app";
import { toast } from "@/stores/toasts";
import { t } from "@/i18n/zh-CN";
import { baseName, fmtHours } from "@/lib/format";

export function OptionsPane({ game }: { game: Game }) {
  const updatePaths = useApp((s) => s.updatePaths);
  const updateTitles = useApp((s) => s.updateTitles);
  const removeGame = useApp((s) => s.removeGame);
  const select = useApp((s) => s.select);
  const [title, setTitle] = useState(game.title);
  const [titleZh, setTitleZh] = useState(game.titleEn ?? "");
  const [exe, setExe] = useState(game.exePath ?? "");
  const [workDir, setWorkDir] = useState(game.workDir ?? "");
  const [args, setArgs] = useState(game.args ?? "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    setTitle(game.title);
    setTitleZh(game.titleEn ?? "");
    setExe(game.exePath ?? "");
    setWorkDir(game.workDir ?? "");
    setArgs(game.args ?? "");
    setDirty(false);
    setConfirmRemove(false);
  }, [game.id, game.title, game.titleEn, game.exePath, game.workDir, game.args]);

  const save = async () => {
    if (!title.trim()) {
      setTitle(game.title);
      return;
    }
    setSaving(true);
    try {
      await updateTitles(game.id, title.trim(), titleZh.trim() || null);
      await updatePaths(game.id, exe.trim(), workDir.trim(), args.trim());
      setDirty(false);
      toast.info(t("game.nameSaved"), baseName(exe) || game.title);
    } catch (e) {
      toast.warn("保存失败", String(e), "启动选项");
    } finally {
      setSaving(false);
    }
  };

  const onRemove = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      window.setTimeout(() => setConfirmRemove(false), 3000);
      return;
    }
    try {
      await removeGame(game.id);
      select(null);
      toast.info(t("toast.removed"), game.title);
    } catch (e) {
      toast.warn("移除失败", String(e));
    }
  };

  const saveDirGuess = `%APPDATA%\\${(game.titleEn || game.title).replace(/[^\w\s-]/g, "").replace(/\s+/g, "") || "Game"}`;

  return (
    <div className="opts">
      <div>
        <div className="opt-row">
          <span className="ok">{t("game.titleOriginal")}</span>
          <input
            className="field"
            value={title}
            spellCheck={false}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            placeholder="Lantern Hollow"
          />
        </div>
        <div className="opt-row">
          <span className="ok">{t("game.titleZh")}</span>
          <input
            className="field"
            value={titleZh}
            spellCheck={false}
            onChange={(e) => {
              setTitleZh(e.target.value);
              setDirty(true);
            }}
            placeholder={t("game.titleZhPlaceholder")}
          />
        </div>
        <div className="opt-row">
          <span className="ok">{t("opt.exe")}</span>
          <input
            className="field"
            value={exe}
            spellCheck={false}
            onChange={(e) => {
              setExe(e.target.value);
              setDirty(true);
            }}
            placeholder="D:\\Games\\Game\\Game.exe"
          />
        </div>
        <div className="opt-row">
          <span className="ok">{t("opt.workDir")}</span>
          <input
            className="field"
            value={workDir}
            spellCheck={false}
            onChange={(e) => {
              setWorkDir(e.target.value);
              setDirty(true);
            }}
            placeholder="D:\\Games\\Game"
          />
        </div>
        <div className="opt-row">
          <span className="ok">{t("opt.args")}</span>
          <input
            className="field"
            value={args}
            spellCheck={false}
            onChange={(e) => {
              setArgs(e.target.value);
              setDirty(true);
            }}
            placeholder={t("opt.argsPlaceholder")}
          />
        </div>
        <div className="opt-row">
          <span className="ok">{t("opt.saveDir")}</span>
          <span className="field dim">{saveDirGuess}</span>
        </div>

        <div className="opt-row">
          <span className="ok">{t("opt.admin")}</span>
          <span className="opt-hint">{t("opt.adminHint")}</span>
          <button className="switch" disabled aria-label={t("opt.admin")} />
        </div>
        <div className="opt-row">
          <span className="ok">{t("opt.cleanup")}</span>
          <span className="opt-hint">{t("opt.cleanupHint")}</span>
          <button className="switch is-on" disabled aria-label={t("opt.cleanup")} />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
          <button className="btn-primary" onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? "保存中…" : t("opt.save")}
          </button>
          {dirty && (
            <button
              className="btn-secondary"
              onClick={() => {
                setTitle(game.title);
                setTitleZh(game.titleEn ?? "");
                setExe(game.exePath ?? "");
                setWorkDir(game.workDir ?? "");
                setArgs(game.args ?? "");
                setDirty(false);
              }}
            >
              {t("common.cancel")}
            </button>
          )}
          <span className="opt-hint" style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10 }}>
            累计 {fmtHours(game.playtimeSec)}
          </span>
        </div>

        <div className="opt-danger">
          <div className="tx">
            <b>{t("game.removeGame")}</b>
            <span>{t("game.removeHint")}</span>
          </div>
          <button className={`btn-danger${confirmRemove ? " is-confirm" : ""}`} onClick={() => void onRemove()}>
            {confirmRemove ? t("game.removeConfirm") : t("game.removeGame")}
          </button>
        </div>
      </div>

      <aside className="side">
        <div className="sec-title">
          {t("opt.profiles")}
          <span className="mono2">1 套</span>
        </div>
        <div className="profiles">
          <div className="prof is-on">
            {t("opt.default")}
            <span className="pm">{t("opt.noArgs")}</span>
          </div>
          <div className="prof is-disabled">
            {t("opt.clean")}
            <span className="pm">{t("common.v2")}</span>
          </div>
        </div>
        <div className="opt-hint" style={{ marginTop: 12 }}>
          {t("opt.profilesHint")}配置档在第二版提供——首版只有「默认」一套路径与参数。
        </div>
      </aside>
    </div>
  );
}
