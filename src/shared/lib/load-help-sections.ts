import { getTranslations } from "next-intl/server";

import type { HelpSection } from "@/shared/lib/help-page-sections";

type Namespace = "faqPage" | "docsPage";

export async function loadHelpSections(
  namespace: Namespace,
  sectionIds: readonly string[]
): Promise<HelpSection[]> {
  const t = await getTranslations(namespace);

  return sectionIds.map((id) => ({
    id,
    title: t(`sections.${id}.title`),
    // Bodies mention paths like /{locale}/dashboard and env keys — skip ICU formatting.
    body: t.raw(`sections.${id}.body`) as string,
  }));
}
