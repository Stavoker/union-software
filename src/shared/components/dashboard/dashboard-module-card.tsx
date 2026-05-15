"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  BarChart3,
  Clock,
  Globe,
  KeyRound,
  Layers,
  Search,
  Settings,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

const dashboardCard = "rounded-2xl border border-union-border bg-black p-5 md:p-6";

export type DashboardCardId =
  | "generator"
  | "seo"
  | "domain"
  | "usage"
  | "users"
  | "settings";

type CardMeta = {
  icon: LucideIcon;
  visualIcon: LucideIcon;
  badgeKey: string;
  tagKeys: [string, string, string];
  tagIcons: [LucideIcon, LucideIcon, LucideIcon];
};

const CARD_META: Record<DashboardCardId, CardMeta> = {
  generator: {
    icon: Sparkles,
    visualIcon: Layers,
    badgeKey: "badges.generator",
    tagKeys: ["tags.generator.t1", "tags.generator.t2", "tags.generator.t3"],
    tagIcons: [Layers, Zap, Sparkles],
  },
  seo: {
    icon: Search,
    visualIcon: BarChart3,
    badgeKey: "badges.seo",
    tagKeys: ["tags.seo.t1", "tags.seo.t2", "tags.seo.t3"],
    tagIcons: [Search, BarChart3, Clock],
  },
  domain: {
    icon: Globe,
    visualIcon: Globe,
    badgeKey: "badges.domain",
    tagKeys: ["tags.domain.t1", "tags.domain.t2", "tags.domain.t3"],
    tagIcons: [Globe, Zap, KeyRound],
  },
  usage: {
    icon: Zap,
    visualIcon: BarChart3,
    badgeKey: "badges.usage",
    tagKeys: ["tags.usage.t1", "tags.usage.t2", "tags.usage.t3"],
    tagIcons: [Zap, BarChart3, Clock],
  },
  users: {
    icon: Users,
    visualIcon: Users,
    badgeKey: "badges.users",
    tagKeys: ["tags.users.t1", "tags.users.t2", "tags.users.t3"],
    tagIcons: [Users, KeyRound, Settings],
  },
  settings: {
    icon: Settings,
    visualIcon: KeyRound,
    badgeKey: "badges.settings",
    tagKeys: ["tags.settings.t1", "tags.settings.t2", "tags.settings.t3"],
    tagIcons: [KeyRound, Globe, Zap],
  },
};

type Props = {
  id: DashboardCardId;
  href: string;
  navKey: "generator" | "seo" | "buyDomain" | "usage" | "users" | "settings";
  descKey: string;
  index: number;
};

export function DashboardModuleCard({ id, href, navKey, descKey, index }: Props) {
  const t = useTranslations("dashboard");
  const tNav = useTranslations("nav");
  const meta = CARD_META[id];
  const VisualIcon = meta.visualIcon;
  const HeaderIcon = meta.icon;

  return (
    <motion.li
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      className="h-full"
    >
      <Link
        href={href}
        className={`${dashboardCard} group relative flex h-full flex-col overflow-hidden !p-5 transition-[border-color,box-shadow] duration-300 hover:border-[#d1fe17]/45 hover:shadow-[0_24px_56px_-32px_rgb(0_0_0_/_0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-union-ring`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#d1fe17]/25 bg-black text-[#d1fe17] transition-colors group-hover:border-[#d1fe17]/50 group-hover:bg-[#d1fe17]/10">
              <HeaderIcon className="h-4 w-4" aria-hidden />
            </span>
            <h2 className="text-base font-semibold tracking-tight text-union-text transition-colors group-hover:text-[#d1fe17]">
              {tNav(navKey)}
            </h2>
          </div>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-transparent text-union-muted transition-all duration-300 group-hover:border-[#d1fe17]/30 group-hover:bg-black group-hover:text-[#d1fe17] group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </span>
        </div>

        <div className="relative mt-4 aspect-[16/10] overflow-hidden rounded-2xl border border-[#d1fe17] bg-gradient-to-br from-black to-[#d1fe17]">
          <div className="relative flex h-full items-center justify-center">
            <VisualIcon
              className="h-14 w-14 text-[#d1fe17] transition-transform duration-500 group-hover:scale-110"
              strokeWidth={1.5}
              aria-hidden
            />
          </div>
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-black bg-[#d1fe17] px-2.5 py-1 text-[11px] font-medium text-black">
            <span aria-hidden>★</span>
            {t(meta.badgeKey)}
          </span>
        </div>

        <p className="mt-4 flex-1 text-sm leading-relaxed text-union-muted">{t(descKey)}</p>

        <ul className="mt-4 flex flex-wrap gap-2" aria-label={t("cardFeaturesAria")}>
          {meta.tagKeys.map((tagKey, i) => {
            const TagIcon = meta.tagIcons[i];
            return (
              <li key={tagKey}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-union-border bg-black px-2.5 py-1 text-[11px] font-medium text-union-text transition-colors group-hover:border-[#d1fe17]/30">
                  <TagIcon className="h-3 w-3 shrink-0 text-union-muted transition-colors group-hover:text-[#d1fe17]" aria-hidden />
                  {t(tagKey)}
                </span>
              </li>
            );
          })}
        </ul>

        <span className="mt-4 text-xs font-medium text-[#d1fe17] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          {t("openModule")} →
        </span>
      </Link>
    </motion.li>
  );
}
