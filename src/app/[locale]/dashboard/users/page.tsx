import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";
import { UsersAdminTable, type ProfileAdminRow } from "./users-admin-table";

export const dynamic = "force-dynamic";

export default async function DashboardUsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("users");
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

  const { data: profilesRaw, error } = await supabase
    .from("profiles")
    .select(
      "seq_no,id,email,display_name,role,is_frozen,account_frozen_at,account_frozen_reason,created_at,updated_at"
    )
    .order("seq_no", { ascending: true });

  return (
    <div className="min-h-full py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-union-text">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-union-muted">{t("subtitle")}</p>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {t("loadError")}: {error.message}
          </div>
        ) : (
          <UsersAdminTable
            currentUserId={user.id}
            initialProfiles={(profilesRaw ?? []) as ProfileAdminRow[]}
          />
        )}
      </div>
    </div>
  );
}
