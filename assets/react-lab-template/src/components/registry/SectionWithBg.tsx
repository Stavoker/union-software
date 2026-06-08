import { motion } from "framer-motion";

type Props = {
  title: string;
  body: string;
  backgroundImage?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export function SectionWithBg({
  title,
  body,
  backgroundImage,
  ctaLabel,
  ctaHref,
}: Props) {
  const src = backgroundImage
    ? backgroundImage.startsWith("./")
      ? backgroundImage
      : `./img/${backgroundImage}`
    : "";

  if (!src) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="space-y-4 rounded-3xl border border-brand-accent/15 bg-brand-block p-8 md:p-10"
      >
        <h2 className="text-2xl font-semibold text-brand-text md:text-3xl">{title}</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-brand-muted md:text-base">{body}</p>
        {ctaLabel && ctaHref ? (
          <a href={ctaHref} className="btn-brand px-6 py-2.5 text-sm">
            {ctaLabel}
          </a>
        ) : null}
      </motion.section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="relative overflow-hidden rounded-3xl border border-brand-accent/15"
    >
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${src})` }} aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-r from-brand-bg/95 via-brand-bg/80 to-brand-bg/55" aria-hidden />
      <div className="relative z-10 space-y-4 p-8 md:p-10">
        <h2 className="text-2xl font-semibold text-brand-text md:text-3xl">{title}</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-brand-muted md:text-base">{body}</p>
        {ctaLabel && ctaHref ? (
          <a href={ctaHref} className="btn-brand px-6 py-2.5 text-sm">
            {ctaLabel}
          </a>
        ) : null}
      </div>
    </motion.section>
  );
}
