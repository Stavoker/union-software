import { motion } from "framer-motion";
import { resolveSlotImages, resolveSlotSrc } from "./slot-utils";

type Props = {
  title?: string;
  intro?: string;
  images: string[];
  gatewayHref: string;
};

export function SlotShowcase({
  title = "Топ слоты",
  intro,
  images,
  gatewayHref,
}: Props) {
  const list = resolveSlotImages(images, 7);
  const featured = list[0];
  const rest = list.slice(1);

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="space-y-4"
    >
      <h2 className="text-2xl font-semibold text-brand-text">{title}</h2>
      {intro ? (
        <p className="max-w-3xl text-sm leading-relaxed text-brand-muted md:text-base">{intro}</p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {featured ? (
          <motion.a
            href={gatewayHref}
            whileHover={{ scale: 1.01 }}
            className="group relative block aspect-[16/9] overflow-hidden rounded-2xl border border-brand-accent/20 bg-brand-block lg:row-span-2 lg:aspect-auto lg:min-h-[280px]"
          >
            <img
              src={resolveSlotSrc(featured)}
              alt=""
              width={640}
              height={360}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-bg/80 to-transparent p-4 text-sm font-medium text-brand-text">
              Играть сейчас
            </span>
          </motion.a>
        ) : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
          {rest.map((src, i) => (
            <motion.a
              key={`${src}-${i}`}
              href={gatewayHref}
              whileHover={{ y: -3 }}
              className="group relative block aspect-[3/2] overflow-hidden rounded-xl border border-brand-accent/15 bg-brand-block"
            >
              <img
                src={resolveSlotSrc(src)}
                alt=""
                width={240}
                height={160}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </motion.a>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
