/** Шляхи без префікса локалі (next-intl). */
export const DASHBOARD_NAV = [
  { href: "/dashboard", labelKey: "dashboard" as const },
  { href: "/dashboard/generator", labelKey: "generator" as const },
  { href: "/dashboard/seo", labelKey: "seo" as const },
  { href: "/dashboard/usage", labelKey: "usage" as const },
  { href: "/dashboard/users", labelKey: "users" as const },
  { href: "/dashboard/settings", labelKey: "settings" as const },
] as const;
