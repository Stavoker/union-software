import { getTranslations } from "next-intl/server";
import { ModulePlaceholder } from "@/shared/components/module-placeholder";

export default async function DomainPage() {
  const t = await getTranslations("module");

  return (
    <div className="py-10">
      <ModulePlaceholder
        title={t("domainTitle")}
        description={`${t("domainLead")} ${t("wipBody")}`}
      />
    </div>
  );
}
