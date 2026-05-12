"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { DASHBOARD_NAV } from "@/shared/config/nav";
import { LocaleSwitcher } from "@/shared/components/locale-switcher";
import { UnionLogo } from "@/shared/components/union-logo";
import { UserMenu } from "@/shared/components/user-menu";

function navActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppHeader({
  userEmail,
  isAdmin,
}: {
  userEmail: string;
  isAdmin: boolean;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname() ?? "";

  const navItems = DASHBOARD_NAV.filter((item) => !item.adminOnly || isAdmin);

  return (
    <header className="sticky top-0 z-40 border-b border-union-border bg-union-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-2.5"
          >
            <UnionLogo />
            <span className="text-sm font-semibold tracking-tight text-union-text">
              Union
            </span>
          </Link>

          <nav
            className="-mx-1 flex gap-1 overflow-x-auto pb-1 scrollbar-thin md:pb-0"
            aria-label="Main"
          >
            {navItems.map(({ href, labelKey }) => {
              const active = navActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-union-accent font-medium text-union-accent-fg"
                      : "text-union-muted hover:bg-white/[0.06] hover:text-union-text"
                  }`}
                >
                  {t(labelKey)}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3">
          <LocaleSwitcher />
          <UserMenu email={userEmail} />
        </div>
      </div>
    </header>
  );
}
