import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

type ProfileRow = {
  seq_no: number;
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  params: Promise<{ locale: string }>;
};

export const dynamic = "force-dynamic";

export default async function DashboardUsersPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations("users");
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}`);
  }

  const { data: profilesRaw, error } = await supabase
    .from("profiles")
    .select("seq_no,id,email,display_name,created_at,updated_at")
    .order("seq_no", { ascending: true });

  const profiles = (profilesRaw ?? []) as ProfileRow[];

  return (
    <div className="min-h-full px-6 py-10 md:px-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-union-text">
              {t("title")}
            </h1>
            <p className="mt-1 text-sm text-union-muted">{t("subtitle")}</p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-union-border bg-white/[0.04] px-4 py-2 text-sm text-union-text transition-colors hover:bg-white/[0.07]"
          >
            {t("backHome")}
          </Link>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {t("loadError")}: {error.message}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-union-border bg-union-surface/60 backdrop-blur-xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-union-border bg-black/20 text-union-muted">
                    <th className="w-16 px-4 py-3 font-medium tabular-nums">
                      {t("colNo")}
                    </th>
                    <th className="px-4 py-3 font-medium">{t("colEmail")}</th>
                    <th className="px-4 py-3 font-medium">{t("colDisplayName")}</th>
                    <th className="px-4 py-3 font-medium">{t("colCreated")}</th>
                    <th className="px-4 py-3 font-medium font-mono text-xs">
                      id (uuid)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-8 text-center text-union-muted"
                        colSpan={5}
                      >
                        {t("empty")}
                      </td>
                    </tr>
                  ) : (
                    profiles.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-union-border/80 transition-colors hover:bg-white/[0.03]"
                      >
                        <td className="px-4 py-3 font-mono tabular-nums text-union-muted">
                          {row.seq_no ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-union-text">
                          {row.email ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-union-text">
                          {row.display_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-union-muted tabular-nums">
                          {formatDate(row.created_at)}
                        </td>
                        <td className="max-w-[280px] truncate px-4 py-3 font-mono text-xs text-union-muted">
                          {row.id}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}
