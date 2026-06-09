import { motion } from "framer-motion";
import { SlotHoverOverlay } from "./SlotHoverOverlay";
import { resolveSlotImages, resolveSlotSrc } from "./slot-utils";

type Props = {
  title?: string;
  intro?: string;
  images: string[];
  gatewayHref: string;
};

export function SlotFeaturedRow({
  title = "Рекомендуемые слоты",
  intro,
  images,
  gatewayHref,
}: Props) {
  const list = resolveSlotImages(images, 3);

  return (
    <motion.section
      id="lw-games"
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="space-y-4"
    >
      <h2 className="text-2xl font-semibold text-brand-text">{title}</h2>
      {intro ? (
        <p className="max-w-3xl text-sm leading-relaxed text-brand-muted md:text-base">{intro}</p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        {list.map((src, i) => (
          <motion.a
            key={`${src}-${i}`}
            href={gatewayHref}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            whileHover={{ y: -6 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className="group relative block aspect-[4/5] overflow-hidden rounded-2xl border border-brand-accent/15 bg-brand-block md:aspect-[3/4]"
          >
            <img
              src={resolveSlotSrc(src)}
              alt=""
              width={360}
              height={480}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <SlotHoverOverlay />
          </motion.a>
        ))}
      </div>
    </motion.section>
  );
}
