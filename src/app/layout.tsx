import type { ReactNode } from "react";
import "./globals.css";

/**
 * Root layout: Next.js requires this file; locale-specific `lang` lives in `[locale]/layout`.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
