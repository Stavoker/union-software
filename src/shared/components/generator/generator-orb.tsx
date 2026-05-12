"use client";

const ORB = "#d1fe17";

/**
 * Пульсуюче коло в акценті Union (#d1fe17) з м’яким неоновим світінням.
 */
export function GeneratorOrb() {
  return (
    <div className="flex justify-center py-12 md:py-16" aria-hidden>
      <div
        className="relative h-[min(44vw,220px)] w-[min(44vw,220px)] rounded-full"
        style={{
          background: `radial-gradient(circle at 32% 28%, #e8ff4a 0%, ${ORB} 42%, #b8e814 100%)`,
          boxShadow: `
            0 0 36px 10px rgb(209 254 23 / 0.5),
            0 0 72px 16px rgb(209 254 23 / 0.22),
            inset 0 0 26px rgb(255 255 255 / 0.28)
          `,
          animation: "gen-orb-pulse 2.4s ease-in-out infinite",
        }}
      />
    </div>
  );
}
