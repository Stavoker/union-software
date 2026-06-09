import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  title: string;
  eyebrow?: string;
  /** Одна короткая строка (теглайн). Длинные абзацы — только в ProseBlock ниже hero. */
  subtitle?: string;
  backgroundImage?: string;
  /** 2+ баннера — слайдер справа вместо одного изображения */
  images?: string[];
  ctaLabel?: string;
  ctaHref?: string;
  reverse?: boolean;
};

function resolveSrc(src: string) {
  return src.startsWith("./") ? src : `./img/${src}`;
}

function HeroImagePanel({ images }: { images: string[] }) {
  const list = images.slice(0, 6);
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
    const id = window.setInterval(() => go(1), 4800);
    return () => window.clearInterval(id);
  }, [go, list.length]);

  if (!list.length) {
    return <div className="aspect-[4/3] w-full rounded-2xl bg-brand-block" aria-hidden />;
  }

  const active = list[index];

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-brand-accent/15 bg-brand-block">
      <AnimatePresence mode="wait" initial={false}>
        <motion.img
          key={active}
          src={resolveSrc(active)}
          alt=""
          width={640}
          height={480}
          initial={{ opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.4 }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </AnimatePresence>

      {list.length > 1 ? (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-brand-accent/25 bg-brand-bg/80 text-brand-text backdrop-blur-sm"
            aria-label="Предыдущий баннер"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-brand-accent/25 bg-brand-bg/80 text-brand-text backdrop-blur-sm"
            aria-label="Следующий баннер"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <div className="absolute bottom-2 left-0 right-0 z-10 flex justify-center gap-1.5">
            {list.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-5 bg-brand-accent" : "w-1.5 bg-brand-muted/50"
                }`}
                aria-label={`Баннер ${i + 1}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function HeroGradient({
  title,
  eyebrow,
  subtitle,
  backgroundImage,
  images = [],
  ctaLabel = "Регистрация",
  ctaHref = "#",
  reverse = false,
}: Props) {
  const sliderImages =
    images.length > 0
      ? images
      : backgroundImage
        ? [backgroundImage]
        : [];

  const textCol = (
    <div className="flex flex-col justify-center space-y-4 p-6 md:p-8 lg:p-10">
      {eyebrow ? (
        <span className="inline-block w-fit rounded-full border border-brand-accent/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-accent">
          {eyebrow}
        </span>
      ) : null}
      <h1 className="text-3xl font-bold tracking-tight text-brand-text md:text-4xl">{title}</h1>
      {subtitle ? (
        <p className="max-w-xl text-base leading-relaxed text-brand-muted md:text-lg">{subtitle}</p>
      ) : null}
      <a href={ctaHref} className="btn-brand mt-2 w-fit px-6 py-2.5 text-sm">
        {ctaLabel}
      </a>
    </div>
  );

  const mediaCol = (
    <div className="p-4 md:p-6 lg:p-8">
      <HeroImagePanel images={sliderImages} />
    </div>
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-3xl border border-brand-accent/15 bg-gradient-to-br from-brand-block via-brand-card to-brand-bg"
    >
      <div
        className={`grid items-stretch md:grid-cols-2 ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}
      >
        {textCol}
        {mediaCol}
      </div>
    </motion.section>
  );
}
