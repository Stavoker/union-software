import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Home,
  Gamepad2,
  Gift,
  CreditCard,
  Star,
  Crown,
  Dices,
  Link2,
  Megaphone,
  HelpCircle,
  Headphones,
  Info,
  LayoutGrid,
  LogIn,
  UserPlus,
} from "lucide-react";
import { GATEWAY_URL, BRAND_NAME, LOGO_SRC, siteRoutes } from "../lib/site-routes";
import { SiteFooter } from "./SiteFooter";

type Props = { children: ReactNode };

const ROUTE_ICONS: Record<string, LucideIcon> = {
  "/": Home,
  reviews: Star,
  registration: UserPlus,
  payments: CreditCard,
  bonus: Gift,
  games: Gamepad2,
  vip: Crown,
  slots: Dices,
  mirror: Link2,
  promo: Megaphone,
  "faq-page": HelpCircle,
  support: Headphones,
  about: Info,
};

function routeIcon(path: string): LucideIcon {
  if (path === "/") return ROUTE_ICONS["/"];
  const slug = path.replace(/^\//, "");
  return ROUTE_ICONS[slug] || LayoutGrid;
}

export function SiteLayout({ children }: Props) {
  return (
    <div className="min-h-screen bg-brand-bg text-brand-text">
      <header className="sticky top-0 z-50 border-b border-brand-accent/15 bg-brand-bg/95 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between gap-4 pl-[4.5rem] pr-4 lg:pl-[15.5rem] lg:pr-6">
          <NavLink to="/" className="flex shrink-0 items-center lg:hidden" aria-label={BRAND_NAME}>
            <img src={LOGO_SRC} alt="" className="h-8 w-auto" width={120} height={32} />
          </NavLink>

          <div className="hidden flex-1 lg:block" aria-hidden />

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <a
              href={GATEWAY_URL}
              className="hidden min-h-[40px] items-center gap-2 rounded-full border border-brand-accent/30 px-4 py-2 text-sm font-medium text-brand-text hover:bg-brand-block sm:inline-flex"
            >
              <LogIn className="h-4 w-4" aria-hidden />
              Вход
            </a>
            <a href={GATEWAY_URL} className="btn-brand gap-2 px-4 py-2 text-sm">
              <UserPlus className="h-4 w-4" aria-hidden />
              Регистрация
            </a>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="fixed left-0 top-14 z-40 hidden h-[calc(100vh-3.5rem)] w-[4.5rem] shrink-0 flex-col border-r border-brand-accent/15 bg-brand-card lg:flex xl:w-[15.5rem]">
          <div className="hidden border-b border-brand-accent/15 px-4 py-4 xl:block">
            <NavLink to="/" className="block" aria-label={BRAND_NAME}>
              <img src={LOGO_SRC} alt="" className="h-9 w-auto max-w-[168px]" width={168} height={36} />
            </NavLink>
          </div>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2 xl:p-3" aria-label="Боковое меню">
            {siteRoutes.map((r) => {
              const Icon = routeIcon(r.path);
              return (
                <NavLink
                  key={`side-${r.path}`}
                  to={r.path}
                  end={r.path === "/"}
                  title={r.navLabel}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 rounded-xl border px-2 py-2.5 text-sm transition-all xl:px-3 ${
                      isActive
                        ? "border-brand-accent/25 bg-brand-accent/10 text-brand-accent"
                        : "border-transparent text-brand-muted hover:border-brand-accent/15 hover:bg-brand-block hover:text-brand-text"
                    }`
                  }
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      r.path === "/"
                        ? "bg-brand-accent/12 text-brand-accent"
                        : "bg-brand-block text-brand-muted group-hover:text-brand-text"
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <span className="hidden line-clamp-2 leading-snug xl:inline">{r.navLabel}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="space-y-2 border-t border-brand-accent/15 p-2 xl:p-3">
            <a
              href={GATEWAY_URL}
              className="flex h-10 w-full items-center justify-center rounded-xl border border-brand-accent/25 text-brand-text hover:bg-brand-block xl:justify-start xl:gap-2 xl:px-3"
              title="Вход"
            >
              <LogIn className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden text-sm xl:inline">Вход</span>
            </a>
            <a href={GATEWAY_URL} className="btn-brand h-10 w-full gap-2 px-3 text-sm xl:justify-start" title="Регистрация">
              <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden xl:inline">Регистрация</span>
            </a>
          </div>
        </aside>

        <div className="min-w-0 flex-1 lg:pl-[4.5rem] xl:pl-[15.5rem]">
          <motion.main
            key={typeof window !== "undefined" ? window.location.pathname : "main"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="px-4 py-6 lg:px-8"
          >
            {children}
          </motion.main>
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}
