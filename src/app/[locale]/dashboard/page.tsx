import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function DashboardHomePage() {
  const t = await getTranslations("dashboard");
  const tNav = await getTranslations("nav");

  const cards = [
    {
      href: "/dashboard/generator",
      navKey: "generator" as const,
      cardDescKey: "cards.generator" as const,
    },
    {
      href: "/dashboard/seo",
      navKey: "seo" as const,
      cardDescKey: "cards.seo" as const,
    },
    {
      href: "/dashboard/usage",
      navKey: "usage" as const,
      cardDescKey: "cards.usage" as const,
    },
    {
      href: "/dashboard/users",
      navKey: "users" as const,
      cardDescKey: "cards.users" as const,
    },
    {
      href: "/dashboard/settings",
      navKey: "settings" as const,
      cardDescKey: "cards.settings" as const,
    },
  ];

  return (
    <div className="px-4 py-10 md:px-8">
      <div className="mx-auto max-w-6xl space-y-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-union-text">
            {t("welcome")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-union-muted">
            {t("welcomeLead")}
          </p>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                className="group flex h-full flex-col rounded-2xl border border-union-border bg-union-surface/40 p-6 transition-[border-color,background-color] hover:border-union-accent/35 hover:bg-union-surface/70"
              >
                <span className="text-base font-medium text-union-text group-hover:text-union-accent">
                  {tNav(c.navKey)}
                </span>
                <span className="mt-2 flex-1 text-sm text-union-muted">
                  {t(c.cardDescKey)}
                </span>
                <span className="mt-4 text-xs font-medium text-union-accent">
                  {t("openModule")} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
