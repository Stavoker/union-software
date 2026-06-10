import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { GeneratorAnalyticsDashboard } from "@/shared/components/admin/generator-analytics-dashboard";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GeneratorAnalyticsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("generatorAnalytics");
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}`);
  }

  const { data: me, error: meErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (meErr || me?.role !== "admin") {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <div className="space-y-6">
      <GeneratorAnalyticsDashboard />
      <p className="sr-only">{t("title")}</p>
    </div>
  );
}
