import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { GATEWAY_URL, BRAND_NAME, siteRoutes } from "../lib/site-routes";

type Props = { children: ReactNode };

export function SiteLayout({ children }: Props) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="./img/logo.png" alt={BRAND_NAME} className="h-9 w-auto" />
            <span className="text-sm font-semibold tracking-wide">{BRAND_NAME}</span>
          </div>
          <a
            href={GATEWAY_URL}
            className="rounded-full bg-lime-400 px-4 py-2 text-sm font-semibold text-black hover:bg-lime-300"
          >
            Регистрация
          </a>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="sticky top-20 space-y-1 rounded-2xl border border-white/10 bg-white/5 p-3">
            {siteRoutes.map((r) => (
              <NavLink
                key={r.path}
                to={r.path}
                end={r.path === "/"}
                className={({ isActive }) =>
                  `block rounded-xl px-3 py-2 text-sm transition-colors ${
                    isActive ? "bg-lime-400/15 text-lime-300" : "text-zinc-300 hover:bg-white/5"
                  }`
                }
              >
                {r.navLabel}
              </NavLink>
            ))}
          </nav>
        </aside>

        <motion.main
          key={typeof window !== "undefined" ? window.location.pathname : "main"}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="min-w-0 flex-1"
        >
          {children}
        </motion.main>
      </div>

      <footer className="border-t border-white/10 py-8 text-center text-xs text-zinc-500">
        © {new Date().getFullYear()} {BRAND_NAME}
      </footer>
    </div>
  );
}
