"use client";

const ORB = "#d1fe17";
const LAVA = "#0f1113";

/** ~50% blur strength (reference «full» ~12px). */
const BLOB_BLUR = "6px";

type BlobSpec = {
  id: string;
  w: string;
  h: string;
  left: string;
  top: string;
  anim: string;
  duration: string;
  delay: string;
};

const BLOBS: BlobSpec[] = [
  {
    id: "a",
    w: "34%",
    h: "30%",
    left: "5%",
    top: "10%",
    anim: "gen-lava-1",
    duration: "11s",
    delay: "-1.2s",
  },
  {
    id: "b",
    w: "32%",
    h: "32%",
    left: "64%",
    top: "8%",
    anim: "gen-lava-2",
    duration: "13s",
    delay: "-4s",
  },
  {
    id: "c",
    w: "30%",
    h: "28%",
    left: "66%",
    top: "50%",
    anim: "gen-lava-3",
    duration: "9.5s",
    delay: "-2.5s",
  },
  {
    id: "d",
    w: "32%",
    h: "30%",
    left: "5%",
    top: "62%",
    anim: "gen-lava-4",
    duration: "12.5s",
    delay: "-6s",
  },
  {
    id: "e",
    w: "26%",
    h: "24%",
    left: "37%",
    top: "38%",
    anim: "gen-lava-5",
    duration: "10.8s",
    delay: "-0.8s",
  },
];

/**
 * Pulsing circle in Union accent (#d1fe17) with soft neon glow;
 * #0f1113 blobs drift inside (lava-lamp motion) with ~50% edge blur.
 */
export function GeneratorOrb() {
  return (
    <div className="flex justify-center py-12 md:py-16" aria-hidden>
      <div
        className="relative h-[min(44vw,220px)] w-[min(44vw,220px)] overflow-hidden rounded-full"
        style={{
          boxShadow: `
            0 0 36px 10px rgb(209 254 23 / 0.5),
            0 0 72px 16px rgb(209 254 23 / 0.22),
            inset 0 0 26px rgb(255 255 255 / 0.28)
          `,
          animation: "gen-orb-pulse 2.4s ease-in-out infinite",
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 32% 28%, #e8ff4a 0%, ${ORB} 42%, #b8e814 100%)`,
          }}
        />
        {BLOBS.map((b) => (
          <div
            key={b.id}
            className="pointer-events-none absolute will-change-[transform,border-radius,filter]"
            style={{
              width: b.w,
              height: b.h,
              left: b.left,
              top: b.top,
              backgroundColor: LAVA,
              opacity: 1,
              filter: `blur(${BLOB_BLUR})`,
              animation: `${b.anim} ${b.duration} ease-in-out infinite`,
              animationDelay: b.delay,
            }}
          />
        ))}
      </div>
    </div>
  );
}
