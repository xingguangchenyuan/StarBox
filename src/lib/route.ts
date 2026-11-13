import { useEffect } from "react";
import { useApp } from "@/stores/app";
import { useUi, type DialogKind } from "@/stores/ui";
import type { GameTab } from "@/stores/app";

const TABS: GameTab[] = ["overview", "ach", "mod", "opts"];

function parse(hash: string): { id: string | null; tab: GameTab; dialog: DialogKind; view: "grid" | "list" | null } {
  const [path, query = ""] = hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query);
  const dialogRaw = params.get("dialog");
  const dialog: DialogKind =
    dialogRaw === "settings" || dialogRaw === "add" || dialogRaw === "scan" ? (dialogRaw as DialogKind) : null;
  const viewRaw = params.get("view");
  const view = viewRaw === "list" || viewRaw === "grid" ? viewRaw : null;

  const m = path.match(/^\/game\/([\w.-]+)/);
  if (!m) return { id: null, tab: "overview", dialog, view };
  const tabRaw = params.get("tab") as GameTab | null;
  const tab = tabRaw && TABS.includes(tabRaw) ? tabRaw : "overview";
  return { id: m[1], tab, dialog, view };
}

/** 轻量哈希路由：#/game/<id>?tab=ach —— 方便深链，也让截图/回归可复现。 */
export function useHashRoute() {
  const selectedId = useApp((s) => s.selectedId);
  const tab = useApp((s) => s.tab);
  const games = useApp((s) => s.games);
  const ready = useApp((s) => s.ready);

  useEffect(() => {
    if (!ready) return;
    const { id, tab: t, dialog, view } = parse(window.location.hash);
    if (view) useApp.getState().setViewMode(view);
    if (id && games.some((g) => g.id === id)) {
      useApp.setState({ selectedId: id, tab: t });
    }
    if (dialog) useUi.getState().open(dialog);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const target = selectedId ? `#/game/${selectedId}${tab !== "overview" ? `?tab=${tab}` : ""}` : "";
    if (window.location.hash !== target) {
      history.replaceState(null, "", target || window.location.pathname + window.location.search);
    }
  }, [selectedId, tab, ready]);

  useEffect(() => {
    const onHash = () => {
      const { id, tab: t } = parse(window.location.hash);
      if (id && useApp.getState().games.some((g) => g.id === id)) {
        useApp.getState().select(id, t);
      } else if (!id) {
        useApp.getState().select(null);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
}
