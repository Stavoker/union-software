import type { ReactNode } from "react";

export default function GeneratorAnalyticsLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl py-10">{children}</div>;
}
