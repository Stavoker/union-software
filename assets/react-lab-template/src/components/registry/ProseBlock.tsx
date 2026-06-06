import { motion } from "framer-motion";

type Props = {
  title?: string;
  paragraphs: string[];
};

export function ProseBlock({ title, paragraphs }: Props) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="space-y-4 rounded-2xl border border-brand-accent/15 bg-brand-block px-6 py-8 md:px-8"
    >
      {title ? <h2 className="text-2xl font-semibold">{title}</h2> : null}
      <div className="space-y-4">
        {paragraphs.map((p) => (
          <p key={p.slice(0, 48)} className="text-sm leading-relaxed text-brand-muted md:text-base">
            {p}
          </p>
        ))}
      </div>
    </motion.section>
  );
}
