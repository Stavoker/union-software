"use client";

import { useLocale } from "next-intl";
import { useMemo, useState } from "react";

import { filterGeoRegions } from "@/lib/generator-brand-geo";
import { seoInput } from "@/shared/components/seo/seo-ui";

type Props = {
  value: string;
  onChange: (code: string) => void;
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
};

export function GeoRegionPicker({
  value,
  onChange,
  label,
  placeholder,
  searchPlaceholder,
  emptyLabel,
}: Props) {
  const locale = useLocale();
  const loc = locale === "uk" || locale === "en" || locale === "ru" ? locale : "ru";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => {
    const rows = filterGeoRegions("", loc);
    return rows.find((r) => r.code === value) || null;
  }, [value, loc]);

  const options = useMemo(() => filterGeoRegions(query, loc), [query, loc]);

  return (
    <div className="relative block space-y-1">
      <span className="text-xs text-union-muted">{label}</span>
      <button
        type="button"
        className={`${seoInput} flex w-full items-center justify-between gap-2 text-left`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">
          {selected ? (
            <>
              <span className="mr-2">{selected.flag}</span>
              {selected.displayLabel}
            </>
          ) : (
            <span className="text-union-muted">{placeholder}</span>
          )}
        </span>
        <span className="text-union-muted">▾</span>
      </button>

      {open ? (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-union-border bg-union-surface shadow-xl">
          <div className="border-b border-union-border p-2">
            <input
              className={seoInput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              autoFocus
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-union-muted">{emptyLabel}</li>
            ) : (
              options.map((opt) => (
                <li key={opt.code}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5 ${
                      opt.code === value ? "text-[#d1fe17]" : "text-union-text"
                    }`}
                    onClick={() => {
                      onChange(opt.code);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span>{opt.flag}</span>
                    <span>{opt.displayLabel}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
          {value ? (
            <div className="border-t border-union-border p-2">
              <button
                type="button"
                className="text-xs text-union-muted hover:text-union-text"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                ×
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
