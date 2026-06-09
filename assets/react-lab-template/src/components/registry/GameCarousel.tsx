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

export function GameCarousel({
  title = "Популярные игры",
  intro,
  images,
  gatewayHref,
}: Props) {
  const list = (Array.isArray(images) ? images : []).slice(0, 16);
  const doubled = [...list, ...list];

  return (
    <motion.section
      id="lw-games"
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="space-y-4 overflow-hidden"
    >
      <h2 className="text-2xl font-semibold text-brand-text">{title}</h2>
      {intro ? <p className="max-w-3xl text-sm leading-relaxed text-brand-muted md:text-base">{intro}</p> : null}
      <div className="relative -mx-2">
        <motion.div
          className="flex gap-3 px-2"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: Math.max(22, list.length * 2.2), repeat: Infinity, ease: "linear" }}
        >
          {doubled.map((src, i) => (
            <motion.a
              key={`${src}-${i}`}
              href={gatewayHref}
              whileHover={{ y: -4, scale: 1.03 }}
              className="group shrink-0 overflow-hidden rounded-xl border border-brand-accent/15 bg-brand-card"
            >
              <div className="media-contain-frame h-[120px] w-[176px] p-2">
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
        </motion.div>
      </div>
    </motion.section>
  );
}
