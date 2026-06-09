import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { SlotHoverOverlay } from "./SlotHoverOverlay";
import { resolveSlotImages, resolveSlotSrc } from "./slot-utils";

type Props = {
  title?: string;
  intro?: string;
  images: string[];
  gatewayHref: string;
};

export function SlotScrollRow({
  title = "Новинки слотов",
  intro,
  images,
  gatewayHref,
}: Props) {
  const list = resolveSlotImages(images, 10);

  return (
    <motion.section
      id="lw-games"
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-brand-text">{title}</h2>
          {intro ? (
            <p className="max-w-2xl text-sm leading-relaxed text-brand-muted md:text-base">{intro}</p>
          ) : null}
        </div>
        <a
          href={gatewayHref}
          className="btn-brand inline-flex min-h-[44px] items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium"
        >
          Все игры
          <ChevronRight className="h-4 w-4" aria-hidden />
        </a>
      </div>
      <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-2 snap-x snap-mandatory scroll-smooth [scrollbar-width:thin]">
        {list.map((src, i) => (
          <motion.a
            key={`${src}-${i}`}
            href={gatewayHref}
            whileHover={{ y: -4 }}
            className="group relative block h-[140px] w-[200px] shrink-0 snap-start overflow-hidden rounded-xl border border-brand-accent/15 bg-brand-block sm:h-[160px] sm:w-[220px]"
          >
            <img
              src={resolveSlotSrc(src)}
              alt=""
              width={220}
              height={160}
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
