import { motion } from "framer-motion";

type Props = {
  title?: string;
  intro?: string;
  images: string[];
  gatewayHref: string;
};

export function GameCarousel({
  title = "Популярные игры",
  intro,
  images,
  gatewayHref,
}: Props) {
  const list = (Array.isArray(images) ? images : []).slice(0, 16);
  const doubled = [...list, ...list];

  return (
    <section id="lw-games" className="space-y-4 overflow-hidden">
      <h2 className="text-2xl font-semibold text-brand-text">{title}</h2>
      {intro ? <p className="max-w-3xl text-sm leading-relaxed text-brand-muted md:text-base">{intro}</p> : null}
      <div className="relative -mx-2">
        <motion.div
          className="flex gap-3 px-2"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: Math.max(18, list.length * 2), repeat: Infinity, ease: "linear" }}
        >
          {doubled.map((src, i) => (
            <a
              key={`${src}-${i}`}
              href={gatewayHref}
              className="group shrink-0 overflow-hidden rounded-xl border border-brand-accent/15 bg-brand-card"
            >
              <img
                src={src.startsWith("./") ? src : `./img/${src}`}
                alt=""
                width={168}
                height={112}
                loading="lazy"
                className="h-[112px] w-[168px] object-cover object-center transition-transform group-hover:scale-105"
              />
            </a>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
