import { getTranslations } from "next-intl/server";

import { HelpPageFrame } from "@/shared/components/help/help-page-frame";
import { HelpPageIntro } from "@/shared/components/help/help-page-header";
import { HelpPageLayout } from "@/shared/components/help/help-page-layout";
import { FAQ_SECTION_IDS } from "@/shared/lib/help-page-sections";
import { loadHelpSections } from "@/shared/lib/load-help-sections";

export default async function FaqPage() {
  const t = await getTranslations("faqPage");
  const meta = await getTranslations("meta");
  const sections = await loadHelpSections("faqPage", FAQ_SECTION_IDS);

  return (
    <HelpPageFrame metaTitle={meta("title")}>
      <div className="space-y-10">
        <HelpPageIntro backLabel={t("back")} title={t("title")} lead={t("lead")} />
        <HelpPageLayout
          sections={sections}
          labels={{
            searchPlaceholder: t("searchPlaceholder"),
            navTitle: t("navTitle"),
            noResults: t("noResults"),
          }}
        />
      </div>
    </HelpPageFrame>
  );
}
