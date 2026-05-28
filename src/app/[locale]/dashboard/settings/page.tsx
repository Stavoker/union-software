import { getTranslations } from "next-intl/server";

import { IntegrationSettingsForm } from "@/shared/components/settings/integration-settings-form";
import { TelegramConnectPanel } from "@/shared/components/settings/telegram-connect-panel";
import { UserHostsSettingsPanel } from "@/shared/components/settings/user-hosts-settings-panel";

export default async function SettingsPage() {
  const t = await getTranslations("module");

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-union-text">{t("settingsTitle")}</h1>
        <p className="max-w-3xl text-sm text-union-muted">{t("settingsLead")}</p>
      </header>
      <TelegramConnectPanel />
      <UserHostsSettingsPanel />
      <IntegrationSettingsForm />
    </div>
  );
}
