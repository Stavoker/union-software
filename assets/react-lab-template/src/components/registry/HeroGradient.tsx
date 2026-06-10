import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BannerTextOverlay } from "./BannerTextOverlay";

type Props = {
  title: string;
  eyebrow?: string;
  /** Один абзац или несколько через «||» — ротация (макс. 3 предложения на абзац). */
  body?: string;
  /** Альтернатива body: массив ротируемых абзацев. */
  bodyParagraphs?: string[];
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

const SLIDE_MS = 5200;
const FADE_S = 0.55;

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

function parseRotatingBodies(body?: string, bodyParagraphs?: string[]) {
  if (Array.isArray(bodyParagraphs) && bodyParagraphs.length) {
    return bodyParagraphs.map((s) => String(s).trim()).filter(Boolean).slice(0, 5);
  }
  const raw = String(body || "").trim();
  if (!raw) return [];
  if (raw.includes("||")) {
    return raw
      .split("||")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
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

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {list.map((src, i) => (
        <motion.img
          key={src}
          src={resolveSrc(src)}
          alt=""
          width={1280}
          height={720}
          initial={false}
          animate={{
            opacity: i === index ? 1 : 0,
            scale: i === index ? 1.05 : 1,
          }}
          transition={{
            opacity: { duration: FADE_S, ease: "easeInOut" },
            scale: { duration: SLIDE_MS / 1000, ease: "linear" },
          }}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
          style={{ zIndex: i === index ? 1 : 0 }}
        />
      ))}
    </div>
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
  bodyParagraphs,
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
  const rotatingBodies = useMemo(
    () => parseRotatingBodies(body, bodyParagraphs),
    [body, bodyParagraphs]
  );
  const rotatingLines = useMemo(
    () => parseRotatingLines(subtitle, highlights),
    [subtitle, highlights]
  );
  const [index, setIndex] = useState(0);
  const [bodyIndex, setBodyIndex] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);

  const go = useCallback(
    (delta: number) => {
      if (!list.length) return;
      setIndex((i) => (i + delta + list.length) % list.length);
    },
    [list.length]
  );

  useEffect(() => {
    list.forEach((src) => {
      const img = new Image();
      img.src = resolveSrc(src);
    });
  }, [list]);

  useEffect(() => {
    if (list.length < 2) return;
    const id = window.setInterval(() => go(1), SLIDE_MS);
    return () => window.clearInterval(id);
  }, [go, list.length]);

  useEffect(() => {
    if (rotatingBodies.length < 2) return;
    const id = window.setInterval(() => {
      setBodyIndex((i) => (i + 1) % rotatingBodies.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, [rotatingBodies.length]);

  useEffect(() => {
    if (rotatingLines.length < 2) return;
    const id = window.setInterval(() => {
      setLineIndex((i) => (i + 1) % rotatingLines.length);
    }, 3800);
    return () => window.clearInterval(id);
  }, [rotatingLines.length]);

  const activeBody = rotatingBodies[bodyIndex % rotatingBodies.length] || "";
  const activeLine = rotatingLines[lineIndex % rotatingLines.length] || "";

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative min-h-[360px] overflow-hidden rounded-3xl border border-brand-accent/15 md:min-h-[480px]"
    >
      <HeroBackground images={sliderImages} index={index} />

      <BannerTextOverlay variant="hero" />

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
            className="text-3xl font-bold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.65)] md:text-4xl"
          >
            {title}
          </motion.h1>
          {activeBody ? (
            <div className="min-h-[4.5rem] md:min-h-[5rem]">
              <AnimatePresence mode="wait">
                <motion.p
                  key={activeBody}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35 }}
                  className="max-w-lg text-base leading-relaxed text-white/95 drop-shadow-[0_1px_8px_rgba(0,0,0,0.55)] md:text-lg"
                >
                  {activeBody}
                </motion.p>
              </AnimatePresence>
            </div>
          ) : null}
          {activeLine ? (
            <div className="min-h-[1.75rem] md:min-h-[2rem]">
              <AnimatePresence mode="wait">
                <motion.p
                  key={activeLine}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.3 }}
                  className="text-sm font-medium text-brand-accent md:text-base"
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
