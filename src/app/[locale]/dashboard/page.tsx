import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export default async function DashboardHomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let isAdmin = false;
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    isAdmin = prof?.role === "admin";
  }

  const t = await getTranslations("dashboard");
  const tNav = await getTranslations("nav");

  const cards = [
    {
      href: "/dashboard/generator",
      navKey: "generator" as const,
      cardDescKey: "cards.generator" as const,
      adminOnly: false as const,
    },
    {
      href: "/dashboard/seo",
      navKey: "seo" as const,
      cardDescKey: "cards.seo" as const,
      adminOnly: false as const,
    },
    {
      href: "/dashboard/domain",
      navKey: "buyDomain" as const,
      cardDescKey: "cards.domain" as const,
      adminOnly: false as const,
    },
    {
      href: "/dashboard/usage",
      navKey: "usage" as const,
      cardDescKey: "cards.usage" as const,
      adminOnly: false as const,
    },
    {
      href: "/dashboard/users",
      navKey: "users" as const,
      cardDescKey: "cards.users" as const,
      adminOnly: true as const,
    },
    {
      href: "/dashboard/settings",
      navKey: "settings" as const,
      cardDescKey: "cards.settings" as const,
      adminOnly: false as const,
    },
  ].filter((c) => !c.adminOnly || isAdmin);

  return (
    <div className="py-10">
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
