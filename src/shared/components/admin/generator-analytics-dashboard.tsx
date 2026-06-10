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

const PAGE_SIZE = 30;

type Summary = {
  today: number;
  week: number;
  month: number;
  allTime: number;
  averagePerGeneration: number;
  generationsCount: number;
  uniqueUsers: number;
  totalJobs: number;
  skeletonCount: number;
};

type HistoryRow = {
  id: string;
  jobId: string;
  userEmail: string;
  userDisplayName: string;
  projectName: string;
  status: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  dryRun: boolean;
  chromeTemplateId: string;
  homePageFrameworkId: string;
  siteLayout: string;
  pageCount: number;
  skeletonFingerprint: string;
  maxSimilarityPercent: number;
  similarToProject: string;
  createdAt: string;
};

type SimilarPair = {
  percent: number;
  projectA: string;
  projectB: string;
  jobIdA: string;
  jobIdB: string;
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

export function GeneratorAnalyticsDashboard() {
  const t = useTranslations("generatorAnalytics");
  const locale = useLocale();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dbReady, setDbReady] = useState(true);
  const [dbError, setDbError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [similarPairs, setSimilarPairs] = useState<SimilarPair[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: PAGE_SIZE,
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

  const load = useCallback(
    async (pageToLoad: number, searchQuery: string, status: StatusFilter) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ page: String(pageToLoad) });
        if (searchQuery) params.set("q", searchQuery);
        if (status !== "all") params.set("status", status);

        const res = await fetch(`/api/admin/generator-analytics?${params.toString()}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.details || data.error || `HTTP ${res.status}`);
        }
        setSummary(data.summary);
        setHistory(data.history || []);
        setSimilarPairs(data.similarPairs || []);
        setPagination(
          data.pagination || {
            page: pageToLoad,
            pageSize: PAGE_SIZE,
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
        { key: "users", label: t("statUsers"), value: summary.uniqueUsers },
        { key: "skeletons", label: t("statSkeletons"), value: summary.skeletonCount },
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
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-union-muted">{t("lead")}</p>
      </div>

      {!dbReady && dbError ? (
        <p className={`${seoCard} text-sm text-union-muted`}>{t("dbMigrationRequired")}</p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {t("loadError", { message: error })}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
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
            {card.key === "users" && summary && !loading ? (
              <p className="mt-1 text-[11px] text-union-muted">
                {t("usersHint", { jobs: summary.totalJobs })}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {similarPairs.length > 0 ? (
        <section className={`${seoCard} space-y-4`}>
          <div>
            <h2 className="text-sm font-semibold text-union-text">{t("similarTitle")}</h2>
            <p className="mt-1 text-xs text-union-muted">{t("similarLead")}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-union-border text-xs text-union-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("colSimilarity")}</th>
                  <th className="px-3 py-2 font-medium">{t("colProjectA")}</th>
                  <th className="px-3 py-2 font-medium">{t("colProjectB")}</th>
                </tr>
              </thead>
              <tbody>
                {similarPairs.map((pair) => (
                  <tr
                    key={`${pair.jobIdA}-${pair.jobIdB}`}
                    className="border-b border-union-border/40 last:border-b-0"
                  >
                    <td className="px-3 py-2 font-semibold tabular-nums text-[#d1fe17]">
                      {pair.percent}%
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2 text-union-text">
                      {pair.projectA}
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2 text-union-text">
                      {pair.projectB}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className={`${seoCard} overflow-hidden !p-0`}>
        <div className="space-y-4 border-b border-union-border px-5 py-4">
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

          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="min-w-0 flex-1 space-y-1 lg:min-w-[12rem]">
              <input
                type="search"
                className={`${seoInput} w-full`}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("searchPlaceholder")}
                disabled={loading && !history.length && !searchInput}
                autoComplete="off"
              />
            </div>
            <div className="w-full shrink-0 space-y-1 sm:w-44">
              <label htmlFor="gen-analytics-status" className="text-xs font-medium text-union-muted">
                {t("filterLabel")}
              </label>
              <select
                id="gen-analytics-status"
                className={`${seoSelect} w-full`}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as StatusFilter);
                  setPage(1);
                }}
              >
                <option value="all">{t("filterAll")}</option>
                <option value="done">{t("filterDone")}</option>
                <option value="error">{t("filterError")}</option>
                <option value="cancelled">{t("filterCancelled")}</option>
                <option value="dry_run">{t("filterDryRun")}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-union-border bg-union-bg/50 text-xs text-union-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t("colDate")}</th>
                <th className="px-4 py-3 font-medium">{t("colUser")}</th>
                <th className="px-4 py-3 font-medium">{t("colProject")}</th>
                <th className="px-4 py-3 font-medium">{t("colStatus")}</th>
                <th className="px-4 py-3 font-medium">{t("colLayout")}</th>
                <th className="px-4 py-3 font-medium">{t("colChrome")}</th>
                <th className="px-4 py-3 font-medium">{t("colSimilarity")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colInput")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colOutput")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-union-muted">
                    {t("loading")}
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-union-muted">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-union-border/40 last:border-b-0 hover:bg-white/[0.02]"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-union-muted">
                      {formatDate(row.createdAt, locale)}
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-union-text">
                      {row.userDisplayName || row.userEmail}
                    </td>
                    <td className="max-w-[140px] truncate px-4 py-3 font-medium text-union-text">
                      {row.projectName}
                    </td>
                    <td className="px-4 py-3 text-union-muted">{statusLabel(row)}</td>
                    <td className="max-w-[100px] truncate px-4 py-3 text-xs text-union-muted">
                      {row.siteLayout || "—"}
                    </td>
                    <td className="max-w-[100px] truncate px-4 py-3 font-mono text-xs text-union-muted">
                      {row.chromeTemplateId || "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-union-text">
                      {row.maxSimilarityPercent > 0 ? (
                        <span title={row.similarToProject || undefined}>
                          {row.maxSimilarityPercent}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-union-text">
                      {formatTokens(row.inputTokens, locale)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-union-text">
                      {formatTokens(row.outputTokens, locale)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-[#d1fe17]">
                      {formatTokens(row.totalTokens, locale)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
