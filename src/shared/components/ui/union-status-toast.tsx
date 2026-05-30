"use client";

import { AnimatePresence, motion } from "framer-motion";

import { seoStatusToast, seoStatusToastDismiss } from "@/shared/components/seo/seo-ui";

type Props = {
  message: string;
  /** Залишено для сумісності; усі toast — лайм #D1FE17. */
  variant?: "lime" | "muted";
  onDismiss: () => void;
  dismissLabel: string;
};

export function UnionStatusToast({ message, onDismiss, dismissLabel }: Props) {
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
          <div className={seoStatusToast}>
            <button
              type="button"
              onClick={onDismiss}
              className={seoStatusToastDismiss}
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
