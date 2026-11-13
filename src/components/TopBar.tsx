import { useEffect, useRef } from "react";
import { useApp } from "@/stores/app";
import { useUi } from "@/stores/ui";
import { toast } from "@/stores/toasts";
import { t } from "@/i18n/zh-CN";
import { IconGrid, IconList, IconPlus, IconRefresh, IconSearch } from "@/components/Icons";

export function TopBar() {
  const query = useApp((s) => s.query);
  const setQuery = useApp((s) => s.setQuery);
  const viewMode = useApp((s) => s.viewMode);
  const setViewMode = useApp((s) => s.setViewMode);
  const refreshing = useApp((s) => s.refreshing);
  const progress = useApp((s) => s.refreshProgress);
  const refreshAllSteam = useApp((s) => s.refreshAllSteam);
  const open = useUi((s) => s.open);
  const inputRef = useRef<HTMLInputElement>(null);

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
        {query ? (
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
          aria-pressed={viewMode === "grid"}
        >
          <IconGrid />
        </button>
        <button
          className={`seg-item${viewMode === "list" ? " is-on" : ""}`}
          onClick={() => setViewMode("list")}
          title={t("top.list")}
          aria-pressed={viewMode === "list"}
        >
          <IconList />
        </button>
      </div>
      <button
        className="btn-refresh"
        onClick={() => void onRefresh()}
        disabled={refreshing}
        title={refreshing ? t("top.refreshing", { done: progress?.done ?? 0, total: progress?.total ?? 0 }) : t("top.refresh")}
      >
        <IconRefresh size={13} className={refreshing ? "spin" : undefined} />
        {refreshing
          ? t("top.refreshing", { done: progress?.done ?? 0, total: progress?.total ?? 0 })
          : "刷新资料"}
      </button>
      <button className="btn-add" onClick={() => open("add")}>
        <IconPlus size={13} />
        {t("top.add")}
      </button>
    </header>
  );
}
