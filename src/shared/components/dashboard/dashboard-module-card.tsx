"use client";

import { motion } from "framer-motion";
import Image from "next/image";
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
  Palette,
} from "lucide-react";
import { useTranslations } from "next-intl";

import dashboardPreviewBg from "@/logo/bg.png";
import { Link } from "@/i18n/navigation";

const dashboardCard = "rounded-2xl border border-union-border bg-transparent p-5 md:p-6";

const dashboardPreviewBadge =
  "inline-flex items-center rounded-full border border-white/20 bg-white/[0.1] px-2.5 py-1 text-[11px] font-medium text-[#d1fe17] shadow-[0_8px_28px_-10px_rgb(0_0_0_/_0.55)] backdrop-blur-md";

export type DashboardCardId =
  | "generator"
  | "brand"
  | "seo"
  | "domain"
  | "usage"
  | "generatorAnalytics"
  | "users"
  | "settings";

/** Slight crop shift so the same bg asset reads differently per card. */
const PREVIEW_BG_OBJECT_POSITION: Record<DashboardCardId, string> = {
  generator: "object-[18%_50%]",
  brand: "object-[35%_62%]",
  seo: "object-[82%_48%]",
  domain: "object-[50%_12%]",
  usage: "object-[50%_88%]",
  generatorAnalytics: "object-[72%_28%]",
  users: "object-[12%_18%]",
  settings: "object-[88%_82%]",
};

type CardMeta = {
  icon: LucideIcon;
  visualIcon: LucideIcon;
  badgeKey: string;
  /** Якщо задано — кілька бейджів у превʼю (напр. Yandex + Google). */
  badgeKeys?: string[];
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
  brand: {
    icon: Palette,
    visualIcon: Palette,
    badgeKey: "badges.brand",
    tagKeys: ["tags.brand.t1", "tags.brand.t2", "tags.brand.t3"],
    tagIcons: [Palette, Globe, Search],
  },
  seo: {
    icon: Search,
    visualIcon: BarChart3,
    badgeKey: "badges.seo",
    badgeKeys: ["badges.seoYandex", "badges.seoGoogle"],
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
  generatorAnalytics: {
    icon: BarChart3,
    visualIcon: Layers,
    badgeKey: "badges.generatorAnalytics",
    tagKeys: [
      "tags.generatorAnalytics.t1",
      "tags.generatorAnalytics.t2",
      "tags.generatorAnalytics.t3",
    ],
    tagIcons: [Layers, Users, BarChart3],
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
  navKey:
    | "generator"
    | "brand"
    | "seo"
    | "buyDomain"
    | "usage"
    | "generatorAnalytics"
    | "users"
    | "settings";
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
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#d1fe17]/25 bg-transparent text-[#d1fe17] transition-colors group-hover:border-[#d1fe17]/50 group-hover:bg-[#d1fe17]/10">
              <HeaderIcon className="h-4 w-4" aria-hidden />
            </span>
            <h2 className="text-base font-semibold tracking-tight text-union-text transition-colors group-hover:text-[#d1fe17]">
              {tNav(navKey)}
            </h2>
          </div>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-transparent text-union-muted transition-all duration-300 group-hover:border-[#d1fe17]/30 group-hover:bg-transparent group-hover:text-[#d1fe17] group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </span>
        </div>

        <div className="relative mt-4 aspect-[16/10] overflow-hidden rounded-2xl">
          <Image
            src={dashboardPreviewBg}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className={`object-cover ${PREVIEW_BG_OBJECT_POSITION[id]}`}
            aria-hidden
          />
          <div className="relative z-10 flex h-full items-center justify-center">
            <VisualIcon
              className="h-14 w-14 text-[#d1fe17] transition-transform duration-500 group-hover:scale-110"
              strokeWidth={1.5}
              aria-hidden
            />
          </div>
          <div className="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-1.5">
            {(meta.badgeKeys ?? [meta.badgeKey]).map((key) => (
              <span key={key} className={dashboardPreviewBadge}>
                {t(key)}
              </span>
            ))}
          </div>
        </div>

        <p className="mt-4 flex-1 text-sm leading-relaxed text-union-muted">{t(descKey)}</p>

        <ul className="mt-4 flex flex-wrap gap-2" aria-label={t("cardFeaturesAria")}>
          {meta.tagKeys.map((tagKey, i) => {
            const TagIcon = meta.tagIcons[i];
            return (
              <li key={tagKey}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-union-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-union-text transition-colors group-hover:border-[#d1fe17]/30">
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
