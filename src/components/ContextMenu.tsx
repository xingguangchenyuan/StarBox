import { useEffect } from "react";

export interface MenuItem {
  label: string;
  /** 返回 false 时菜单保持打开（用于两步确认） */
  onSelect: () => void | false;
  danger?: boolean;
  disabled?: boolean;
}

/** 右键菜单：固定在鼠标位置，点空白/右键别处/Esc 关闭。 */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  const left = Math.max(6, Math.min(x, window.innerWidth - 204));
  const top = Math.max(6, Math.min(y, window.innerHeight - items.length * 31 - 12));

  return (
    <div
      className="ctx-menu"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      role="menu"
    >
      {items.map((it, i) => (
        <button
          key={i}
          className={`ctx-item${it.danger ? " is-danger" : ""}`}
          disabled={it.disabled}
          role="menuitem"
          onClick={() => {
            if (it.onSelect() !== false) onClose();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
