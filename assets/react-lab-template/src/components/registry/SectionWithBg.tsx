import { motion } from "framer-motion";

type Props = {
  title: string;
  body: string;
  backgroundImage?: string;
  ctaLabel?: string;
  ctaHref?: string;
  reverse?: boolean;
};

export function SectionWithBg({
  title,
  body,
  backgroundImage,
  ctaLabel,
  ctaHref,
  reverse = false,
}: Props) {
  const src = backgroundImage
    ? backgroundImage.startsWith("./")
      ? backgroundImage
      : `./img/${backgroundImage}`
    : "";

  const parts = String(body || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const lead = parts[0] || body || "";
  const rest = parts.length > 1 ? parts.slice(1) : [];

  const textCol = (
    <div className="min-w-0 space-y-4">
      <h2 className="text-2xl font-semibold text-brand-text md:text-3xl">{title}</h2>
      <p className="text-sm leading-relaxed text-brand-muted md:text-base">{lead}</p>
      {ctaLabel && ctaHref ? (
        <a href={ctaHref} className="btn-brand inline-flex px-6 py-2.5 text-sm">
          {ctaLabel}
        </a>
      ) : null}
    </div>
  );

  const imageCol = src ? (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-brand-accent/15 bg-brand-block">
      <img
        src={src}
        alt=""
        width={640}
        height={400}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  ) : (
    <div className="aspect-[16/10] w-full rounded-2xl bg-brand-block" aria-hidden />
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="space-y-6 rounded-3xl border border-brand-accent/15 bg-brand-block/40 p-6 md:p-8"
    >
      <div
        className={`grid items-start gap-6 md:grid-cols-2 ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}
      >
        {textCol}
        {imageCol}
      </div>
      {rest.length > 0 ? (
        <div className="space-y-4 border-t border-brand-accent/10 pt-6">
          {rest.map((p) => (
            <p key={p.slice(0, 48)} className="text-sm leading-relaxed text-brand-muted md:text-base">
              {p}
            </p>
          ))}
        </div>
      ) : null}
    </motion.section>
  );
}
