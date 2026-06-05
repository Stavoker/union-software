import { motion } from "framer-motion";

type Props = {
  title?: string;
  images: string[];
  gatewayHref: string;
};

export function SlotGrid({ title = "Популярные слоты", images, gatewayHref }: Props) {
  const list = (Array.isArray(images) ? images : []).slice(0, 12);
  return (
    <section id="lw-games" className="space-y-4">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {list.map((src, i) => (
          <motion.a
            key={`${src}-${i}`}
            href={gatewayHref}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.03 }}
            className="group overflow-hidden rounded-xl border border-white/10 bg-white/5"
          >
            <img
              src={src.startsWith("./") ? src : `./img/${src}`}
              alt=""
              width={168}
              height={112}
              loading="lazy"
              className="h-[112px] w-full max-w-[168px] object-cover object-center"
            />
          </motion.a>
        ))}
      </div>
    </section>
  );
}
