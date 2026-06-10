import { motion } from "framer-motion";

type Props = {
  title: string;
  body?: string;
  paragraphs?: string[];
  imageSrc?: string;
  imageAlt?: string;
  reverse?: boolean;
};

export function ContentSplit({
  title,
  body,
  paragraphs = [],
  imageSrc,
  imageAlt = "",
  reverse = false,
}: Props) {
  const blocks = paragraphs.length ? paragraphs : body ? [body] : [];
  const lead = blocks[0] || "";
  const rest = blocks.slice(1);
  const imgSrc = imageSrc
    ? imageSrc.startsWith("./")
      ? imageSrc
      : `./img/${imageSrc}`
    : "";

  const textCol = (
    <div className="flex min-h-0 flex-col justify-center">
      {lead ? (
        <p className="leading-relaxed text-brand-muted">{lead}</p>
      ) : (
        <p className="text-sm text-brand-muted">—</p>
      )}
    </div>
  );

  const imageCol = imgSrc ? (
    <motion.div
      initial={{ opacity: 0, x: reverse ? -16 : 16 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45 }}
      className="relative min-h-[10rem] w-full overflow-hidden rounded-2xl border border-brand-accent/15 bg-brand-block md:h-full md:min-h-[8rem]"
    >
      <img
        src={imgSrc}
        alt={imageAlt}
        width={480}
        height={300}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </motion.div>
  ) : (
    <div className="min-h-[10rem] w-full rounded-2xl bg-brand-block md:h-full" aria-hidden />
  );

  return (
    <motion.section
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      className="space-y-6"
    >
      <h2 className="text-2xl font-semibold text-brand-text">{title}</h2>

      <div
        className={`grid items-stretch gap-6 md:grid-cols-2 ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}
      >
        {textCol}
        {imageCol}
      </div>

      {rest.length > 0 ? (
        <div className="space-y-4 border-t border-brand-accent/10 pt-6">
          {rest.map((p) => (
            <p key={p.slice(0, 48)} className="leading-relaxed text-brand-muted">
              {p}
            </p>
          ))}
        </div>
      ) : null}
    </motion.section>
  );
}
