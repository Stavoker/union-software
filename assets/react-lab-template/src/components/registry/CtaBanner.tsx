import { motion } from "framer-motion";

type Props = {
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export function CtaBanner({ title, body, ctaLabel = "Начать", ctaHref = "#" }: Props) {
  return (
    <motion.aside
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      className="rounded-2xl border border-lime-400/30 bg-lime-400/10 px-6 py-8 text-center"
    >
      <h2 className="text-xl font-bold md:text-2xl">{title}</h2>
      {body ? <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-300">{body}</p> : null}
      <a
        href={ctaHref}
        className="mt-5 inline-flex min-h-[44px] items-center rounded-full bg-lime-400 px-6 py-2.5 text-sm font-semibold text-black hover:bg-lime-300"
      >
        {ctaLabel}
      </a>
    </motion.aside>
  );
}
