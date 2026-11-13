import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { t } from "@/i18n/zh-CN";

/**
 * 截图查看器。Steam 的截图本身就是 1920×1080，直接放大看；
 * 左右键 / 按钮翻页，Esc 或点背景关闭。
 */
export function Lightbox({
  shots,
  index,
  onClose,
  onIndex,
}: {
  shots: string[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const [loaded, setLoaded] = useState(false);

  const step = useCallback(
    (delta: number) => {
      const next = (index + delta + shots.length) % shots.length;
      setLoaded(false);
      onIndex(next);
    },
    [index, shots.length, onIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, onClose]);

  const src = shots[index];

  return (
    <AnimatePresence>
      <motion.div
        className="lightbox"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.14 }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="lb-top">
          <span className="lb-count">{t("lightbox.counter", { a: index + 1, b: shots.length })}</span>
          <div className="spacer" />
          <button className="lb-btn" onClick={onClose} aria-label={t("lightbox.close")}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="lb-stage">
          {shots.length > 1 && (
            <button className="lb-nav is-prev" onClick={() => step(-1)} aria-label={t("lightbox.prev")}>
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M10 3L5 8l5 5" />
              </svg>
            </button>
          )}
          <img
            key={src}
            className={`lb-img${loaded ? " is-loaded" : ""}`}
            src={src}
            alt=""
            onLoad={() => setLoaded(true)}
            draggable={false}
          />
          {shots.length > 1 && (
            <button className="lb-nav is-next" onClick={() => step(1)} aria-label={t("lightbox.next")}>
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M6 3l5 5-5 5" />
              </svg>
            </button>
          )}
        </div>

        {shots.length > 1 && (
          <div className="lb-strip">
            {shots.map((s, i) => (
              <button
                key={s}
                className={`lb-thumb${i === index ? " is-on" : ""}`}
                style={{ backgroundImage: `url("${s}")` }}
                onClick={() => {
                  setLoaded(false);
                  onIndex(i);
                }}
                aria-label={`${i + 1}`}
              />
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
