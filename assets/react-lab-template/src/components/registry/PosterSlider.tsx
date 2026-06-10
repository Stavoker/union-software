import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BannerTextOverlay } from "./BannerTextOverlay";

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

function SlideBackground({ images, index }: { images: string[]; index: number }) {
  const list = images.slice(0, 8);

  if (!list.length) {
    return (
      <div
        className="absolute inset-0 bg-gradient-to-br from-brand-block via-brand-card to-brand-bg"
        aria-hidden
      />
    );
  }

  const active = list[index % list.length];

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.img
        key={active}
        src={resolveSrc(active)}
        alt=""
        width={1280}
        height={720}
        loading="lazy"
        initial={{ opacity: 0, scale: 1.03 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.4 }}
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
    </AnimatePresence>
  );
}

function SliderControls({
  count,
  index,
  onPrev,
  onNext,
  onSelect,
}: {
  count: number;
  index: number;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (i: number) => void;
}) {
  if (count < 2) return null;

  return (
    <div className="absolute bottom-4 left-0 right-0 z-20 flex items-center justify-center gap-3 px-4 md:bottom-6">
      <button
        type="button"
        onClick={onPrev}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-black/40 text-white backdrop-blur-sm"
        aria-label="Предыдущий слайд"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <div className="flex gap-1.5">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? "w-5 bg-brand-accent" : "w-1.5 bg-white/40"
            }`}
            aria-label={`Слайд ${i + 1}`}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onNext}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-black/40 text-white backdrop-blur-sm"
        aria-label="Следующий слайд"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
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

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="relative min-h-[360px] overflow-hidden rounded-3xl md:min-h-[420px]"
    >
      <SlideBackground images={list} index={index} />

      <BannerTextOverlay variant="hero" />

      <div className="relative z-10 flex min-h-[360px] flex-col justify-end p-6 md:min-h-[420px] md:justify-center md:p-8 lg:p-10">
        <div className="max-w-xl space-y-4">
          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">{title}</h2>
          {intro ? (
            <p className="text-base leading-relaxed text-white/85 md:text-lg">{intro}</p>
          ) : null}
          <a href={gatewayHref} className="btn-brand mt-2 inline-flex px-6 py-2.5 text-sm">
            {ctaLabel}
          </a>
        </div>
      </div>

      <SliderControls
        count={list.length}
        index={index}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
        onSelect={setIndex}
      />
    </motion.section>
  );
}
