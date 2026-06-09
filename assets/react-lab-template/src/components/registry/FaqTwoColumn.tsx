import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, HelpCircle } from "lucide-react";
import { resolveFaqList, type FaqItem } from "./faq-utils";

type Props = { title?: string; intro?: string; items?: FaqItem[] };

export function FaqTwoColumn({
  title = "Частые вопросы",
  intro,
  items = [],
}: Props) {
  const list = resolveFaqList(items);
  const half = Math.ceil(list.length / 2);
  const left = list.slice(0, half);
  const right = list.slice(half);
  const [open, setOpen] = useState<number | null>(0);

  function renderColumn(col: FaqItem[], offset: number) {
    return (
      <div className="space-y-2">
        {col.map((item, i) => {
          const idx = offset + i;
          const isOpen = open === idx;
          return (
            <div
              key={`${item.q.slice(0, 32)}-${idx}`}
              className="rounded-xl border border-brand-accent/15 bg-brand-block"
            >
              <button
                type="button"
                className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left text-brand-text"
                onClick={() => setOpen(isOpen ? null : idx)}
                aria-expanded={isOpen}
              >
                <span className="font-medium">{item.q}</span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-brand-accent transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              <AnimatePresence initial={false}>
                {isOpen ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden px-4 pb-4 text-sm leading-relaxed text-brand-muted"
                  >
                    {item.a}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="space-y-4"
    >
      <div className="flex items-start gap-3">
        <HelpCircle className="mt-1 h-6 w-6 shrink-0 text-brand-accent" aria-hidden />
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-brand-text">{title}</h2>
          {intro ? (
            <p className="max-w-3xl text-sm leading-relaxed text-brand-muted md:text-base">{intro}</p>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {renderColumn(left, 0)}
        {renderColumn(right, half)}
      </div>
    </motion.section>
  );
}
