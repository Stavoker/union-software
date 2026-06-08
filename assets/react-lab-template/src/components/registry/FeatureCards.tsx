import { motion } from "framer-motion";
import { Sparkles, Shield, Zap } from "lucide-react";

type Item = { title: string; body: string };
type Props = { title?: string; items?: Item[] };

const ICONS = [Sparkles, Shield, Zap];

function isFilledCard(item: Item | undefined): item is Item {
  const title = String(item?.title || "").trim();
  const body = String(item?.body || "").trim();
  return title.length >= 3 && body.length >= 15 && !/^(заголовок|текст|описание|\.{3})$/i.test(title);
}

export function FeatureCards({ title = "Преимущества", items = [] }: Props) {
  const filtered = (Array.isArray(items) ? items : []).filter(isFilledCard);
  const list = filtered.length >= 3 ? filtered : [
    { title: "Быстрый старт", body: "Регистрация за минуту." },
    { title: "Безопасность", body: "Защита данных и платежей." },
    { title: "Бонусы", body: "Акции для новых игроков." },
  ];
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-semibold text-brand-text">{title}</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {list.map((item, i) => {
          const Icon = ICONS[i % ICONS.length];
          return (
            <motion.article
              key={item.title}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="rounded-2xl border border-brand-accent/15 bg-brand-block p-5"
            >
              <Icon className="h-6 w-6 text-brand-accent" aria-hidden />
              <h3 className="mt-3 font-semibold text-brand-text">{item.title}</h3>
              <p className="mt-2 text-sm text-brand-muted">{item.body}</p>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
