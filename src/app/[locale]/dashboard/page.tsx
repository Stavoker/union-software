import { getTranslations } from "next-intl/server";

import { DashboardModuleGrid } from "@/shared/components/dashboard/dashboard-module-grid";
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

  const cards = [
    {
      id: "generator" as const,
      href: "/dashboard/generator",
      navKey: "generator" as const,
      cardDescKey: "cards.generator" as const,
      adminOnly: false as const,
    },
    {
      id: "seo" as const,
      href: "/dashboard/seo",
      navKey: "seo" as const,
      cardDescKey: "cards.seo" as const,
      adminOnly: false as const,
    },
    {
      id: "domain" as const,
      href: "/dashboard/domain",
      navKey: "buyDomain" as const,
      cardDescKey: "cards.domain" as const,
      adminOnly: false as const,
    },
    {
      id: "usage" as const,
      href: "/dashboard/usage",
      navKey: "usage" as const,
      cardDescKey: "cards.usage" as const,
      adminOnly: false as const,
    },
    {
      id: "users" as const,
      href: "/dashboard/users",
      navKey: "users" as const,
      cardDescKey: "cards.users" as const,
      adminOnly: true as const,
    },
    {
      id: "settings" as const,
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

        <DashboardModuleGrid cards={cards} />
      </div>
    </div>
  );
}
