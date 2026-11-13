import { TopBar } from "@/components/TopBar";
import { LibraryHero } from "@/components/LibraryHero";
import { GameWall } from "@/components/GameWall";
import { useApp } from "@/stores/app";

export function LibraryView() {
  // 库为空时 Hero 已经承担了「首次使用」引导，
  // 不再让下面的书架重复一遍空状态。
  const hasVisible = useApp((s) =>
    s.games.some((g) => !g.hidden || (s.settings?.showHidden ?? false)),
  );

  return (
    <div className="view-in" style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}>
      <TopBar />
      <LibraryHero />
      {hasVisible && <GameWall />}
    </div>
  );
}
