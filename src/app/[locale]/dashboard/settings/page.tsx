import { getTranslations } from "next-intl/server";
import { ModulePlaceholder } from "@/shared/components/module-placeholder";

export default async function SettingsPage() {
  const t = await getTranslations("module");

  return (
    <div className="px-4 py-10 md:px-8">
      <ModulePlaceholder
        title={t("settingsTitle")}
        description={`${t("settingsLead")} ${t("wipBody")}`}
      />
    </div>
  );
}
