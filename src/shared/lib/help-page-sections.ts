/** Порядок секцій для сторінок довідки (ключі в messages.*.sections). */

export const FAQ_SECTION_IDS = [
  "whatIsUnion",
  "access",
  "frozenAccount",
  "settingsBasics",
  "settingsSecrets",
  "settingsSections",
  "generator",
  "seo",
  "domains",
  "usage",
  "support",
] as const;

export const DOCS_SECTION_IDS = [
  "overview",
  "dashboard",
  "generator",
  "seo",
  "domains",
  "usage",
  "settingsOverview",
  "settingsGenerator",
  "settingsSpaceshipZomro",
  "settingsSslHost",
  "settingsSeoTelegram",
  "settingsAutoscript",
  "workflow",
] as const;

export type FaqSectionId = (typeof FAQ_SECTION_IDS)[number];
export type DocsSectionId = (typeof DOCS_SECTION_IDS)[number];

export type HelpSection = {
  id: string;
  title: string;
  body: string;
};
