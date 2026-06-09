import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
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
  Menu,
  X,
} from "lucide-react";
import { GATEWAY_URL, BRAND_NAME, LOGO_SRC, LAYOUT_CHROME_STYLE, SITE_LAYOUT, siteRoutes } from "../lib/site-routes";
import {
  parseHeaderChromeStyle,
  parseSidebarChromeStyle,
  type SidebarChromeStyle,
} from "../lib/layout-chrome-style";
import { SiteFooter } from "./SiteFooter";

const sidebarChrome = parseSidebarChromeStyle(
  SITE_LAYOUT.startsWith("sidebar") ? LAYOUT_CHROME_STYLE : undefined
);
const headerChrome = parseHeaderChromeStyle(
  SITE_LAYOUT.startsWith("top-nav") ? LAYOUT_CHROME_STYLE : undefined
);

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

function GatewayCtas({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <a
        href={GATEWAY_URL}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-brand-accent/30 px-4 py-2 text-sm font-medium text-brand-text hover:bg-brand-block"
      >
        <LogIn className="h-4 w-4" aria-hidden />
        Вход
      </a>
      <a href={GATEWAY_URL} className="btn-brand gap-2 px-4 py-2 text-sm">
        <UserPlus className="h-4 w-4" aria-hidden />
        Регистрация
      </a>
    </div>
  );
}

function TopNavLinks({
  className = "",
  itemClassName = "rounded-lg px-3 py-2",
}: {
  className?: string;
  itemClassName?: string;
}) {
  return (
    <nav className={className} aria-label="Основное меню">
      {siteRoutes.map((r) => (
        <NavLink
          key={r.path}
          to={r.path}
          end={r.path === "/"}
          className={({ isActive }) =>
            `whitespace-nowrap text-sm font-medium transition-colors ${itemClassName} ${
              isActive
                ? "bg-brand-accent/12 text-brand-accent"
                : "text-brand-muted hover:bg-brand-block hover:text-brand-text"
            }`
          }
        >
          {r.navLabel}
        </NavLink>
      ))}
    </nav>
  );
}

function TopNavLayout({ children, inline = false }: Props & { inline?: boolean }) {
  const hc = headerChrome;
  return (
    <div className="min-h-screen bg-brand-bg text-brand-text">
      <header
        className={`sticky top-0 z-50 ${hc.headerBg} ${hc.borderBottom ? "border-b border-brand-accent/15" : ""} ${hc.blur ? "backdrop-blur-md" : ""}`}
      >
        <div className={`mx-auto flex ${hc.height} ${hc.maxWidth} items-center gap-4 px-4 lg:px-8`}>
          <NavLink to="/" className="flex shrink-0 items-center" aria-label={BRAND_NAME}>
            <img src={LOGO_SRC} alt="" className="site-brand-logo" width={140} height={32} />
          </NavLink>

          <TopNavLinks
            className={`hidden min-w-0 flex-1 items-center overflow-x-auto md:flex ${hc.navGap} ${
              inline || hc.navAlign === "start"
                ? "justify-start"
                : hc.navAlign === "end"
                  ? "justify-end"
                  : "justify-center"
            }`}
            itemClassName={`${hc.navItemRadius} ${hc.navItemPadding}`}
          />

          <GatewayCtas className={`ml-auto hidden shrink-0 sm:flex ${hc.ctaGap}`} />
        </div>
      </header>

      <motion.main
        key={typeof window !== "undefined" ? window.location.pathname : "main"}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mx-auto max-w-6xl px-4 py-6 lg:px-8"
      >
        {children}
      </motion.main>
      <SiteFooter />
    </div>
  );
}

function SidebarNavLinks({
  onNavigate,
  style,
}: {
  onNavigate?: () => void;
  style: SidebarChromeStyle;
}) {
  return (
    <>
      {siteRoutes.map((r) => {
        const Icon = routeIcon(r.path);
        return (
          <NavLink
            key={`side-${r.path}`}
            to={r.path}
            end={r.path === "/"}
            title={r.navLabel}
            onClick={onNavigate}
            className={({ isActive }) =>
              `group flex items-center gap-3 border text-sm transition-all ${style.navItemRadius} ${style.navItemPadding} ${
                isActive
                  ? `border-brand-accent/25 ${style.activeNavBg} text-brand-accent`
                  : "border-transparent text-brand-muted hover:border-brand-accent/15 hover:bg-brand-block hover:text-brand-text"
              }`
            }
          >
            <span
              className={`flex shrink-0 items-center justify-center ${style.iconBoxSize} ${style.iconBoxRadius} ${
                r.path === "/"
                  ? "bg-brand-accent/12 text-brand-accent"
                  : `${style.iconBoxBg} text-brand-muted group-hover:text-brand-text`
              }`}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span className="line-clamp-2 leading-snug xl:inline">{r.navLabel}</span>
          </NavLink>
        );
      })}
    </>
  );
}

