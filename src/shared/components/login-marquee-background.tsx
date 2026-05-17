"use client";

import unionMarqueeImg from "@/logo/Union.png";

const ROW_COUNT = 18;
const ITEMS_PER_ROW = 10;

type RowProps = {
  reverse: boolean;
  durationSec: number;
};

function MarqueeRow({ reverse, durationSec }: RowProps) {
  const items = Array.from({ length: ITEMS_PER_ROW }, (_, i) => i);
  const track = [...items, ...items];

  return (
    <div className="shrink-0 overflow-hidden py-4 md:py-5">
      <div
        className="login-marquee-track flex w-max flex-nowrap items-center gap-8 md:gap-12"
        style={{
          animationDuration: `${durationSec}s`,
          animationDirection: reverse ? "reverse" : "normal",
        }}
      >
        {track.map((key, index) => (
          // eslint-disable-next-line @next/next/no-img-element -- decorative tiled background (many instances)
          <img
            key={`${key}-${index}`}
            src={unionMarqueeImg.src}
            alt=""
            width={140}
            height={40}
            decoding="async"
            className="h-8 w-auto max-w-[140px] shrink-0 object-contain md:h-9"
            draggable={false}
          />
        ))}
      </div>
    </div>
  );
}

export function LoginMarqueeBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 h-[100dvh] w-full overflow-hidden opacity-50"
      aria-hidden
    >
      <div className="flex h-full w-full flex-col justify-evenly">
        {Array.from({ length: ROW_COUNT }, (_, i) => (
          <MarqueeRow
            key={i}
            reverse={i % 2 === 1}
            durationSec={40 + (i % 5) * 8}
          />
        ))}
      </div>
    </div>
  );
}
