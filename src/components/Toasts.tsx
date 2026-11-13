import { AnimatePresence, motion } from "framer-motion";
import { useToasts } from "@/stores/toasts";
import { IconAch, IconStar, IconX } from "@/components/Icons";
import { assetUrl } from "@/lib/api";

export function Toasts() {
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence initial={false}>
        {items.map((x) => (
          <motion.div
            key={x.id}
            className={`toast${x.kind === "ach" ? " is-ach" : x.kind === "warn" ? " is-warn" : ""}`}
            initial={{ opacity: 0, x: 36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24, transition: { duration: 0.16, ease: "easeIn" } }}
            transition={{ type: "spring", stiffness: 460, damping: 38, mass: 0.9 }}
            onClick={() => dismiss(x.id)}
          >
            <div
              className="toast-ico"
              style={x.iconUrl && assetUrl(x.iconUrl) ? { backgroundImage: `url("${assetUrl(x.iconUrl)}")` } : undefined}
            >
              {!(x.iconUrl && assetUrl(x.iconUrl)) &&
                (x.kind === "ach" ? <IconAch size={16} index={0} /> : <IconStar size={15} />)}
            </div>
            <div className="toast-body">
              <div className="toast-k">{x.kicker}</div>
              <div className="toast-t">{x.title}</div>
              {x.meta && <div className="toast-m">{x.meta}</div>}
            </div>
            <button
              className="toast-x"
              onClick={(e) => {
                e.stopPropagation();
                dismiss(x.id);
              }}
              aria-label="关闭提示"
            >
              <IconX size={10} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
