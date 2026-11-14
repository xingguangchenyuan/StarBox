import { useEffect, useRef } from "react";

export interface MenuItem {
  label?: string;
  /** 返回 false 时菜单保持打开（用于两步确认） */
  onSelect?: () => void | false;
  danger?: boolean;
  disabled?: boolean;
  /** 分隔线：分组之间用，不需要 label */
  separator?: boolean;
  /** 右侧提示，例如快捷键 */
  hint?: string;
  /** 左侧打勾（用于排序 / 筛选这类单选菜单） */
  checked?: boolean;
}

/** 右键菜单：固定在鼠标位置，点空白/右键别处/Esc 关闭。支持分组分隔线。 */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
  width = 208,
  title,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  width?: number;
  title?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = () => onClose();
    // 用 mousedown 而不是 click 判断「点外面」：
    // 菜单常常是被一次 click 打开的，如果在 window 上监听 click，
    // 这次打开它的 click 冒泡到 window 时菜单已经挂载，会立刻把自己关掉。
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const items = () =>
      Array.from(ref.current?.querySelectorAll<HTMLButtonElement>(".ctx-item:not([disabled])") ?? []);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const nodes = items();
      if (!nodes.length) return;
      e.preventDefault();
      const i = nodes.indexOf(document.activeElement as HTMLButtonElement);
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = i < 0 ? nodes[0] : nodes[(i + step + nodes.length) % nodes.length];
      next.focus();
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    items()[0]?.focus();
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  const rows = items.filter((i) => !i.separator).length;
  const seps = items.filter((i) => i.separator).length;
  const height = rows * 31 + seps * 9 + 12 + (title ? 24 : 0);
  const left = Math.max(6, Math.min(x, window.innerWidth - width - 8));
  const top = Math.max(6, Math.min(y, window.innerHeight - height));

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left, top, width }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      role="menu"
    >
      {title && <div className="ctx-title">{title}</div>}
      {items.map((it, i) =>
        it.separator ? (
          <div key={`sep-${i}`} className="ctx-sep" role="separator" />
        ) : (
          <button
            key={i}
            className={`ctx-item${it.danger ? " is-danger" : ""}${it.checked ? " is-checked" : ""}`}
            disabled={it.disabled}
            role="menuitemradio"
            aria-checked={it.checked}
            onClick={() => {
              if (it.onSelect?.() !== false) onClose();
            }}
          >
            <span className="ctx-check">{it.checked ? "✓" : ""}</span>
            <span className="ctx-label">{it.label}</span>
            {it.hint && <span className="ctx-hint">{it.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}
