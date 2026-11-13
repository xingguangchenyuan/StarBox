import type { CSSProperties } from "react";
import type { Game } from "@/types";
import { assetUrl } from "@/lib/api";
import { glyphStyle, patternFor } from "@/components/Icons";

export function coverUrl(game: Game): string | null {
  return assetUrl(game.coverPath) ?? assetUrl(game.bannerPath);
}

export function bannerUrl(game: Game): string | null {
  return assetUrl(game.bannerPath) ?? assetUrl(game.coverPath);
}

/** 有真实封面就用图，没有就用色带 + 图形占位。 */
export function artStyle(game: Game, opts?: { cover?: boolean }): CSSProperties {
  const url = opts?.cover === false ? bannerUrl(game) : coverUrl(game);
  const tint = { ["--a" as string]: game.tintA, ["--b" as string]: game.tintB } as CSSProperties;
  if (url) return { ...tint, backgroundImage: `url("${url}")` };
  return { ...tint, backgroundImage: `linear-gradient(160deg, ${game.tintA} 0%, ${game.tintB} 100%)` };
}

export function ThumbArt({ game, className, style }: { game: Game; className: string; style?: CSSProperties }) {
  const url = coverUrl(game);
  return (
    <span
      className={className}
      style={{
        ...style,
        ...(url
          ? { backgroundImage: `url("${url}")` }
          : { backgroundImage: `linear-gradient(160deg, ${game.tintA}, ${game.tintB})` }),
      }}
    />
  );
}

export function Glyph({ game, className = "glyph" }: { game: Game; className?: string }) {
  return <div className={className} style={glyphStyle(patternFor(game.id))} />;
}

/** 无封面时的封面卡：色带 + 图形 + 底部压暗 */
export function CoverBackdrop({ game }: { game: Game }) {
  const url = coverUrl(game);
  if (url) {
    return (
      <div
        className="art has-art"
        style={{
          backgroundImage: `url("${url}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          border: "0",
        }}
      />
    );
  }
  return (
    <>
      <div className="art" style={{ background: `linear-gradient(160deg, ${game.tintA} 0%, ${game.tintB} 100%)` }} />
      <Glyph game={game} />
    </>
  );
}
