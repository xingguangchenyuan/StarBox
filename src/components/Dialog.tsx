import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { IconX } from "@/components/Icons";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide = false,
  size,
  className = "",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** sm 480 / md 620 / lg 880；默认沿用 wide 的 620 */
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    const first = box?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !box) return;
      const nodes = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null,
      );
      if (!nodes.length) return;
      const head = nodes[0];
      const tail = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      restoreRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <motion.div
      className="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={boxRef}
        className={`dialog${wide ? " wide" : ""}${size ? ` size-${size}` : ""}${className ? ` ${className}` : ""}`}
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.985, transition: { duration: 0.14, ease: "easeIn" } }}
        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="dialog-head">
          <h3>{title}</h3>
          {subtitle && <span className="sub">{subtitle}</span>}
          <button className="x" onClick={onClose} aria-label="关闭">
            <IconX size={13} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </motion.div>
    </motion.div>
  );
}
