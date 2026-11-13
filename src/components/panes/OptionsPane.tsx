import { useEffect, useState } from "react";
import type { Game } from "@/types";
import { useApp } from "@/stores/app";
import { toast } from "@/stores/toasts";
import { t } from "@/i18n/zh-CN";
import { baseName } from "@/lib/format";
import { IconCopy, IconFolder, IconPlay } from "@/components/Icons";
import { api } from "@/lib/api";

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

  const reset = () => {
    setTitle(game.title);
    setTitleZh(game.titleEn ?? "");
    setExe(game.exePath ?? "");
    setWorkDir(game.workDir ?? "");
    setArgs(game.args ?? "");
    setDirty(false);
  };

  const onRemove = async () => {
    try {
      await removeGame(game.id);
      select(null);
      toast.info(t("toast.removed"), game.title);
    } catch (e) {
      toast.warn("移除失败", String(e));
    }
  };

  const mark = () => setDirty(true);

  const exeBad = exe.trim() !== "" && !/\.(exe|bat|cmd|lnk)$/i.test(exe.trim());

  const saveDirGuess = `%APPDATA%\\${(game.titleEn || game.title).replace(/[^\w\s-]/g, "").replace(/\s+/g, "") || "Game"}`;

  return (
    <div className="opts">
      <div>
        <div className="opt-group">
          <div className="opt-group-title">名称</div>
          <div className="opt-row">
            <span className="ok">显示名称</span>
            <div className="field-wrap">
              <input
                className="field"
                value={titleZh}
                spellCheck={false}
                onChange={(e) => {
                  setTitleZh(e.target.value);
                  mark();
                }}
                placeholder={t("game.titleZhPlaceholder")}
              />
            </div>
          </div>
          <div className="opt-row">
            <span className="ok">英文名 / 原名</span>
            <div className="field-wrap">
              <input
                className="field"
                value={title}
                spellCheck={false}
                onChange={(e) => {
                  setTitle(e.target.value);
                  mark();
                }}
                placeholder="Lantern Hollow"
              />
            </div>
          </div>
          <div className="opt-hint">侧栏和封面底栏优先显示「显示名称」；没有中文名时会回退到原名。</div>
        </div>

        <div className="opt-group">
          <div className="opt-group-title">启动</div>
          <div className="opt-row">
            <span className="ok">{t("opt.exe")}</span>
            <div className="field-wrap">
              <input
                className={`field${exeBad ? " is-bad" : ""}`}
                value={exe}
                spellCheck={false}
                onChange={(e) => {
                  setExe(e.target.value);
                  mark();
                }}
                placeholder="D:\\Games\\Game\\Game.exe"
              />
              <button
                className="mini-icon"
                title="浏览可执行文件"
                aria-label="浏览可执行文件"
                onClick={async () => {
                  const picked = await api.pickExe();
                  if (!picked) return;
                  setExe(picked);
                  if (!workDir.trim()) setWorkDir(picked.replace(/[\\/][^\\/]+$/, ""));
                  mark();
                }}
              >
                <IconFolder size={13} />
              </button>
              <button
                className="mini-icon"
                title="打开所在文件夹"
                aria-label="打开所在文件夹"
                disabled={!exe.trim()}
                onClick={() => exe.trim() && void api.revealInExplorer(exe.trim())}
              >
                <IconPlay size={12} />
              </button>
            </div>
          </div>
          {exeBad && <div className="field-note">这个路径看起来不是可执行文件（.exe / .bat / .cmd / .lnk）。</div>}
          <div className="opt-row">
            <span className="ok">{t("opt.workDir")}</span>
            <div className="field-wrap">
              <input
                className="field"
                value={workDir}
                spellCheck={false}
                onChange={(e) => {
                  setWorkDir(e.target.value);
                  mark();
                }}
                placeholder="D:\\Games\\Game"
              />
              <button
                className="mini-icon"
                title="选择工作目录"
                aria-label="选择工作目录"
                onClick={async () => {
                  const picked = await api.pickFolder("选择工作目录");
                  if (!picked) return;
                  setWorkDir(picked);
                  mark();
                }}
              >
                <IconFolder size={13} />
              </button>
            </div>
          </div>
          <div className="opt-row">
            <span className="ok">{t("opt.args")}</span>
            <div className="field-wrap">
              <input
                className="field"
                value={args}
                spellCheck={false}
                onChange={(e) => {
                  setArgs(e.target.value);
                  mark();
                }}
                placeholder={t("opt.argsPlaceholder")}
              />
            </div>
          </div>
        </div>

        <div className="opt-group">
          <div className="opt-group-title">存档</div>
          <div className="opt-row">
            <span className="ok">{t("opt.saveDir")}</span>
            <div className="field-wrap">
              <span className="field dim" title="常见位置，仅供参考">
                {saveDirGuess}
              </span>
              <button
                className="mini-icon"
                title="复制路径"
                aria-label="复制路径"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(saveDirGuess);
                    toast.info("路径已复制", saveDirGuess);
                  } catch {
                    toast.warn("复制失败", saveDirGuess);
                  }
                }}
              >
                <IconCopy size={12} />
              </button>
            </div>
          </div>
          <div className="opt-hint">这是按游戏名推测的常见存档目录，读取真实存档位置在第二版提供。</div>
        </div>

        <div className="opt-v2">
          以管理员运行、退出后清理、多套启动配置将在第二版提供；首版只保留一套路径与参数。
        </div>

        {dirty && (
          <div className="opt-savebar">
            <span className="tx">有未保存的修改</span>
            <span className="spacer" />
            <button className="btn-secondary" onClick={reset}>
              {t("common.cancel")}
            </button>
            <button className="btn-primary" onClick={() => void save()} disabled={saving}>
              {saving ? "保存中…" : t("opt.save")}
            </button>
          </div>
        )}

        <div className="opt-danger">
          {!confirmRemove ? (
            <>
              <div className="tx">
                <b>{t("game.removeGame")}</b>
                <span>{t("game.removeHint")}</span>
              </div>
              <button className="btn-danger" onClick={() => setConfirmRemove(true)}>
                {t("game.removeGame")}
              </button>
            </>
          ) : (
            <>
              <div className="tx">
                <b>确认从星匣移除《{game.titleEn || game.title}》？</b>
                <span>
                  只删除星匣里的记录，不会删除硬盘上的游戏文件。
                  {game.running ? " 游戏正在运行，会先结束它。" : ""}
                </span>
              </div>
              <button className="btn-secondary" onClick={() => setConfirmRemove(false)}>
                {t("common.cancel")}
              </button>
              <button className="btn-danger is-confirm" onClick={() => void onRemove()}>
                确认移除
              </button>
            </>
          )}
        </div>
      </div>

      <aside className="side">
        <div className="info-card">
          <div className="info-card-title">启动配置档</div>
          <div className="prof is-on">
            {t("opt.default")}
            <span className="pm">{t("opt.noArgs")}</span>
          </div>
          <div className="opt-hint" style={{ marginTop: 10 }}>
            同一款游戏可以存多套参数，切换配置档不会改动游戏文件。多套配置在第二版提供。
          </div>
        </div>
        <div className="info-card">
          <div className="info-card-title">当前启动方式</div>
          <div className="kv-line">
            <span className="k">程序</span>
            <span className="v" title={exe || "—"}>
              {exe ? baseName(exe) : "未设置"}
            </span>
          </div>
          <div className="kv-line">
            <span className="k">参数</span>
            <span className="v" title={args || "—"}>
              {args || "—"}
            </span>
          </div>
          <div className="kv-line">
            <span className="k">工作目录</span>
            <span className="v" title={workDir || "—"}>
              {workDir ? baseName(workDir) : "未设置"}
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}
