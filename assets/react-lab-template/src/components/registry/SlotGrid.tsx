import { motion } from "framer-motion";
import { resolveSlotImages, resolveSlotSrc } from "./slot-utils";

type Props = {
  title?: string;
  intro?: string;
  images: string[];
  gatewayHref: string;
};

export function SlotGrid({ title = "Популярные слоты", intro, images, gatewayHref }: Props) {
  const list = resolveSlotImages(images, 12);
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="space-y-4"
    >
      <h2 className="text-2xl font-semibold text-brand-text">{title}</h2>
      {intro ? <p className="max-w-3xl text-sm leading-relaxed text-brand-muted md:text-base">{intro}</p> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {list.map((src, i) => (
          <motion.a
            key={`${src}-${i}`}
            href={gatewayHref}
            initial={{ opacity: 0, scale: 0.94 }}
            whileInView={{ opacity: 1, scale: 1 }}
            whileHover={{ y: -4, scale: 1.02 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.04, duration: 0.35 }}
            className="group relative block aspect-[3/2] overflow-hidden rounded-xl border border-brand-accent/15 bg-brand-block"
          >
            <img
              src={resolveSlotSrc(src)}
              alt=""
              width={320}
              height={213}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <span
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brand-bg/50 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              aria-hidden
            />
          </motion.a>
        ))}
      </div>
    </motion.section>
  );
}
