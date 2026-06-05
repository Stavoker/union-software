import { motion } from "framer-motion";

type Props = {
  title: string;
  body: string;
  imageSrc?: string;
  imageAlt?: string;
  reverse?: boolean;
};

export function ContentSplit({
  title,
  body,
  imageSrc = "./img/logo.png",
  imageAlt = "",
  reverse = false,
}: Props) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      className={`grid items-center gap-8 md:grid-cols-2 ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}
    >
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="mt-4 text-zinc-400 leading-relaxed">{body}</p>
      </div>
      <img
        src={imageSrc}
        alt={imageAlt}
        width={480}
        height={280}
        loading="lazy"
        className="mx-auto max-h-[200px] w-full max-w-md rounded-2xl object-cover"
      />
    </motion.section>
  );
}
