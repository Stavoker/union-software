import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { FooterMarquee } from "@/shared/components/footer-marquee";
import {
  SOFTWARE_LAST_UPDATED,
  SUPPORT_TELEGRAM_HANDLE,
  SUPPORT_TELEGRAM_URL,
} from "@/shared/lib/app-release";

/** Fixed footer bar height (marquee is separate, h-14). */
const FOOTER_BAR_HEIGHT = "h-[5.5rem]";

export async function AppFooter() {
  const t = await getTranslations("footer");
  const locale = await getLocale();
  const updatedLabel = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
    new Date(`${SOFTWARE_LAST_UPDATED}T12:00:00`)
  );

  return (
    <div className="shrink-0">
      <FooterMarquee />
      <footer
        className={`flex ${FOOTER_BAR_HEIGHT} shrink-0 items-center border-t border-union-border bg-union-bg/80 backdrop-blur-xl`}
      >
        <div className="mx-auto grid h-full w-full max-w-[1400px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 md:gap-6 md:px-8">
          <div className="min-w-0 space-y-0.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-union-muted md:text-xs">
              {t("supportLabel")}
            </p>
            <a
              href={SUPPORT_TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm font-medium text-[#d1fe17] transition-opacity hover:opacity-85"
            >
              {SUPPORT_TELEGRAM_HANDLE}
            </a>
          </div>

          <p className="shrink-0 whitespace-nowrap px-1 text-[10px] text-union-muted md:text-xs">
            {t("lastUpdated", { date: updatedLabel })}
          </p>

          <nav
            className="flex shrink-0 flex-nowrap items-center justify-end gap-x-4 text-sm md:gap-x-5"
            aria-label={t("linksAria")}
          >
            <Link
              href="/faq"
              className="whitespace-nowrap text-union-muted transition-colors hover:text-[#d1fe17]"
            >
              {t("faq")}
            </Link>
            <Link
              href="/docs"
              className="whitespace-nowrap text-union-muted transition-colors hover:text-[#d1fe17]"
            >
              {t("documentation")}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
