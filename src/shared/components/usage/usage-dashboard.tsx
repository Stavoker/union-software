"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { seoCard } from "@/shared/components/seo/seo-ui";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dbReady, setDbReady] = useState(true);
  const [dbError, setDbError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [locale, setLocale] = useState("uk");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/usage", { credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSummary(data.summary);
      setHistory(data.history || []);
      setDbReady(data.dbReady !== false);
      setDbError(data.dbError || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      setLocale(document.documentElement.lang || "uk");
    }
    void load();
  }, [load]);

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
        <div className="border-b border-union-border px-5 py-4">
          <h2 className="text-sm font-semibold text-union-text">{t("historyTitle")}</h2>
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
                    {t("empty")}
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
      </section>
    </div>
  );
}
