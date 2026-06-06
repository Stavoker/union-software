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
  imageSrc = "./img/logo.png",
  imageAlt = "",
  reverse = false,
}: Props) {
  const blocks = paragraphs.length ? paragraphs : body ? [body] : [];

  return (
    <motion.section
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      className={`grid items-center gap-8 md:grid-cols-2 ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}
    >
      <div>
        <h2 className="text-2xl font-semibold text-brand-text">{title}</h2>
        <div className="mt-4 space-y-4">
          {blocks.map((p) => (
            <p key={p.slice(0, 48)} className="leading-relaxed text-brand-muted">
              {p}
            </p>
          ))}
        </div>
      </div>
      <img
        src={imageSrc}
        alt={imageAlt}
        width={480}
        height={280}
        loading="lazy"
        className="mx-auto max-h-[200px] w-full max-w-md rounded-2xl border border-brand-accent/15 object-cover"
      />
    </motion.section>
  );
}
