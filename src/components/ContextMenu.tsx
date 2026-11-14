import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

/**
 * 浮层菜单：右键位置或按钮位置 + 视口边界夹紧，点空白/右键别处/Esc 关闭。
 *
 * 两点关键实现：
 * 1. 通过 portal 挂到 document.body。菜单原来是就地渲染的，父级 `.view-in`
 *    的动画残留 transform 会让 `position: fixed` 改为相对该容器定位，
 *    再被 `.stage { overflow: hidden }` 裁掉，表现为右边/下边看不全。
 * 2. 挂载后先量真实尺寸再定位。菜单项数量、文字行高都在变，按
 *    “行数 × 31px” 估算会算错，底部就冒出视口。
 */
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
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = el.offsetWidth || width;
    // 首次测量时还没有 maxHeight，拿到的是完整高度
    const naturalH = el.offsetHeight;
    const maxH = vh - m * 2;
    const h = Math.min(naturalH, maxH);

    const left = Math.min(Math.max(m, x), Math.max(m, vw - w - m));
    // 下方空间不够就翻到锚点上方，仍然放不下再夹到底边
    let top = y;
    if (top + h > vh - m) {
      const above = y - h;
      top = above >= m ? above : vh - h - m;
    }
    setPos({ left, top: Math.max(m, top), maxH });
  }, [x, y, width, items.length, items[0]?.label, items[items.length - 1]?.label]);

  const focusedRef = useRef(false);
  useEffect(() => {
    // 定位完成后再聚焦：此时元素已经可见，focus() 才生效。
    // 只聚焦一次——菜单内容变化（例如「刷新中 3/14」）重新定位时不要抢走焦点。
    if (!pos || focusedRef.current) return;
    focusedRef.current = true;
    ref.current?.querySelector<HTMLButtonElement>(".ctx-item:not([disabled])")?.focus();
  }, [pos]);

  useEffect(() => {
    // 窗口尺寸变了菜单还挂在原坐标上会显得错位，直接收起最省事
    const onResize = () => onClose();
    const close = () => onClose();
    // 用 mousedown 而不是 click 判断「点外面」：
    // 菜单常常是被一次 click 打开的，如果在 window 上监听 click，
    // 这次打开它的 click 冒泡到 window 时菜单已经挂载，会立刻把自己关掉。
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const nodes = () =>
      Array.from(ref.current?.querySelectorAll<HTMLButtonElement>(".ctx-item:not([disabled])") ?? []);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const list = nodes();
      if (!list.length) return;
      e.preventDefault();
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = i < 0 ? list[0] : list[(i + step + list.length) % list.length];
      next.focus();
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", onResize);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="ctx-menu"
      style={{
        left: pos?.left ?? x,
        top: pos?.top ?? y,
        width,
        maxHeight: pos?.maxH,
      }}
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
    </div>,
    document.body,
  );
}
