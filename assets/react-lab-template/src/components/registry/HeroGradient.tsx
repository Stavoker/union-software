import { motion } from "framer-motion";

type Props = {
  title: string;
  eyebrow?: string;
  /** Одна короткая строка (теглайн). Длинные абзацы — только в ProseBlock ниже hero. */
  subtitle?: string;
  backgroundImage?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export function HeroGradient({
  title,
  eyebrow,
  subtitle,
  backgroundImage,
  ctaLabel = "Регистрация",
  ctaHref = "#",
}: Props) {
  const src = backgroundImage
    ? backgroundImage.startsWith("./")
      ? backgroundImage
      : `./img/${backgroundImage}`
    : "";

  if (src) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-brand-accent/15"
      >
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${src})` }} aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-bg/95 via-brand-bg/80 to-brand-bg/55" aria-hidden />
        <div className="relative z-10 space-y-4 p-8 md:p-10">
          {eyebrow ? (
            <span className="inline-block rounded-full border border-brand-accent/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-accent">
              {eyebrow}
            </span>
          ) : null}
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-brand-text md:text-4xl">{title}</h1>
          {subtitle ? (
            <p className="max-w-2xl text-base leading-relaxed text-brand-muted md:text-lg">{subtitle}</p>
          ) : null}
          <a href={ctaHref} className="btn-brand mt-2 px-6 py-2.5 text-sm">
            {ctaLabel}
          </a>
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl border border-brand-accent/15 bg-gradient-to-br from-brand-block via-brand-card to-brand-bg px-6 py-10 md:px-10 md:py-14"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-accent/8 blur-3xl" />
      {eyebrow ? (
        <span className="inline-block rounded-full border border-brand-accent/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-accent">
          {eyebrow}
        </span>
      ) : null}
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-brand-text md:text-4xl">{title}</h1>
      {subtitle ? (
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-brand-muted md:text-lg">{subtitle}</p>
      ) : null}
      <a href={ctaHref} className="btn-brand mt-6 px-6 py-2.5 text-sm">
        {ctaLabel}
      </a>
    </motion.section>
  );
}
