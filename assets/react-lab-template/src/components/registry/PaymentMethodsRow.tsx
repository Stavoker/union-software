import { PAYMENT_IMAGE_PATHS } from "../../lib/site-routes";

type Props = {
  title?: string;
  intro?: string;
  images?: string[];
  /** footer — компактні чіпи; inline — для секції в main */
  variant?: "footer" | "inline";
};

export function PaymentMethodsRow({
  title,
  intro,
  images,
  variant = "inline",
}: Props) {
  const list = (images?.length ? images : PAYMENT_IMAGE_PATHS).filter(Boolean);
  if (!list.length) return null;

  const compact = variant === "footer";
  const chipClass = compact
    ? "flex h-8 w-[72px] shrink-0 items-center justify-center rounded-md border border-brand-accent/15 bg-brand-block px-1.5"
    : "flex h-11 w-[92px] shrink-0 items-center justify-center rounded-lg border border-brand-accent/15 bg-brand-block px-2";
  const imgClass = compact
    ? "max-h-[22px] max-w-[60px] object-contain"
    : "max-h-7 max-w-[76px] object-contain";

  return (
    <section className="space-y-3">
      {title ? <h2 className="text-2xl font-semibold text-brand-text">{title}</h2> : null}
      {intro ? <p className="max-w-2xl text-sm leading-relaxed text-brand-muted md:text-base">{intro}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {list.map((src) => (
          <div key={src} className={chipClass}>
            <img src={src} alt="" width={76} height={28} loading="lazy" className={imgClass} />
          </div>
        ))}
      </div>
    </section>
  );
}
