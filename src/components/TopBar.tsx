import { useEffect, useRef, useState } from "react";
import { useApp } from "@/stores/app";
import { useUi } from "@/stores/ui";
import { toast } from "@/stores/toasts";
import { t } from "@/i18n/zh-CN";
import { IconDots, IconGrid, IconList, IconPlus, IconSearch } from "@/components/Icons";
import { ContextMenu } from "@/components/ContextMenu";

export function TopBar() {
  const query = useApp((s) => s.query);
  const setQuery = useApp((s) => s.setQuery);
  const viewMode = useApp((s) => s.viewMode);
  const setViewMode = useApp((s) => s.setViewMode);
  const refreshing = useApp((s) => s.refreshing);
  const progress = useApp((s) => s.refreshProgress);
  const refreshAllSteam = useApp((s) => s.refreshAllSteam);
  const syncAllAchievements = useApp((s) => s.syncAllAchievements);
  const open = useUi((s) => s.open);
  const inputRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const onRefresh = async () => {
    const res = await refreshAllSteam();
    if (!res.total) {
      toast.warn(t("top.refreshNone"), "先扫描或添加带 AppID 的 Steam 游戏", "刷新");
      return;
    }
    toast.info(
      t("top.refreshDone", { n: res.ok }),
      res.fail ? `${res.fail} 个失败（网络或限流）` : "简介 / 封面 / 中文名已更新",
      "Steam",
    );
  };

  const onSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await syncAllAchievements("auto");
      toast.info(res.message ?? `已同步 ${res.synced} 个游戏`, res.failed ? `${res.failed} 个失败` : "Steam / 本地文件", "成就");
    } catch (e) {
      toast.warn("同步全部成就失败", String(e), "成就");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        setQuery("");
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setQuery]);

  const pct = progress?.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <header className="topbar">
      <div className="search">
        <IconSearch />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("top.searchPlaceholder")}
          autoComplete="off"
          aria-label={t("top.searchPlaceholder")}
        />
        {refreshing ? (
          <span className="search-status">
            {t("top.refreshing", { done: progress?.done ?? 0, total: progress?.total ?? 0 })}
          </span>
        ) : query ? (
          <button className="kbd" onClick={() => setQuery("")} title="清除搜索">
            Esc
          </button>
        ) : (
          <span className="kbd">Ctrl K</span>
        )}
      </div>
      <div className="spacer" />
      <div className="seg" role="group" aria-label="视图切换">
        <button
          className={`seg-item${viewMode === "grid" ? " is-on" : ""}`}
          onClick={() => setViewMode("grid")}
          title={t("top.grid")}
          aria-label={t("top.grid")}
          aria-pressed={viewMode === "grid"}
        >
          <IconGrid />
        </button>
        <button
          className={`seg-item${viewMode === "list" ? " is-on" : ""}`}
          onClick={() => setViewMode("list")}
          title={t("top.list")}
          aria-label={t("top.list")}
          aria-pressed={viewMode === "list"}
        >
          <IconList />
        </button>
      </div>
      <button
        className="btn-ghost icon-only"
        title={t("top.more")}
        aria-label={t("top.more")}
        aria-haspopup="menu"
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setMenu({ x: r.right - 208, y: r.bottom + 6 });
        }}
      >
        <IconDots size={15} />
      </button>
      <button className="btn-add" onClick={() => open("add")}>
        <IconPlus size={13} />
        {t("top.add")}
      </button>

      {refreshing && (
        <div className="topbar-progress" role="progressbar" aria-valuenow={pct}>
          <i style={{ width: `${pct}%` }} />
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: refreshing ? t("top.refreshing", { done: progress?.done ?? 0, total: progress?.total ?? 0 }) : "刷新全部资料",
              disabled: refreshing,
              onSelect: () => void onRefresh(),
            },
            {
              label: syncing ? "同步成就中…" : "同步全部成就",
              disabled: syncing,
              onSelect: () => void onSyncAll(),
            },
            { separator: true },
            { label: "扫描 Steam / Epic 库", onSelect: () => open("scan") },
            { label: t("rail.settings"), onSelect: () => open("settings") },
          ]}
        />
      )}
    </header>
  );
}
