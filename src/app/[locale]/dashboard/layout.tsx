import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppHeader } from "@/shared/components/app-header";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

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

  const metaEmail =
    typeof user.user_metadata?.email === "string"
      ? user.user_metadata.email
      : "";
  const email = user.email?.trim() || metaEmail.trim() || "—";

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader userEmail={email} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
