import { motion } from "framer-motion";
import { MessageCircleQuestion } from "lucide-react";
import { resolveFaqList, type FaqItem } from "./faq-utils";

type Props = { title?: string; intro?: string; items?: FaqItem[] };

export function FaqCardGrid({
  title = "Ответы на популярные вопросы",
  intro,
  items = [],
}: Props) {
  const list = resolveFaqList(items);

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-brand-text">{title}</h2>
        {intro ? (
          <p className="max-w-3xl text-sm leading-relaxed text-brand-muted md:text-base">{intro}</p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((item, i) => (
          <motion.article
            key={`${item.q.slice(0, 32)}-${i}`}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            whileHover={{ y: -2 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.04 }}
            className="flex flex-col gap-3 rounded-xl border border-brand-accent/15 bg-brand-block p-4"
          >
            <div className="flex items-start gap-2">
              <MessageCircleQuestion className="mt-0.5 h-5 w-5 shrink-0 text-brand-accent" aria-hidden />
              <h3 className="font-medium leading-snug text-brand-text">{item.q}</h3>
            </div>
            <p className="text-sm leading-relaxed text-brand-muted">{item.a}</p>
          </motion.article>
        ))}
      </div>
    </motion.section>
  );
}
