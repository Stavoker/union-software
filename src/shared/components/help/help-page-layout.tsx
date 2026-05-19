"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HelpSectionBody } from "@/shared/components/help/help-section-body";
import type { HelpSection } from "@/shared/lib/help-page-sections";
import { seoInput } from "@/shared/components/seo/seo-ui";

/** Click nav: smooth-scroll until lock expires (ms). */
const SCROLL_CLICK_LOCK_MS = 900;

type Labels = {
  searchPlaceholder: string;
  navTitle: string;
  noResults: string;
};

type Props = {
  sections: HelpSection[];
  labels: Labels;
};

function sectionDomId(id: string) {
  return `help-section-${id}`;
}

function navButtonClass(isActive: boolean) {
  return [
    "block w-full border-l-2 py-2 pl-3 pr-2 text-left text-sm transition-colors",
    isActive
      ? "border-[#d1fe17] font-medium text-[#d1fe17]"
      : "border-transparent text-union-muted hover:text-union-text",
  ].join(" ");
}

function mobileChipClass(isActive: boolean) {
  return [
    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
    isActive
      ? "border-[#d1fe17] text-[#d1fe17]"
      : "border-union-border bg-union-surface/60 text-union-text hover:border-[#d1fe17]/40",
  ].join(" ");
}

/** Same box model for active/inactive — accent via inset shadow + title color only. */
function sectionCardClass(isActive: boolean) {
  return [
    "scroll-my-8 rounded-2xl border border-union-border bg-union-surface/50 p-5 backdrop-blur-md md:p-6",
    isActive ? "shadow-[inset_3px_0_0_0_#d1fe17]" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function HelpPageLayout({ sections, labels }: Props) {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const scrollLockUntilRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter(
      (section) =>
        section.title.toLowerCase().includes(q) ||
        section.body.toLowerCase().includes(q) ||
        section.id.toLowerCase().includes(q)
    );
  }, [query, sections]);

  const resolveActiveFromScroll = useCallback(() => {
    if (!filtered.length) return;
    if (Date.now() < scrollLockUntilRef.current) return;

    const viewportCenter = window.innerHeight / 2;
    let currentId = filtered[0].id;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const section of filtered) {
      const el = document.getElementById(sectionDomId(section.id));
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const sectionCenter = rect.top + rect.height / 2;
      const distance = Math.abs(sectionCenter - viewportCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        currentId = section.id;
      }
    }

    setActiveId((prev) => (prev === currentId ? prev : currentId));
  }, [filtered]);

  useEffect(() => {
    if (!filtered.length) {
      setActiveId(null);
      return;
    }
    setActiveId((prev) =>
      prev && filtered.some((s) => s.id === prev) ? prev : filtered[0].id
    );
  }, [filtered]);

  useEffect(() => {
    resolveActiveFromScroll();

    const onScroll = () => {
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        resolveActiveFromScroll();
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [resolveActiveFromScroll]);

  function scrollToSection(id: string) {
    setActiveId(id);
    scrollLockUntilRef.current = Date.now() + SCROLL_CLICK_LOCK_MS;
    document.getElementById(sectionDomId(id))?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  }

  return (
    <div className="flex w-full flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
      <aside className="hidden w-56 shrink-0 lg:sticky lg:top-24 lg:block">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-union-muted">
          {labels.navTitle}
        </p>
        <nav className="space-y-0.5" aria-label={labels.navTitle}>
          {filtered.map((section) => {
            const isActive = activeId === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollToSection(section.id)}
                aria-current={isActive ? "true" : undefined}
                className={navButtonClass(isActive)}
              >
                {section.title}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <label className="block">
          <span className="sr-only">{labels.searchPlaceholder}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.searchPlaceholder}
            className={seoInput}
            autoComplete="off"
          />
        </label>

        {filtered.length > 0 ? (
          <nav
            className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden"
            aria-label={labels.navTitle}
          >
            {filtered.map((section) => {
              const isActive = activeId === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => scrollToSection(section.id)}
                  aria-current={isActive ? "true" : undefined}
                  className={mobileChipClass(isActive)}
                >
                  {section.title}
                </button>
              );
            })}
          </nav>
        ) : null}

        <div className="mt-8 space-y-6">
          {filtered.length === 0 ? (
            <p className="text-sm text-union-muted">{labels.noResults}</p>
          ) : (
            filtered.map((section) => {
              const isActive = activeId === section.id;
              return (
                <section
                  key={section.id}
                  id={sectionDomId(section.id)}
                  className={sectionCardClass(isActive)}
                >
                  <h2
                    className={`text-base font-semibold md:text-lg ${
                      isActive ? "text-[#d1fe17]" : "text-union-text"
                    }`}
                  >
                    {section.title}
                  </h2>
                  <HelpSectionBody body={section.body} />
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
