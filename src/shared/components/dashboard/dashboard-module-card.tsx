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
  gradient: string;
  glow: string;
  badgeKey: string;
  tagKeys: [string, string, string];
  tagIcons: [LucideIcon, LucideIcon, LucideIcon];
};

const CARD_META: Record<DashboardCardId, CardMeta> = {
  generator: {
    icon: Sparkles,
    visualIcon: Layers,
    gradient: "from-violet-950/90 via-zinc-900 to-black",
    glow: "bg-violet-500/25",
    badgeKey: "badges.generator",
    tagKeys: ["tags.generator.t1", "tags.generator.t2", "tags.generator.t3"],
    tagIcons: [Layers, Zap, Sparkles],
  },
  seo: {
    icon: Search,
    visualIcon: BarChart3,
    gradient: "from-emerald-950/80 via-zinc-900 to-black",
    glow: "bg-emerald-500/20",
    badgeKey: "badges.seo",
    tagKeys: ["tags.seo.t1", "tags.seo.t2", "tags.seo.t3"],
    tagIcons: [Search, BarChart3, Clock],
  },
  domain: {
    icon: Globe,
    visualIcon: Globe,
    gradient: "from-sky-950/80 via-zinc-900 to-black",
    glow: "bg-sky-500/20",
    badgeKey: "badges.domain",
    tagKeys: ["tags.domain.t1", "tags.domain.t2", "tags.domain.t3"],
    tagIcons: [Globe, Zap, KeyRound],
  },
  usage: {
    icon: Zap,
    visualIcon: BarChart3,
    gradient: "from-amber-950/70 via-zinc-900 to-black",
    glow: "bg-amber-500/20",
    badgeKey: "badges.usage",
    tagKeys: ["tags.usage.t1", "tags.usage.t2", "tags.usage.t3"],
    tagIcons: [Zap, BarChart3, Clock],
  },
  users: {
    icon: Users,
    visualIcon: Users,
    gradient: "from-rose-950/70 via-zinc-900 to-black",
    glow: "bg-rose-500/20",
    badgeKey: "badges.users",
    tagKeys: ["tags.users.t1", "tags.users.t2", "tags.users.t3"],
    tagIcons: [Users, KeyRound, Settings],
  },
  settings: {
    icon: Settings,
    visualIcon: KeyRound,
    gradient: "from-zinc-800 via-zinc-900 to-black",
    glow: "bg-[#d1fe17]/15",
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
        className="group relative flex h-full flex-col overflow-hidden rounded-[1.35rem] border border-white/[0.08] bg-gradient-to-b from-white/[0.09] to-white/[0.03] p-5 shadow-[0_20px_50px_-28px_rgb(0_0_0_/_0.85)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-[#d1fe17]/35 hover:shadow-[0_28px_60px_-24px_rgb(0_0_0_/_0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d1fe17]/50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-[#d1fe17] transition-colors group-hover:border-[#d1fe17]/30 group-hover:bg-[#d1fe17]/10">
              <HeaderIcon className="h-4 w-4" aria-hidden />
            </span>
            <h2 className="text-base font-semibold tracking-tight text-union-text group-hover:text-[#d1fe17] transition-colors">
              {tNav(navKey)}
            </h2>
          </div>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-transparent text-union-muted transition-all duration-300 group-hover:border-white/10 group-hover:bg-white/[0.06] group-hover:text-[#d1fe17] group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </span>
        </div>

        <div
          className={`relative mt-4 aspect-[16/10] overflow-hidden rounded-2xl bg-gradient-to-br ${meta.gradient}`}
        >
          <motion.div
            className={`pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full blur-2xl ${meta.glow}`}
            aria-hidden
            initial={false}
            whileHover={{ scale: 1.15, opacity: 1 }}
            transition={{ duration: 0.45 }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(209,254,23,0.12),transparent_55%)]" />
          <div className="relative flex h-full items-center justify-center">
            <VisualIcon
              className="h-14 w-14 text-white/20 transition-transform duration-500 group-hover:scale-110 group-hover:text-white/30"
              strokeWidth={1.25}
              aria-hidden
            />
          </div>
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
            <span className="text-[#d1fe17]">★</span>
            {t(meta.badgeKey)}
          </span>
        </div>

        <p className="mt-4 flex-1 text-sm leading-relaxed text-union-muted">{t(descKey)}</p>

        <ul className="mt-4 flex flex-wrap gap-2" aria-label={t("cardFeaturesAria")}>
          {meta.tagKeys.map((tagKey, i) => {
            const TagIcon = meta.tagIcons[i];
            return (
              <li key={tagKey}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-union-text/90 transition-colors group-hover:border-white/12 group-hover:bg-white/[0.09]">
                  <TagIcon className="h-3 w-3 shrink-0 text-union-muted group-hover:text-[#d1fe17]/90" aria-hidden />
                  {t(tagKey)}
                </span>
              </li>
            );
          })}
        </ul>

        <span className="mt-4 text-xs font-medium text-[#d1fe17]/80 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          {t("openModule")} →
        </span>
      </Link>
    </motion.li>
  );
}
