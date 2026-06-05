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
          transition={{ delay: i * 0.05 }}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-5 text-center"
        >
          <div className="text-2xl font-bold text-lime-300">{s.value}</div>
          <div className="mt-1 text-xs text-zinc-500">{s.label}</div>
        </motion.div>
      ))}
    </div>
  );
}
