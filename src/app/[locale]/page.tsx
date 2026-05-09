import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/shared/components/locale-switcher";
import { LoginForm } from "@/shared/components/login-form";

export default async function LoginPage() {
  const t = await getTranslations("login");
  const meta = await getTranslations("meta");

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-6 md:px-10">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-white/[0.08]">
            <span className="text-sm font-bold tracking-tight text-union-text">
              U
            </span>
          </span>
          <span className="text-sm font-semibold tracking-tight text-union-text">
            {meta("title")}
          </span>
        </div>
        <LocaleSwitcher />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24 pt-6 md:px-10">
        <div className="w-full max-w-[420px] rounded-2xl border border-union-border bg-union-surface/70 p-8 shadow-[0_24px_80px_-32px_rgb(0_0_0_/_0.85)] backdrop-blur-xl">
          <div className="mb-8 space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-union-text">
              {t("heading")}
            </h1>
            <p className="text-sm text-union-muted">{t("subtitle")}</p>
            <p className="text-xs text-union-muted/80">{t("language")}</p>
          </div>
          <LoginForm />
        </div>
      </main>

      <footer className="px-6 py-8 text-center text-xs text-union-muted/70 md:px-10">
        Union · Render
      </footer>
    </div>
  );
}
