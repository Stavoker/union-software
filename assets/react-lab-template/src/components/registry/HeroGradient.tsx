import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  title: string;
  eyebrow?: string;
  /** Статичный абзац под заголовком (2–4 предложения). */
  body?: string;
  /** Короткий теглайн. Несколько фраз через «|» — плавная ротация. */
  subtitle?: string;
  /** Альтернатива subtitle: массив ротируемых строк. */
  highlights?: string[];
  backgroundImage?: string;
  /** 2+ баннера — слайдер фона вместо одного изображения */
  images?: string[];
  ctaLabel?: string;
  ctaHref?: string;
  reverse?: boolean;
};

function resolveSrc(src: string) {
  return src.startsWith("./") ? src : `./img/${src}`;
}

function parseRotatingLines(subtitle?: string, highlights?: string[]) {
  if (Array.isArray(highlights) && highlights.length) {
    return highlights.map((s) => String(s).trim()).filter(Boolean).slice(0, 6);
  }
  const raw = String(subtitle || "").trim();
  if (!raw) return [];
  if (raw.includes("|")) {
    return raw
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
  }
  return [raw];
}

function HeroBackground({ images, index }: { images: string[]; index: number }) {
  const list = images.slice(0, 6);

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
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1.06 }}
        exit={{ opacity: 0, scale: 1.02 }}
        transition={{ opacity: { duration: 0.45 }, scale: { duration: 12, ease: "linear" } }}
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
    </AnimatePresence>
  );
}

function HeroSliderControls({
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
        aria-label="Предыдущий баннер"
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
            aria-label={`Баннер ${i + 1}`}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onNext}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-black/40 text-white backdrop-blur-sm"
        aria-label="Следующий баннер"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

export function HeroGradient({
  title,
  eyebrow,
  body,
  subtitle,
  highlights,
  backgroundImage,
  images = [],
  ctaLabel = "Регистрация",
  ctaHref = "#",
  reverse = false,
}: Props) {
  const sliderImages =
    images.length > 0 ? images : backgroundImage ? [backgroundImage] : [];

  const list = sliderImages.slice(0, 6);
  const rotatingLines = useMemo(
    () => parseRotatingLines(subtitle, highlights),
    [subtitle, highlights]
  );
  const [index, setIndex] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);

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

  useEffect(() => {
    if (rotatingLines.length < 2) return;
    const id = window.setInterval(() => {
      setLineIndex((i) => (i + 1) % rotatingLines.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, [rotatingLines.length]);

  const overlayClass = reverse
    ? "bg-gradient-to-t from-black/85 via-black/50 to-black/30 md:bg-gradient-to-l md:from-black/80 md:via-black/45 md:to-transparent"
    : "bg-gradient-to-t from-black/85 via-black/50 to-black/30 md:bg-gradient-to-r md:from-black/80 md:via-black/45 md:to-transparent";

  const activeLine = rotatingLines[lineIndex % rotatingLines.length] || "";

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative min-h-[360px] overflow-hidden rounded-3xl border border-brand-accent/15 md:min-h-[480px]"
    >
      <HeroBackground images={sliderImages} index={index} />

      <div className={`absolute inset-0 ${overlayClass}`} aria-hidden />

      <div
        className={`relative z-10 flex min-h-[360px] flex-col justify-end p-6 md:min-h-[480px] md:justify-center md:p-8 lg:p-10 ${
          reverse ? "items-end text-right" : "items-start text-left"
        }`}
      >
        <div className={`max-w-xl space-y-4 ${reverse ? "md:ml-auto" : ""}`}>
          {eyebrow ? (
            <motion.span
              animate={{ opacity: [0.82, 1, 0.82] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              className={`inline-block w-fit rounded-full border border-brand-accent/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-accent ${
                reverse ? "ml-auto" : ""
              }`}
            >
              {eyebrow}
            </motion.span>
          ) : null}
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="text-3xl font-bold tracking-tight text-white md:text-4xl"
          >
            {title}
          </motion.h1>
          {body?.trim() ? (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.12 }}
              className="max-w-lg text-base leading-relaxed text-white/90 md:text-lg"
            >
              {body.trim()}
            </motion.p>
          ) : null}
          {activeLine ? (
            <div className="min-h-[2.5rem] md:min-h-[3rem]">
              <AnimatePresence mode="wait">
                <motion.p
                  key={activeLine}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35 }}
                  className="text-base leading-relaxed text-white/85 md:text-lg"
                >
                  {activeLine}
                </motion.p>
              </AnimatePresence>
            </div>
          ) : null}
          <motion.a
            href={ctaHref}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            className={`btn-brand mt-2 inline-flex px-6 py-2.5 text-sm ${reverse ? "ml-auto" : ""}`}
          >
            {ctaLabel}
          </motion.a>
        </div>
      </div>

      {list.length > 1 ? (
        <HeroSliderControls
          count={list.length}
          index={index}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          onSelect={setIndex}
        />
      ) : null}
    </motion.section>
  );
}
