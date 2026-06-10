type Variant = "hero" | "cta";

/**
 * Двошарове затемнення поверх баннера — текст читається на яскравих зображеннях.
 */
export function BannerTextOverlay({ variant = "hero" }: { variant?: Variant }) {
  if (variant === "cta") {
    return (
      <>
        <div className="absolute inset-0 bg-black/55" aria-hidden />
        <div
          className="absolute inset-0 bg-gradient-to-r from-black/92 via-black/78 to-black/70"
          aria-hidden
        />
      </>
    );
  }

  return (
    <>
      <div className="absolute inset-0 bg-black/55" aria-hidden />
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/70 to-black/50"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-r from-black/82 via-black/58 to-black/48"
        aria-hidden
      />
    </>
  );
}
