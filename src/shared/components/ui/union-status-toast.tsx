"use client";

import { AnimatePresence, motion } from "framer-motion";

type Props = {
  message: string;
  variant?: "lime" | "muted";
  onDismiss: () => void;
  dismissLabel: string;
};

export function UnionStatusToast({
  message,
  variant = "lime",
  onDismiss,
  dismissLabel,
}: Props) {
  const isLime = variant === "lime";

  return (
    <AnimatePresence mode="wait">
      {message ? (
        <motion.div
          key="union-status-toast"
          role="status"
          className="fixed right-4 top-4 z-[100] max-w-[min(calc(100vw-2rem),22rem)] origin-top-right"
          initial={{ opacity: 0, x: 22, y: -6, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          exit={{ opacity: 0, x: 18, y: -4, scale: 0.96 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className={`relative rounded-xl px-4 py-3 pr-10 text-sm leading-relaxed shadow-lg backdrop-blur-md ${
              isLime
                ? "border border-[#d1fe17] bg-[#d1fe17]/[0.09] text-[#d1fe17]"
                : "border border-union-border bg-union-bg/95 text-union-muted"
            }`}
          >
            <button
              type="button"
              onClick={onDismiss}
              className={
                isLime
                  ? "absolute right-2 top-2 rounded-md p-1 text-[#d1fe17]/75 transition-colors hover:bg-[#d1fe17]/10 hover:text-[#d1fe17]"
                  : "absolute right-2 top-2 rounded-md p-1 text-union-muted transition-colors hover:bg-white/[0.06] hover:text-union-text"
              }
              aria-label={dismissLabel}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <p className="whitespace-pre-wrap break-words">{message}</p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
