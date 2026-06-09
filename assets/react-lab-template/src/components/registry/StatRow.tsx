import { motion } from "framer-motion";

type Stat = { label: string; value: string };
type Props = { stats?: Stat[] };

export function StatRow({ stats = [] }: Props) {
  const list = stats.length ? stats : [
    { label: "Игроков", value: "50K+" },
    { label: "Слотов", value: "1200+" },
    { label: "Поддержка", value: "24/7" },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      {list.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 6 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          whileHover={{ y: -3, scale: 1.02 }}
          transition={{ delay: i * 0.07, type: "spring", stiffness: 280, damping: 20 }}
          className="rounded-xl border border-brand-accent/15 bg-brand-block px-4 py-5 text-center"
        >
          <motion.div
            initial={{ scale: 0.92 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            className="text-2xl font-bold text-brand-accent"
          >
            {s.value}
          </motion.div>
          <div className="mt-1 text-xs text-brand-muted">{s.label}</div>
        </motion.div>
      ))}
    </div>
  );
}
