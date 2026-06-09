import { motion } from "framer-motion";

type Props = {
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export function CtaBanner({ title, body, ctaLabel = "Начать", ctaHref = "#" }: Props) {
  const text =
    body?.trim() ||
    "Создайте аккаунт за пару минут, активируйте приветственный бонус и получите доступ к каталогу слотов, live-играм и быстрым выплатам.";
  return (
    <motion.aside
      initial={{ opacity: 0, scale: 0.97, y: 10 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-brand-accent/20 bg-brand-block px-6 py-8 text-center"
    >
      <h2 className="text-xl font-bold text-brand-text md:text-2xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm text-brand-muted">{text}</p>
      <a href={ctaHref} className="btn-brand mt-5 px-6 py-2.5 text-sm">
        {ctaLabel}
      </a>
    </motion.aside>
  );
}
