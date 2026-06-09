import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  title?: string;
  intro?: string;
  images: string[];
  gatewayHref?: string;
  ctaLabel?: string;
  autoplayMs?: number;
};

function resolveSrc(src: string) {
  return src.startsWith("./") ? src : `./img/${src}`;
}

export function PosterSlider({
  title = "Акции и бонусы",
  intro,
  images,
  gatewayHref = "#",
  ctaLabel = "Подробнее",
  autoplayMs = 5200,
}: Props) {
  const list = (Array.isArray(images) ? images : []).slice(0, 8);
  const [index, setIndex] = useState(0);

  const go = useCallback(
    (delta: number) => {
      if (!list.length) return;
      setIndex((i) => (i + delta + list.length) % list.length);
    },
    [list.length]
  );

  useEffect(() => {
    if (list.length < 2) return;
    const id = window.setInterval(() => go(1), autoplayMs);
    return () => window.clearInterval(id);
  }, [autoplayMs, go, list.length]);

  if (!list.length) return null;

  const active = list[index];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4"
    >
      <h2 className="text-2xl font-semibold text-brand-text">{title}</h2>
      {intro ? (
        <p className="max-w-3xl text-sm leading-relaxed text-brand-muted md:text-base">{intro}</p>
      ) : null}

      <div className="relative overflow-hidden rounded-2xl border border-brand-accent/15 bg-brand-block">
        <div className="media-contain-frame aspect-[16/9] md:aspect-[21/9]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.a
              key={active}
              href={gatewayHref}
              initial={{ opacity: 0, x: 28, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -28, scale: 0.98 }}
              transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
              className="flex h-full w-full items-center justify-center p-3 md:p-5"
            >
              <img
                src={resolveSrc(active)}
                alt=""
                width={960}
                height={410}
                loading="lazy"
                className="max-h-full max-w-full object-contain"
              />
            </motion.a>
          </AnimatePresence>
        </div>

        {list.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-brand-accent/25 bg-brand-bg/80 text-brand-text backdrop-blur-sm transition-colors hover:border-brand-accent/50 hover:text-brand-accent"
              aria-label="Предыдущий слайд"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-brand-accent/25 bg-brand-bg/80 text-brand-text backdrop-blur-sm transition-colors hover:border-brand-accent/50 hover:text-brand-accent"
              aria-label="Следующий слайд"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
            <div className="absolute bottom-3 left-0 right-0 z-10 flex justify-center gap-2">
              {list.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={`h-2 rounded-full transition-all ${
                    i === index ? "w-6 bg-brand-accent" : "w-2 bg-brand-muted/50 hover:bg-brand-muted"
                  }`}
                  aria-label={`Слайд ${i + 1}`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="flex justify-center md:justify-start">
        <motion.a
          href={gatewayHref}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          className="btn-brand px-6 py-2.5 text-sm"
        >
          {ctaLabel}
        </motion.a>
      </div>
    </motion.section>
  );
}
