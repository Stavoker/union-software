import { getTranslations } from "next-intl/server";
import { ModulePlaceholder } from "@/shared/components/module-placeholder";

export default async function UsagePage() {
  const t = await getTranslations("module");

  return (
    <div className="py-10">
      <ModulePlaceholder
        title={t("usageTitle")}
        description={`${t("usageLead")} ${t("wipBody")}`}
      />
    </div>
  );
}
