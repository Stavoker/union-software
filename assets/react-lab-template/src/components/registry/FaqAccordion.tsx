import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

type Item = { q: string; a: string };
type Props = { title?: string; items?: Item[] };

export function FaqAccordion({ title = "Частые вопросы", items = [] }: Props) {
  const list = items.length ? items : [
    { q: "Как зарегистрироваться?", a: "Нажмите кнопку регистрации и следуйте инструкциям." },
    { q: "Есть ли мобильная версия?", a: "Да, сайт адаптирован под смартфоны." },
  ];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-brand-text">{title}</h2>
      <div className="space-y-2">
        {list.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={item.q} className="rounded-xl border border-brand-accent/15 bg-brand-block">
              <button
                type="button"
                className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left text-brand-text"
                onClick={() => setOpen(isOpen ? null : i)}
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
                    className="overflow-hidden px-4 pb-4 text-sm text-brand-muted"
                  >
                    {item.a}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}
