/** Шляхи без префікса локалі (next-intl). */
export type DashboardNavItem = {
  href: string;
  labelKey:
    | "dashboard"
    | "generator"
    | "brand"
    | "seo"
    | "buyDomain"
    | "usage"
    | "generatorAnalytics"
    | "users"
    | "settings";
  /** Якщо true — пункт показується лише для role === admin */
  adminOnly?: boolean;
  /** Якщо true — пункт показується лише для звичайних користувачів (не admin) */
  userOnly?: boolean;
};

export const DASHBOARD_NAV: readonly DashboardNavItem[] = [
  { href: "/dashboard", labelKey: "dashboard" },
  { href: "/dashboard/generator", labelKey: "generator" },
  { href: "/dashboard/brand", labelKey: "brand", userOnly: true },
  { href: "/dashboard/seo", labelKey: "seo" },
  { href: "/dashboard/domain", labelKey: "buyDomain" },
  { href: "/dashboard/usage", labelKey: "usage" },
  { href: "/dashboard/generator-analytics", labelKey: "generatorAnalytics", adminOnly: true },
  { href: "/dashboard/users", labelKey: "users", adminOnly: true },
  { href: "/dashboard/settings", labelKey: "settings" },
];
