"use client";

import Image from "next/image";

import unionMarqueeImg from "@/logo/Union.png";

const MARQUEE_ITEMS = 14;

export function FooterMarquee() {
  const items = Array.from({ length: MARQUEE_ITEMS }, (_, i) => i);
  const track = [...items, ...items];

  return (
    <div
      className="relative h-14 shrink-0 overflow-hidden"
      aria-hidden
    >
      <div className="footer-marquee-track flex h-full w-max items-center gap-10 px-4">
        {track.map((key, index) => (
          <Image
            key={`${key}-${index}`}
            src={unionMarqueeImg}
            alt=""
            width={140}
            height={36}
            sizes="140px"
            className="h-8 w-auto max-w-[140px] shrink-0 object-contain opacity-85"
            draggable={false}
          />
        ))}
      </div>
    </div>
  );
}
