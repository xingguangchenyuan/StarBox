import { pinyin } from "pinyin-pro";
import type { Game } from "@/types";

const cache = new Map<string, string>();

function indexFor(text: string): string {
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  let idx = text.toLowerCase();
  try {
    const full = pinyin(text, { toneType: "none", type: "array" }).join("");
    const first = pinyin(text, { pattern: "first", toneType: "none", type: "array" }).join("");
    idx = `${idx} ${full.toLowerCase()} ${first.toLowerCase()}`;
  } catch {
    /* 非中文或库异常时退化为原串 */
  }
  if (cache.size > 4000) cache.clear();
  cache.set(text, idx);
  return idx;
}

/** 名称 / 英文名 / 开发商 / 拼音全拼 / 拼音首字母 */
export function matchQuery(game: Game, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  if (game.title.toLowerCase().includes(q)) return true;
  if (game.titleEn && game.titleEn.toLowerCase().includes(q)) return true;
  if (game.studio && game.studio.toLowerCase().includes(q)) return true;
  return indexFor(`${game.title} ${game.titleEn ?? ""} ${game.studio ?? ""}`).includes(q);
}
