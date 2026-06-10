type Variant = "hero" | "slider" | "cta";

/**
 * Затемнення баннера під текст. Різна інтенсивність:
 * - hero: помірне (текст зліва, банер частково видно)
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
      <div className="absolute inset-0 bg-black/25" aria-hidden />
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/48 to-black/22"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-r from-black/62 via-black/38 to-black/18"
        aria-hidden
      />
    </>
  );
}
