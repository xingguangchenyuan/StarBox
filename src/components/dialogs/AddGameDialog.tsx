import { useEffect, useState } from "react";
import type { FolderCandidate } from "@/types";
import { t } from "@/i18n/zh-CN";
import { Dialog } from "@/components/Dialog";
import { api, isDemo } from "@/lib/api";
import { useApp } from "@/stores/app";
import { useUi } from "@/stores/ui";
import { toast } from "@/stores/toasts";
import { fmtBytes } from "@/lib/format";
import { IconCheck, IconDownload, IconFolder, IconGamepad, IconScan } from "@/components/Icons";

type View = "menu" | "folder";

export function AddGameDialog() {
  const close = useUi((s) => s.close);
  const open = useUi((s) => s.open);
  const pendingFolder = useUi((s) => s.pendingFolder);
  const addGame = useApp((s) => s.addGame);
  const select = useApp((s) => s.select);

  const [view, setView] = useState<View>("menu");
  const [folder, setFolder] = useState("");
  const [candidates, setCandidates] = useState<FolderCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = async (dir: string) => {
    setView("folder");
    setFolder(dir);
    setScanning(true);
    setError(null);
    setCandidates([]);
    setSelected(new Set());
    try {
      const list = await api.scanFolder(dir);
      setCandidates(list);
      // 默认勾上「最像主程序」的那一个，其余交给用户决定
      const auto = list.find((c) => c.likelyMain && !c.inLibrary) ?? list.find((c) => !c.inLibrary);
      setSelected(new Set(auto ? [auto.path] : []));
    } catch (e) {
      setError(String(e));
    } finally {
      setScanning(false);
    }
  };

  // 从窗口拖入文件夹时，直接进入扫描结果
  useEffect(() => {
    if (pendingFolder) void scan(pendingFolder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFolder]);

  const pickFolder = async () => {
    const dir = await api.pickFolder("选择游戏安装文件夹");
    if (dir) await scan(dir);
  };

  const toggle = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const addSelected = async () => {
    const picks = candidates.filter((c) => selected.has(c.path));
    if (!picks.length || adding) return;
    setAdding(true);
    let added = 0;
    let existed = 0;
    let firstId: string | null = null;
    for (const p of picks) {
      try {
        const res = await addGame(p.path, folder);
        if (res.existed) existed++;
        else added++;
        firstId ??= res.game.id;
      } catch (e) {
        toast.warn("导入失败", `${p.name}：${e}`, t("rail.addGame"));
      }
    }
    setAdding(false);
    close();
    if (firstId) select(firstId);
    if (added > 0) {
      toast.info(t("add.addedCount", { n: added }), existed ? `${existed} 个已在库中` : folder, t("rail.addGame"));
    } else if (existed > 0) {
      toast.info(t("toast.alreadyInLibrary"), `${existed} 个游戏`, t("rail.addGame"));
    }
  };

  const addSingle = async (path: string) => {
    setAdding(true);
    try {
      const { game, existed } = await addGame(path);
      close();
      select(game.id);
      toast.info(existed ? t("toast.alreadyInLibrary") : t("toast.added"), `《${game.title}》`, t("rail.addGame"));
    } catch (e) {
      toast.warn("导入失败", String(e), t("rail.addGame"));
    } finally {
      setAdding(false);
    }
  };

  const pickExe = async () => {
    const path = await api.pickExe();
    if (path) await addSingle(path);
  };

  const option = (
    key: string,
    icon: React.ReactNode,
    title: string,
    hint: string,
    onClick: () => void,
    primary = false,
  ) => (
    <button key={key} className={`add-opt${primary ? " is-primary" : ""}`} onClick={onClick} disabled={adding}>
      <span className="add-ico">{icon}</span>
      <span className="add-tx">
        <b>{title}</b>
        <span>{hint}</span>
      </span>
    </button>
  );

  const selectedCount = [...selected].filter((p) => candidates.some((c) => c.path === p && !c.inLibrary)).length;

  const footer =
    view === "folder" ? (
      <>
        <button className="btn-secondary" onClick={() => void pickFolder()} disabled={scanning || adding}>
          <IconFolder size={12} />
          {t("add.scanAgain")}
        </button>
        <div className="spacer" />
        <span className="form-hint" style={{ marginTop: 0 }}>
          {scanning ? "扫描中…" : `已选 ${selectedCount} 项`}
        </span>
        <button
          className="btn-primary"
          onClick={() => void addSelected()}
          disabled={scanning || adding || selectedCount === 0}
        >
          {t("add.addSelected", { n: selectedCount })}
        </button>
      </>
    ) : (
      <>
        <span className="form-hint" style={{ marginTop: 0 }}>
          {isDemo ? t("add.demoNote") : "支持 .exe / .lnk / .bat / .cmd；快捷方式会解析到真实程序。"}
        </span>
        <div className="spacer" />
        <button className="btn-secondary" onClick={close}>
          {t("common.close")}
        </button>
      </>
    );

  return (
    <Dialog
      title={view === "folder" ? t("add.folderTitle") : t("add.title")}
      subtitle={view === "folder" ? folder : t("add.subtitle")}
      onClose={close}
      wide
      footer={footer}
    >
      {view === "menu" ? (
        <>
          {option("exe", <IconGamepad size={18} />, t("add.fromExe"), t("add.fromExeHint"), () => void pickExe(), true)}
          {option("folder", <IconFolder size={18} />, t("add.fromFolder"), t("add.fromFolderHint"), () => void pickFolder())}
          {option("scan", <IconScan size={18} />, t("add.scan"), t("add.scanHint"), () => {
            close();
            open("scan");
          })}

          <div className="drag-hint">
            <IconDownload size={14} />
            也可以直接把 exe / 快捷方式 / 整个游戏文件夹拖进窗口——文件夹会先扫描再让你勾选。
          </div>
        </>
      ) : scanning ? (
        <div className="skel-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 46, opacity: 1 - i * 0.16 }} />
          ))}
          <div className="form-hint" style={{ marginTop: 6 }}>{t("add.folderScanning")}</div>
        </div>
      ) : error ? (
        <div className="empty-panel" style={{ marginTop: 0 }}>
          <h4>扫描失败</h4>
          <p>{error}</p>
        </div>
      ) : candidates.length === 0 ? (
        <div className="empty-panel" style={{ marginTop: 0 }}>
          <h4>{t("add.folderEmpty")}</h4>
          <p>{t("add.folderEmptyHint")}</p>
        </div>
      ) : (
        <>
          <div className="form-hint" style={{ marginTop: 0, marginBottom: 10 }}>
            {t("add.folderFound", { n: candidates.length })}
          </div>
          <div className="scan-list" style={{ maxHeight: 320 }}>
            {candidates.map((c) => {
              const on = selected.has(c.path);
              return (
                <button
                  className="scan-row"
                  key={c.path}
                  disabled={c.inLibrary}
                  onClick={() => toggle(c.path)}
                  style={{ opacity: c.inLibrary ? 0.5 : 1, textAlign: "left", width: "100%" }}
                >
                  <span className={`checkbox${on || c.inLibrary ? " is-on" : ""}${c.inLibrary ? " is-disabled" : ""}`}>
                    <IconCheck size={10} />
                  </span>
                  <span style={{ minWidth: 0, flex: "1 1 auto" }}>
                    <span className="nm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {c.name}
                      {c.likelyMain && !c.inLibrary && (
                        <span className="tag" style={{ marginLeft: 0, padding: "0 5px", height: 15, lineHeight: "15px" }}>
                          {t("add.likelyMain")}
                        </span>
                      )}
                    </span>
                    <span className="path" style={{ display: "block" }}>{c.path}</span>
                  </span>
                  <span className="tag" style={{ marginLeft: 0 }}>
                    {c.inLibrary ? t("add.inLibrary") : fmtBytes(c.sizeBytes)}
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
