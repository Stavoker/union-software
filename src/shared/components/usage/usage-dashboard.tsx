"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  seoBtnLimeOutline,
  seoCard,
  seoInput,
  seoSelect,
} from "@/shared/components/seo/seo-ui";

const HISTORY_PAGE_SIZE = 30;

type Summary = {
  today: number;
  week: number;
  month: number;
  allTime: number;
  averagePerGeneration: number;
  generationsCount: number;
};

type HistoryRow = {
  id: string;
  jobId: string;
  projectName: string;
  status: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  dryRun: boolean;
  createdAt: string;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type StatusFilter = "all" | "done" | "error" | "cancelled" | "dry_run";

function formatTokens(n: number, locale: string) {
  return new Intl.NumberFormat(locale).format(Math.max(0, Math.trunc(n)));
}

function formatDate(iso: string, locale: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export function UsageDashboard() {
  const t = useTranslations("usageWorkbench");
  const locale = useLocale();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dbReady, setDbReady] = useState(true);
  const [dbError, setDbError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: HISTORY_PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async (pageToLoad: number, searchQuery: string, status: StatusFilter) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ page: String(pageToLoad) });
        if (searchQuery) params.set("q", searchQuery);
        if (status !== "all") params.set("status", status);

        const res = await fetch(`/api/usage?${params.toString()}`, { credentials: "include" });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        setSummary(data.summary);
        setHistory(data.history || []);
        setPagination(
          data.pagination || {
            page: pageToLoad,
            pageSize: HISTORY_PAGE_SIZE,
            total: 0,
            totalPages: 1,
          }
        );
        setPage(data.pagination?.page ?? pageToLoad);
        setDbReady(data.dbReady !== false);
        setDbError(data.dbError || "");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void load(page, search, statusFilter);
  }, [load, page, search, statusFilter]);

  function statusLabel(row: HistoryRow) {
    if (row.dryRun) return t("statusDryRun");
    if (row.status === "error") return t("statusError");
    if (row.status === "cancelled") return t("statusCancelled");
    return t("statusDone");
  }

  const statCards = summary
    ? [
        { key: "today", label: t("statToday"), value: summary.today },
        { key: "week", label: t("statWeek"), value: summary.week },
        { key: "month", label: t("statMonth"), value: summary.month },
        { key: "allTime", label: t("statAllTime"), value: summary.allTime },
        { key: "average", label: t("statAverage"), value: summary.averagePerGeneration },
      ]
    : [];

  const { total, totalPages, pageSize } = pagination;
  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = total === 0 ? 0 : Math.min(page * pageSize, total);
  const showPagination = totalPages > 1;
  const hasActiveFilters = Boolean(search) || statusFilter !== "all";
  const emptyMessage = hasActiveFilters ? t("emptyFiltered") : t("empty");

  return (
    <div className="w-full space-y-8 pb-10 pt-2">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-union-text">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-union-muted">{t("lead")}</p>
      </div>

      {!dbReady && dbError ? (
        <p className={`${seoCard} text-sm text-union-muted`}>{t("dbMigrationRequired")}</p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {t("loadError", { message: error })}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((card) => (
          <div key={card.key} className={`${seoCard} !p-4`}>
            <p className="text-xs font-medium text-union-muted">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-[#d1fe17]">
              {loading ? "…" : formatTokens(card.value, locale)}
            </p>
            {card.key === "average" && summary && !loading ? (
              <p className="mt-1 text-[11px] text-union-muted">
                {t("averageHint", { count: summary.generationsCount })}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <section className={`${seoCard} overflow-hidden !p-0`}>
        <div className="border-b border-union-border px-5 py-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-union-text">{t("historyTitle")}</h2>
            {showPagination && !loading ? (
              <div
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
                aria-label={t("paginationAria")}
              >
                <p className="text-xs text-union-muted">
                  <span className="font-medium text-[#d1fe17]">
                    {t("paginationRange", { from: rangeFrom, to: rangeTo, total })}
                  </span>
                  {hasActiveFilters ? t("paginationFilterFound", { found: total }) : null}
                  <span className="hidden sm:inline">
                    {" · "}
                    {t("paginationSummary", { current: page, total: totalPages })}
                  </span>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={seoBtnLimeOutline}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                  >
                    <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
                    {t("navBack")}
                  </button>
                  <button
                    type="button"
                    className={seoBtnLimeOutline}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || loading}
                  >
                    {t("navForward")}
                    <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div
            className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end"
            aria-label={t("historyFiltersAria")}
          >
            <div className="min-w-0 flex-1 space-y-1 lg:min-w-[12rem]">
              <label htmlFor="usage-history-search" className="sr-only">
                {t("searchAria")}
              </label>
              <input
                id="usage-history-search"
                type="search"
                className={`${seoInput} w-full`}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchAria")}
                disabled={loading && !history.length && !searchInput}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="w-full space-y-1 sm:w-44 shrink-0">
              <label htmlFor="usage-history-status" className="text-xs font-medium text-union-muted">
                {t("filterLabel")}
              </label>
              <select
                id="usage-history-status"
                className={`${seoSelect} w-full`}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as StatusFilter);
                  setPage(1);
                }}
                disabled={loading && !history.length}
              >
                <option value="all">{t("filterAll")}</option>
                <option value="done">{t("filterDone")}</option>
                <option value="error">{t("filterError")}</option>
                <option value="cancelled">{t("filterCancelled")}</option>
                <option value="dry_run">{t("filterDryRun")}</option>
              </select>
            </div>
          </div>
          {hasActiveFilters && !loading ? (
            <p className="text-xs text-union-muted">{t("filterResultCount", { found: total })}</p>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-union-border bg-union-bg/50 text-xs text-union-muted">
              <tr>
                <th className="px-5 py-3 font-medium">{t("colDate")}</th>
                <th className="px-5 py-3 font-medium">{t("colProject")}</th>
                <th className="px-5 py-3 font-medium">{t("colStatus")}</th>
                <th className="px-5 py-3 text-right font-medium">{t("colInput")}</th>
                <th className="px-5 py-3 text-right font-medium">{t("colOutput")}</th>
                <th className="px-5 py-3 text-right font-medium">{t("colTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-union-muted">
                    {t("loading")}
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-union-muted">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-union-border/40 last:border-b-0 hover:bg-white/[0.02]"
                  >
                    <td className="whitespace-nowrap px-5 py-3 text-union-muted">
                      {formatDate(row.createdAt, locale)}
                    </td>
                    <td className="max-w-[200px] truncate px-5 py-3 font-medium text-union-text">
                      {row.projectName}
                    </td>
                    <td className="px-5 py-3 text-union-muted">{statusLabel(row)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-union-text">
                      {formatTokens(row.inputTokens, locale)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-union-text">
                      {formatTokens(row.outputTokens, locale)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium text-[#d1fe17]">
                      {formatTokens(row.totalTokens, locale)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {showPagination && !loading ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 border-t border-union-border px-5 py-3 sm:hidden"
            aria-label={t("paginationAria")}
          >
            <p className="text-xs text-union-muted">
              {t("paginationSummary", { current: page, total: totalPages })}
              {hasActiveFilters ? t("paginationFilterFound", { found: total }) : null}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={seoBtnLimeOutline}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
                {t("navBack")}
              </button>
              <button
                type="button"
                className={seoBtnLimeOutline}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                {t("navForward")}
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
