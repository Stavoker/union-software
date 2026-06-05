import { motion } from "framer-motion";

type Props = {
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export function HeroGradient({ title, subtitle, ctaLabel = "Регистрация", ctaHref = "#" }: Props) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black px-6 py-10 md:px-10 md:py-14"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-lime-400/10 blur-3xl" />
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
      {subtitle ? <p className="mt-4 max-w-2xl text-base text-zinc-400 md:text-lg">{subtitle}</p> : null}
      <a
        href={ctaHref}
        className="mt-6 inline-flex min-h-[44px] items-center rounded-full bg-lime-400 px-6 py-2.5 text-sm font-semibold text-black hover:bg-lime-300"
      >
        {ctaLabel}
      </a>
    </motion.section>
  );
}
