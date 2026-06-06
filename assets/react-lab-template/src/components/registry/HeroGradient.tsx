import { motion } from "framer-motion";

type Props = {
  title: string;
  subtitle?: string;
  paragraphs?: string[];
  ctaLabel?: string;
  ctaHref?: string;
};

export function HeroGradient({
  title,
  subtitle,
  paragraphs = [],
  ctaLabel = "Регистрация",
  ctaHref = "#",
}: Props) {
  const blocks = paragraphs.length ? paragraphs : subtitle ? [subtitle] : [];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl border border-brand-accent/15 bg-gradient-to-br from-brand-block via-brand-card to-brand-bg px-6 py-10 md:px-10 md:py-14"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-accent/8 blur-3xl" />
      <h1 className="text-3xl font-bold tracking-tight text-brand-text md:text-4xl">{title}</h1>
      <div className="mt-4 max-w-3xl space-y-4">
        {blocks.map((p) => (
          <p key={p.slice(0, 48)} className="text-base leading-relaxed text-brand-muted md:text-lg">
            {p}
          </p>
        ))}
      </div>
      <a href={ctaHref} className="btn-brand mt-6 px-6 py-2.5 text-sm">
        {ctaLabel}
      </a>
    </motion.section>
  );
}
