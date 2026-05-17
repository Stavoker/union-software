import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/shared/components/locale-switcher";
import { UnionLogo } from "@/shared/components/union-logo";

export default async function FaqPage() {
  const t = await getTranslations("faqPage");
  const meta = await getTranslations("meta");

  const items = ["q1", "q2", "q3", "q4"] as const;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-union-border px-4 py-4 md:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <UnionLogo />
          <span className="text-sm font-semibold tracking-tight text-union-text">
            {meta("title")}
          </span>
        </Link>
        <LocaleSwitcher />
      </header>

      <main className="flex-1 px-4 py-10 md:px-8">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/"
            className="text-sm font-medium text-[#d1fe17] transition-opacity hover:opacity-85"
          >
            ← {t("back")}
          </Link>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-union-text">
            {t("title")}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-union-muted">{t("lead")}</p>

          <ul className="mt-10 space-y-6">
            {items.map((key) => (
              <li
                key={key}
                className="rounded-2xl border border-union-border bg-union-surface/50 p-5 backdrop-blur-md"
              >
                <h2 className="text-base font-semibold text-union-text">
                  {t(`${key}Title`)}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-union-muted">
                  {t(`${key}Body`)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
