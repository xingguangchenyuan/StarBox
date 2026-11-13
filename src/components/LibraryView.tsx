import { useEffect, useRef } from "react";
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
  const ref = useRef<HTMLDivElement>(null);

  // 顶光跟着指针横移，600ms 缓出（CSS 变量插值）
  useEffect(() => {
    const stage = ref.current?.closest(".stage") as HTMLElement | null;
    if (!stage) return;
    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      if (!r.width) return;
      const pct = ((e.clientX - r.left) / r.width) * 100;
      stage.style.setProperty("--lx", `${Math.max(12, Math.min(88, pct)).toFixed(2)}%`);
    };
    const reset = () => stage.style.setProperty("--lx", "26%");
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", reset);
    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", reset);
      reset();
    };
  }, []);

  return (
    <div className="library-view view-in" ref={ref}>
      <TopBar />
      <LibraryHero />
      {hasVisible && <GameWall />}
    </div>
  );
}
