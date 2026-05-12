import { getTranslations } from "next-intl/server";
import { ModulePlaceholder } from "@/shared/components/module-placeholder";

export default async function SettingsPage() {
  const t = await getTranslations("module");

  return (
    <div className="py-10">
      <ModulePlaceholder
        title={t("settingsTitle")}
        description={`${t("settingsLead")} ${t("wipBody")}`}
      />
    </div>
  );
}
