"use client";

import { DashboardModuleCard, type DashboardCardId } from "./dashboard-module-card";

export type DashboardCardConfig = {
  id: DashboardCardId;
  href: string;
  navKey:
    | "generator"
    | "brand"
    | "seo"
    | "buyDomain"
    | "usage"
    | "generatorAnalytics"
    | "users"
    | "settings";
  cardDescKey: string;
};

type Props = {
  cards: DashboardCardConfig[];
};

export function DashboardModuleGrid({ cards }: Props) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((c, index) => (
        <DashboardModuleCard
          key={c.href}
          id={c.id}
          href={c.href}
          navKey={c.navKey}
          descKey={c.cardDescKey}
          index={index}
        />
      ))}
    </ul>
  );
}
