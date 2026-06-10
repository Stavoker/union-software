import { motion } from "framer-motion";
import { BannerTextOverlay } from "./BannerTextOverlay";

type Props = {
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
  backgroundImage?: string;
};

function resolveSrc(src: string) {
  return src.startsWith("./") ? src : `./img/${src}`;
}

export function CtaBanner({
  title,
  body,
  ctaLabel = "Начать",
  ctaHref = "#",
  backgroundImage,
}: Props) {
  const text =
    body?.trim() ||
    "Создайте аккаунт за пару минут, активируйте приветственный бонус и получите доступ к каталогу слотов, live-играм и быстрым выплатам.";

  return (
    <motion.aside
      initial={{ opacity: 0, scale: 0.97, y: 10 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="relative min-h-[220px] overflow-hidden rounded-2xl md:min-h-[260px]"
    >
      {backgroundImage ? (
        <img
          src={resolveSrc(backgroundImage)}
          alt=""
          width={1280}
          height={480}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
      ) : (
        <div className="absolute inset-0 bg-brand-block" aria-hidden />
      )}

      <BannerTextOverlay variant="cta" />

      <div className="relative z-10 flex min-h-[220px] flex-col items-center justify-center px-6 py-8 text-center md:min-h-[260px]">
        <h2 className="text-xl font-bold text-white md:text-2xl">{title}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/85 md:text-base">{text}</p>
        <a href={ctaHref} className="btn-brand mt-5 px-6 py-2.5 text-sm">
          {ctaLabel}
        </a>
      </div>
    </motion.aside>
  );
}
