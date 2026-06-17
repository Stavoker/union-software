// @ts-nocheck
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { seoCard } from "@/shared/components/seo/seo-ui";

async function readJsonSafe(response) {
  const text = await response.text();
  if (!text?.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function statusLabel(t, status) {
  if (status === "pending") return t("statusPending");
  if (status === "processing") return t("statusProcessing");
  if (status === "done") return t("statusDone");
  if (status === "failed") return t("statusFailed");
  return status;
}

export function AutoscriptQueuePanel() {
  const t = useTranslations("integrationSettings.seoQueue");
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/seo/autoscript-queue");
      const payload = await readJsonSafe(response);
      if (response.ok && payload?.ok) {
        setSnapshot(payload);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const recent = Array.isArray(snapshot?.recent) ? snapshot.recent : [];
  const hasActive = items.length > 0;

  return (
    <section className={`${seoCard} space-y-4`}>
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-union-text">{t("title")}</h2>
        <p className="text-xs text-union-muted">{t("hint")}</p>
      </div>

      {loading && !snapshot ? (
        <p className="text-sm text-union-muted">{t("loading")}</p>
      ) : (
        <>
          <p className="text-sm text-union-text">
            {t("globalSummary", {
              pending: Number(snapshot?.totalPending || 0),
              processing: Number(snapshot?.totalProcessing || 0),
            })}
          </p>

          {!hasActive && recent.length === 0 ? (
            <p className="text-sm text-union-muted">{t("empty")}</p>
          ) : null}

          {hasActive ? (
            <ul className="space-y-2">
              {items.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-union-border/60 bg-union-surface/40 px-3 py-2 text-sm"
                >
                  <div className="font-medium text-union-text">{row.domain}</div>
                  <div className="mt-1 text-xs text-union-muted">
                    {statusLabel(t, row.status)}
                    {row.status === "pending" &&
                    row.queuePosition != null &&
                    snapshot?.totalPending != null
                      ? ` · ${t("yourPosition", {
                          position: row.queuePosition,
                          total: snapshot.totalPending,
                        })}`
                      : ""}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {recent.length > 0 ? (
            <div className="space-y-2 border-t border-union-border/40 pt-3">
              <p className="text-xs font-medium text-union-muted">{t("recentTitle")}</p>
              <ul className="space-y-1 text-xs text-union-muted">
                {recent.map((row) => (
                  <li key={row.id}>
                    {row.domain} — {statusLabel(t, row.status)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
