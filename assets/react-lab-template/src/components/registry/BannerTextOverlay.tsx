type Variant = "hero" | "slider" | "cta";

/**
 * Затемнення баннера під текст. Різна інтенсивність:
 * - hero: помірне+ (текст зліва читається, банер справа видно)
 * - slider: легке (банер має читатися)
 * - cta: легке рівномірне (центрований текст, фон видно)
 */
export function BannerTextOverlay({ variant = "hero" }: { variant?: Variant }) {
  if (variant === "slider") {
    return (
      <>
        <div className="absolute inset-0 bg-black/15" aria-hidden />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/28 to-black/5"
          aria-hidden
        />
      </>
    );
  }

  if (variant === "cta") {
    return (
      <>
        <div className="absolute inset-0 bg-black/30" aria-hidden />
        <div
          className="absolute inset-0 bg-gradient-to-r from-black/52 via-black/42 to-black/52"
          aria-hidden
        />
      </>
    );
  }

  return (
    <>
      <div className="absolute inset-0 bg-black/32" aria-hidden />
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/55 to-black/28"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-r from-black/72 via-black/48 to-black/22"
        aria-hidden
      />
    </>
  );
}
