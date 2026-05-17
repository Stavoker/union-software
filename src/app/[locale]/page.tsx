import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { LocaleSwitcher } from "@/shared/components/locale-switcher";
import { LoginMarqueeBackground } from "@/shared/components/login-marquee-background";
import { LoginForm } from "@/shared/components/login-form";
import { UnionLogo } from "@/shared/components/union-logo";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ account?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_frozen")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.is_frozen) {
      await supabase.auth.signOut();
      redirect(`/${locale}?account=frozen`);
    }
    redirect(`/${locale}/dashboard`);
  }

  const t = await getTranslations("login");
  const meta = await getTranslations("meta");

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden">
      <LoginMarqueeBackground />
      <header className="relative z-10 flex items-center justify-between px-6 py-6 md:px-10">
        <div className="flex items-center gap-3">
          <UnionLogo priority />
          <span className="text-sm font-semibold tracking-tight text-union-text">
            {meta("title")}
          </span>
        </div>
        <LocaleSwitcher />
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-6 pt-6 md:px-10">
        <div className="w-full max-w-[420px] rounded-2xl border border-union-border bg-union-surface/70 p-8 shadow-[0_24px_80px_-32px_rgb(0_0_0_/_0.85)] backdrop-blur-xl">
          <div className="mb-8 space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-union-text">
              {t("heading")}
            </h1>
            <p className="text-sm text-union-muted">{t("subtitle")}</p>
            <p className="text-xs text-union-muted/80">{t("language")}</p>
          </div>
          {sp.account === "frozen" ? (
            <p className="mb-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              {t("accountFrozen")}
            </p>
          ) : null}
          <LoginForm />
        </div>
      </main>

    </div>
  );
}
