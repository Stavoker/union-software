import { motion } from "framer-motion";

type Props = {
  title?: string;
  intro?: string;
  images: string[];
  gatewayHref: string;
};

function resolveSrc(src: string) {
  return src.startsWith("./") ? src : `./img/${src}`;
}

export function SlotGrid({ title = "Популярные слоты", intro, images, gatewayHref }: Props) {
  const list = (Array.isArray(images) ? images : []).slice(0, 12);
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
            className="group overflow-hidden rounded-xl border border-brand-accent/15 bg-brand-card"
          >
            <div className="media-contain-frame aspect-[3/2] p-2">
              <img
                src={resolveSrc(src)}
                alt=""
                width={168}
                height={112}
                loading="lazy"
                className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
              />
            </div>
          </motion.a>
        ))}
      </div>
    </motion.section>
  );
}
