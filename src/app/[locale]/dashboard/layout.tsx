import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppFooter } from "@/shared/components/app-footer";
import { AppHeader } from "@/shared/components/app-header";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";
import { isAccountFrozen } from "@/shared/lib/supabase/is-account-frozen";

export const dynamic = "force-dynamic";

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function DashboardLayout({ children, params }: Props) {
  const { locale } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}`);
  }

  if (await isAccountFrozen(supabase, user.id)) {
    await supabase.auth.signOut();
    redirect(`/${locale}?account=frozen`);
  }

  const metaEmail =
    typeof user.user_metadata?.email === "string"
      ? user.user_metadata.email
      : "";
  const email = user.email?.trim() || metaEmail.trim() || "—";

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = profile?.role === "admin";

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader userEmail={email} isAdmin={isAdmin} />
      <main className="flex-1 px-4 md:px-8">{children}</main>
      <div className="mt-20 md:mt-28">
        <AppFooter />
      </div>
    </div>
  );
}
