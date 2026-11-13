import { useEffect, useRef, useState } from "react";
import type { Tag } from "@/types";
import { useApp } from "@/stores/app";
import { toast } from "@/stores/toasts";
import { t } from "@/i18n/zh-CN";
import { IconPlus, IconTrash } from "@/components/Icons";

/** 新标签可选的色板：与需求书第九章的强调色同源，保证不跳出整体色调。 */
const SWATCHES = ["#e0645a", "#a78bfa", "#7fd4a2", "#e8b45a", "#66c0f4", "#e88ab5", "#8ba1b8", "#d4a373"];

function TagRow({ tag, inUse }: { tag: Tag; inUse: number }) {
  const updateTag = useApp((s) => s.updateTag);
  const deleteTag = useApp((s) => s.deleteTag);
  const [name, setName] = useState(tag.name);
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 标签被别处改名/重载后，输入框跟着回填
  useEffect(() => setName(tag.name), [tag.name]);

  const commitName = async () => {
    const next = name.trim();
    if (!next || next === tag.name) {
      setName(tag.name);
      return;
    }
    try {
      await updateTag(tag.id, next, tag.color);
      toast.info(t("settings.tagRenamed"), next, "标签");
    } catch (e) {
      setName(tag.name);
      toast.warn(t("settings.tagError"), String(e), "标签");
    }
  };

  const commitColor = async (color: string) => {
    if (color.toLowerCase() === tag.color.toLowerCase()) return;
    try {
      await updateTag(tag.id, tag.name, color);
    } catch (e) {
      toast.warn(t("settings.tagError"), String(e), "标签");
    }
  };

  const askDelete = () => {
    if (!confirming) {
      setConfirming(true);
      window.setTimeout(() => setConfirming(false), 2600);
      return;
    }
    setConfirming(false);
    void (async () => {
      try {
        await deleteTag(tag.id);
        // 正在按这个标签筛选的话，回到「全部游戏」，别留一个空书架
        const store = useApp.getState();
        if (store.view === `tag:${tag.id}`) store.setView("all");
        toast.info(t("settings.tagDeleted"), tag.name, "标签");
      } catch (e) {
        toast.warn(t("settings.tagError"), String(e), "标签");
      }
    })();
  };

  return (
    <div className="tag-mrow">
      <span className="tag-dot" style={{ background: tag.color }} title="点击换颜色">
        <input
          type="color"
          value={tag.color}
          aria-label={`${tag.name} 的颜色`}
          onChange={(e) => void commitColor(e.target.value)}
        />
      </span>
      <input
        ref={inputRef}
        className="tag-name"
        value={name}
        maxLength={12}
        spellCheck={false}
        aria-label={`${tag.name} 的名称`}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void commitName()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commitName();
          }
          if (e.key === "Escape") {
            setName(tag.name);
            inputRef.current?.blur();
          }
        }}
      />
      <span className="tag-use">{t("settings.tagUsed", { n: inUse })}</span>
      <button
        className={`tag-del${confirming ? " is-confirm" : ""}`}
        onClick={askDelete}
        title={confirming ? t("settings.tagDeleteConfirm") : t("settings.tagDelete")}
      >
        {confirming ? t("settings.tagDeleteConfirm") : <IconTrash size={11} />}
      </button>
    </div>
  );
}

export function TagManager() {
  const tags = useApp((s) => s.tags);
  const games = useApp((s) => s.games);
  const createTag = useApp((s) => s.createTag);
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[4]);
  const [busy, setBusy] = useState(false);

  const usage = (id: number) => games.filter((g) => g.tags.some((x) => x.id === id)).length;

  const add = async () => {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      await createTag(clean, color);
      setName("");
      toast.info(t("settings.tagAdded"), clean, "标签");
    } catch (e) {
      toast.warn(t("settings.tagError"), String(e), "标签");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="tag-manager">
        {tags.length === 0 && <div className="tag-empty">{t("settings.tagEmpty")}</div>}
        {tags.map((tag) => (
          <TagRow key={tag.id} tag={tag} inUse={usage(tag.id)} />
        ))}

        <div className="tag-new">
          <span className="tag-dot" style={{ background: color }} aria-hidden />
          <input
            className="text-input tag-new-input"
            value={name}
            maxLength={12}
            spellCheck={false}
            placeholder={t("settings.tagNewPlaceholder")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
            }}
          />
          <div className="swatches" role="group" aria-label="标签颜色">
            {SWATCHES.map((c) => (
              <button
                key={c}
                className={`swatch${c === color ? " is-on" : ""}`}
                style={{ background: c }}
                aria-label={c}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <button className="btn-primary tag-add" onClick={() => void add()} disabled={!name.trim() || busy}>
            <IconPlus size={11} />
            {t("settings.tagAdd")}
          </button>
        </div>
      </div>
      <div className="form-hint">{t("settings.tagsHint")}</div>
    </>
  );
}