function SidebarLayout({
  children,
  side = "left",
  style = sidebarChrome,
}: Props & { side?: "left" | "right"; style?: SidebarChromeStyle }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isRight = side === "right";

  const desktopAside = (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col lg:flex ${style.widthCompactClass} ${style.widthExpandedClass} ${style.asideBg} ${
        isRight ? `border-l ${style.asideBorder}` : `border-r ${style.asideBorder}`
      }`}
    >
      <div className={`border-b border-brand-accent/15 px-4 ${style.logoPadding}`}>
        <NavLink to="/" className="block" aria-label={BRAND_NAME}>
          <img src={LOGO_SRC} alt="" className="site-brand-logo mx-auto xl:mx-0" width={140} height={32} />
        </NavLink>
      </div>

      <nav
        className={`flex flex-1 flex-col overflow-y-auto p-2 xl:p-3 ${style.navGap}`}
        aria-label="Боковое меню"
      >
        <SidebarNavLinks style={style} />
      </nav>

      <div className="space-y-2 border-t border-brand-accent/15 p-2 xl:p-3">
        <a
          href={GATEWAY_URL}
          className={`flex h-10 w-full items-center justify-center border border-brand-accent/25 text-brand-text hover:bg-brand-block xl:justify-start xl:gap-2 xl:px-3 ${style.ctaRadius}`}
          title="Вход"
        >
          <LogIn className="h-4 w-4 shrink-0" aria-hidden />
          <span className="hidden text-sm xl:inline">Вход</span>
        </a>
        <a
          href={GATEWAY_URL}
          className={`btn-brand h-10 w-full gap-2 px-3 text-sm xl:justify-start ${style.ctaRadius}`}
          title="Регистрация"
        >
          <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
          <span className="hidden text-sm xl:inline">Регистрация</span>
        </a>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text">
      <header className="sticky top-0 z-50 border-b border-brand-accent/15 bg-brand-bg/95 backdrop-blur-md lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <NavLink to="/" className="flex shrink-0 items-center" aria-label={BRAND_NAME}>
            <img src={LOGO_SRC} alt="" className="site-brand-logo" width={120} height={32} />
          </NavLink>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-brand-accent/20 text-brand-text"
            aria-label={mobileOpen ? "Закрыть меню" : "Открыть меню"}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-brand-bg/80 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <motion.aside
              initial={{ x: isRight ? "100%" : "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: isRight ? "100%" : "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className={`flex h-full w-[min(18rem,88vw)] flex-col bg-brand-card p-3 ${
                isRight ? "ml-auto border-l border-brand-accent/15" : "border-r border-brand-accent/15"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <nav className={`flex flex-1 flex-col overflow-y-auto ${style.navGap}`} aria-label="Мобильное меню">
                <SidebarNavLinks onNavigate={() => setMobileOpen(false)} style={style} />
              </nav>
              <div className="space-y-2 border-t border-brand-accent/15 pt-3">
                <GatewayCtas className="flex-col [&_a]:w-full [&_a]:justify-center" />
              </div>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className={`flex min-h-screen ${isRight ? "flex-row-reverse" : ""}`}>
        {desktopAside}

        <div className="min-w-0 flex-1">
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

export function SiteLayout({ children }: Props) {
  switch (SITE_LAYOUT) {
    case "top-nav-inline":
      return <TopNavLayout inline>{children}</TopNavLayout>;
    case "top-nav":
      return <TopNavLayout>{children}</TopNavLayout>;
    case "sidebar-right":
      return <SidebarLayout side="right">{children}</SidebarLayout>;
    default:
      return <SidebarLayout side="left">{children}</SidebarLayout>;
  }
}
