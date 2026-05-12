/** Шляхи без префікса локалі (next-intl). */
export type DashboardNavItem = {
  href: string;
  labelKey:
    | "dashboard"
    | "generator"
    | "seo"
    | "buyDomain"
    | "usage"
    | "users"
    | "settings";
  /** Якщо true — пункт показується лише для role === admin */
  adminOnly?: boolean;
};

export const DASHBOARD_NAV: readonly DashboardNavItem[] = [
  { href: "/dashboard", labelKey: "dashboard" },
  { href: "/dashboard/generator", labelKey: "generator" },
  { href: "/dashboard/seo", labelKey: "seo" },
  { href: "/dashboard/domain", labelKey: "buyDomain" },
  { href: "/dashboard/usage", labelKey: "usage" },
  { href: "/dashboard/users", labelKey: "users", adminOnly: true },
  { href: "/dashboard/settings", labelKey: "settings" },
];
