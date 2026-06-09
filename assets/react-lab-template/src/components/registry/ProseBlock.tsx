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
      className="space-y-4"
    >
      {title ? <h2 className="text-2xl font-semibold">{title}</h2> : null}
      <div className="space-y-4">
        {paragraphs.map((p, i) => (
          <motion.p
            key={p.slice(0, 48)}
            initial={{ opacity: 0, y: 6 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06, duration: 0.35 }}
            className="text-sm leading-relaxed text-brand-muted md:text-base"
          >
            {p}
          </motion.p>
        ))}
      </div>
    </motion.section>
  );
}
