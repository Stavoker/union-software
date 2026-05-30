// @ts-nocheck
"use client";

import { ChevronLeft, ChevronRight, Rocket, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  seoBtnLimeOutline,
  seoBtnLimeOutlineMuted,
  seoBtnPrimary,
  seoCard,
  seoInput,
} from "@/shared/components/seo/seo-ui";
import { UnionStatusToast } from "@/shared/components/ui/union-status-toast";

function parseKeywords(value) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function joinKeywords(values) {
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))].join(", ");
}

function buildEmptyRow(keyword, domains) {
  return {
    keyword,
    totalResultsChecked: 0,
    searchFrequency: null,
    domains: Object.fromEntries(
      domains.map((domain) => [
        domain,
        {
          position: null,
          indexed: false,
        },
      ])
    ),
  };
}

function getNumericPosition(row, domain) {
  const position = row?.domains?.[domain]?.position;
  if (typeof position === "number" && Number.isFinite(position)) {
    return position;
  }
  // Outside TOP-100.
  return 101;
}

async function readJsonSafe(response, t) {
  const text = await response.text();
  if (!text || !text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    if (t) {
      throw new Error(t("jsonParseError", { status: response.status }));
    }
    throw new Error(`Invalid JSON (status ${response.status})`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, options = {}, attempts = 3, t) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const payload = await readJsonSafe(response, t);
      return { response, payload };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(350 * attempt);
      }
    }
  }
  throw lastError || new Error(t ? t("requestFailed") : "Request failed");
}

function toCsv(data, t) {
  const header = [t("csvKeywordColumn"), ...data.domains];
  const notFound = t("csvNotFound");
  const rows = data.rows.map((row) => {
    const values = data.domains.map((domain) => {
      const position = row.domains[domain]?.position;
      return position === null || position === undefined ? notFound : String(position);
    });
    return [row.keyword, ...values];
  });

  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"))
    .join("\n");
}

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Icon({ name }) {
  const common = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" };
  if (name === "export") {
    return (
      <svg {...common}>
        <path d="M12 3v12" />
        <path d="M7 10l5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
    );
  }
  return null;
}

export function SeoPositionsPanel() {
  const t = useTranslations("seoWorkbench");
  const [keywordsInput, setKeywordsInput] = useState("");
  const [storedKeywords, setStoredKeywords] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");

  function applyStatus(text) {
    setStatusMessage(text ? String(text) : "");
  }
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [domains, setDomains] = useState([]);
  const [domainsLoading, setDomainsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [tableSearch, setTableSearch] = useState("");
  const [domainIndexStatus, setDomainIndexStatus] = useState({});
  const [domainSortMode, setDomainSortMode] = useState("best");

  const inputKeywords = useMemo(() => parseKeywords(keywordsInput), [keywordsInput]);
  const keywords = storedKeywords;
  const canExport = useMemo(() => !!data?.rows?.length, [data]);
  const activeDomains = data?.domains?.length ? data.domains : domains;
  const domainIndexState = useMemo(() => {
    const rows = data?.rows || [];
    const map = {};
    for (const domain of activeDomains) {
      const fromRows = rows.some((row) => row?.domains?.[domain]?.indexed);
      const fromDirectCheck = domainIndexStatus[domain];
      map[domain] = typeof fromDirectCheck === "boolean" ? fromDirectCheck : fromRows;
    }
    return map;
  }, [activeDomains, data, domainIndexStatus]);
  const keywordsPerPage = 50;
  const tableRows = useMemo(() => {
    if (data?.rows?.length) {
      return data.rows;
    }
    return keywords.map((keyword) => ({
      keyword,
      totalResultsChecked: 0,
      domains: {},
    }));
  }, [data, keywords]);
  const searchQuery = String(tableSearch || "").trim().toLowerCase();

  const searchMatchedDomains = useMemo(() => {
    if (!searchQuery) {
      return [];
    }
    return activeDomains.filter((domain) => domain.toLowerCase().includes(searchQuery));
  }, [activeDomains, searchQuery]);

  const domainsForTable = useMemo(() => {
    if (!searchQuery || searchMatchedDomains.length === 0) {
      return activeDomains;
    }
    return searchMatchedDomains;
  }, [activeDomains, searchQuery, searchMatchedDomains]);

  const filteredTableRows = useMemo(() => {
    if (!searchQuery) {
      return tableRows;
    }
    const hasDomainFilter = searchMatchedDomains.length > 0;
    return tableRows.filter((row) => {
      if (String(row?.keyword || "").toLowerCase().includes(searchQuery)) {
        return true;
      }
      return hasDomainFilter;
    });
  }, [tableRows, searchQuery, searchMatchedDomains]);
  const totalPages = Math.max(1, Math.ceil(filteredTableRows.length / keywordsPerPage));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * keywordsPerPage;
    return filteredTableRows.slice(start, start + keywordsPerPage);
  }, [filteredTableRows, currentPage]);
  const sortedActiveDomains = useMemo(() => {
    const source = [...domainsForTable];
    if (domainSortMode === "none" || source.length <= 1 || !tableRows.length) {
      return source;
    }

    const metrics = new Map();
    for (const domain of source) {
      let total = 0;
      let misses = 0;
      let found = 0;
      let sumFoundPositions = 0;
      for (const row of tableRows) {
        const position = getNumericPosition(row, domain);
        total += 1;
        if (position > 100) {
          misses += 1;
        } else {
          found += 1;
          sumFoundPositions += position;
        }
      }
      metrics.set(domain, {
        total,
        misses,
        found,
        avgFound: found ? sumFoundPositions / found : 999,
      });
    }

    source.sort((a, b) => {
      const ma = metrics.get(a);
      const mb = metrics.get(b);
      if (!ma || !mb) return a.localeCompare(b);

      const missDelta = ma.misses - mb.misses;
      const avgDelta = ma.avgFound - mb.avgFound;
      const foundDelta = mb.found - ma.found;
      const lexical = a.localeCompare(b);

      if (domainSortMode === "best") {
        return missDelta || avgDelta || foundDelta || lexical;
      }
      if (domainSortMode === "worst") {
        return -missDelta || -avgDelta || -foundDelta || lexical;
      }
      return lexical;
    });
    return source;
  }, [domainsForTable, tableRows, domainSortMode]);

  function removeKeyword(keywordToRemove) {
    const nextStored = storedKeywords.filter((item) => item !== keywordToRemove);
    setStoredKeywords(nextStored);
    setData((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        keywords: (prev.keywords || []).filter((item) => item !== keywordToRemove),
        rows: (prev.rows || []).filter((row) => row.keyword !== keywordToRemove),
      };
    });

    fetch("/api/seo/keywords", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ keyword: keywordToRemove }),
    }).catch(() => {
      // Keep UI responsive even if delete request fails.
    });
  }

  async function saveKeywordsToSupabase(keywordList) {
    if (!keywordList.length) {
      return;
    }

    const { response, payload } = await fetchJsonWithRetry(
      "/api/seo/keywords",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ keywords: keywordList }),
      },
      3,
      t
    );
    if (!response.ok) {
      throw new Error(payload?.details || payload?.error || "Failed to save keywords");
    }
  }

  async function loadKeywordsFromSupabase() {
    const { response, payload } = await fetchJsonWithRetry(
      "/api/seo/keywords",
      {
        cache: "no-store",
      },
      3,
      t
    );
    if (!response.ok) {
      throw new Error(payload?.details || payload?.error || "Failed to fetch keywords");
    }
    return parseKeywords(joinKeywords(payload?.keywords || []));
  }

  async function saveDomainIndexStatusToSupabase(statusMap) {
    const statuses = Object.entries(statusMap).map(([host, isIndexed]) => ({
      host,
      is_indexed: !!isIndexed,
    }));

    if (!statuses.length) {
      return;
    }

    const { response, payload } = await fetchJsonWithRetry(
      "/api/seo/subdomains/index-status",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ statuses }),
      },
      3,
      t
    );

    if (!response.ok) {
      throw new Error(payload?.details || payload?.error || "Failed to update index statuses");
    }
  }

  async function checkAndPersistDomainIndexStatus(domainsToCheck) {
    if (!domainsToCheck.length) {
      return;
    }

    const nextStatus = {};
    const pendingDomains = [];
    for (const domain of domainsToCheck) {
      try {
        const query = encodeURIComponent(`site:${domain}`);
        const domainEncoded = encodeURIComponent(domain);
        const { response, payload } = await fetchJsonWithRetry(
          `/api/seo/check-position?query=${query}&domain=${domainEncoded}`,
          {},
          3,
          t
        );

        if (!response.ok) {
          const details = String(payload?.details || payload?.error || "");
          const isPending =
            details.includes("Запрос еще не обработан") ||
            details.includes("будет обработан") ||
            details.includes("попробуйте позже");

          if (isPending) {
            pendingDomains.push(domain);
            // Keep previous value if exists, otherwise temporary false.
            nextStatus[domain] = typeof domainIndexStatus[domain] === "boolean" ? domainIndexStatus[domain] : false;
            continue;
          }

          throw new Error(details || `Failed to check index status for ${domain}`);
        }

        nextStatus[domain] = !!payload?.indexed;
      } catch (error) {
        pendingDomains.push(domain);
        nextStatus[domain] = typeof domainIndexStatus[domain] === "boolean" ? domainIndexStatus[domain] : false;
      }
    }

    setDomainIndexStatus((prev) => ({
      ...prev,
      ...nextStatus,
    }));

    await saveDomainIndexStatusToSupabase(nextStatus);

    if (pendingDomains.length) {
      applyStatus(t("statusXmlQueue", { count: pendingDomains.length }));
    }
  }

  async function savePositionRows(rows, currentDomains) {
    if (!rows.length || !currentDomains.length) {
      return;
    }
    const { response, payload } = await fetchJsonWithRetry(
      "/api/seo/positions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rows, domains: currentDomains }),
      },
      3,
      t
    );
    if (!response.ok) {
      throw new Error(payload?.details || payload?.error || "Failed to save positions");
    }
  }

  async function loadSavedPositions(keywordList, currentDomains) {
    if (!keywordList.length || !currentDomains.length) {
      setData({
        keywords: keywordList,
        domains: currentDomains,
        rows: keywordList.map((keyword) => buildEmptyRow(keyword, currentDomains)),
        errors: [],
      });
      return { ok: true };
    }
    try {
      const params = new URLSearchParams({
        domains: currentDomains.join(","),
      });
      const { response, payload } = await fetchJsonWithRetry(
        `/api/seo/positions/load?${params.toString()}`,
        {},
        3,
        t
      );
      if (!response.ok) {
        throw new Error(payload?.details || payload?.error || "Failed to load positions");
      }

      const rowMap = new Map((payload?.rows || []).map((row) => [row.keyword, row]));
      const rows = keywordList.map((keyword) => {
        const saved = rowMap.get(keyword);
        if (!saved) {
          return buildEmptyRow(keyword, currentDomains);
        }
        const withDomains = { ...saved, domains: { ...(saved.domains || {}) } };
        for (const domain of currentDomains) {
          if (!withDomains.domains[domain]) {
            withDomains.domains[domain] = { position: null, indexed: false };
          }
        }
        return withDomains;
      });

      setData({
        keywords: keywordList,
        domains: currentDomains,
        rows,
        errors: [],
      });
      return { ok: true };
    } catch (error) {
      // Fallback: keep table visible even if saved positions API is temporarily unavailable.
      setData({
        keywords: keywordList,
        domains: currentDomains,
        rows: keywordList.map((keyword) => buildEmptyRow(keyword, currentDomains)),
        errors: [{ keyword: "*", message: error.message || "Failed to load positions" }],
      });
      return { ok: false, error };
    }
  }

  useEffect(() => {
    async function loadDomainsAndKeywords() {
      setDomainsLoading(true);
      try {
        const [domainsRequest, keywordsRequest] = await Promise.all([
          fetchJsonWithRetry("/api/seo/subdomains?sync=1", { cache: "no-store" }, 3, t),
          fetchJsonWithRetry("/api/seo/keywords", { cache: "no-store" }, 3, t),
        ]);
        const domainsResponse = domainsRequest.response;
        const keywordsResponse = keywordsRequest.response;
        const domainsPayload = domainsRequest.payload;
        const keywordsPayload = keywordsRequest.payload;

        if (!domainsResponse.ok) {
          throw new Error(domainsPayload?.details || domainsPayload?.error || "Failed to fetch domains");
        }
        if (!keywordsResponse.ok) {
          throw new Error(keywordsPayload?.details || keywordsPayload?.error || "Failed to fetch keywords");
        }

        setDomains(domainsPayload.domains || []);
        setDomainIndexStatus(domainsPayload.indexStatusMap || {});
        const loadedKeywords = parseKeywords(joinKeywords(keywordsPayload.keywords || []));
        setStoredKeywords(loadedKeywords);
        setKeywordsInput("");
        const positionsLoadResult = await loadSavedPositions(loadedKeywords, domainsPayload.domains || []);

        if ((domainsPayload.count || 0) === 0) {
          const warn = String(domainsPayload.warning || "").trim();
          applyStatus(t("statusNoDomainsFromDb", { warning: warn }).replace(/\s{2,}/g, " ").trim());
        } else {
          const syncedCount = Number(domainsPayload?.syncedFromHost?.upserted || 0);
          if (syncedCount > 0) {
            applyStatus(t("statusSyncedFromHost", { count: syncedCount }));
          }
          if (positionsLoadResult.ok) {
            applyStatus(
              t("statusLoaded", {
                domainCount: domainsPayload.count,
                keywordCount: (keywordsPayload.keywords || []).length,
              })
            );
          } else {
            applyStatus(
              t("statusLoadedPartial", {
                domainCount: domainsPayload.count,
                keywordCount: (keywordsPayload.keywords || []).length,
              })
            );
          }
        }
      } catch (error) {
        applyStatus(t("statusLoadFailed", { message: error.message }));
      } finally {
        setDomainsLoading(false);
      }
    }

    loadDomainsAndKeywords();
  }, [t]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [tableSearch]);

  async function refreshPositions(keywordList, selectedDomains, showProgress = true) {
    if (!keywordList.length || !selectedDomains.length) {
      return;
    }

    setData({
      keywords: [],
      domains: selectedDomains,
      rows: [],
      errors: [],
    });
    if (showProgress) {
      applyStatus(t("statusCaptureStart", { total: keywordList.length }));
    }

    let processed = 0;
    let failed = 0;
    const collectedRows = [];

    for (const keyword of keywordList) {
      try {
        const response = await fetch("/api/seo/check-batch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ keywords: [keyword], domains: selectedDomains }),
        });
        const payload = await readJsonSafe(response, t);
        if (!response.ok) {
          throw new Error(payload?.details || payload?.error || "Keyword request failed");
        }

        const row = payload?.rows?.[0] || buildEmptyRow(keyword, selectedDomains);
        const rowErrors = payload?.errors || [];
        collectedRows.push(row);

        setData((prev) => ({
          keywords: [...(prev?.keywords || []), keyword],
          domains: selectedDomains,
          rows: [...(prev?.rows || []), row],
          errors: [...(prev?.errors || []), ...rowErrors],
        }));

        await savePositionRows([row], selectedDomains);

        if (rowErrors.length > 0) {
          failed += 1;
        }
      } catch (error) {
        failed += 1;
        const fallbackRow = buildEmptyRow(keyword, selectedDomains);
        collectedRows.push(fallbackRow);

        setData((prev) => ({
          keywords: [...(prev?.keywords || []), keyword],
          domains: selectedDomains,
          rows: [...(prev?.rows || []), fallbackRow],
          errors: [
            ...(prev?.errors || []),
            {
              keyword,
              message: error.message || "Unknown error",
            },
          ],
        }));
      }

      processed += 1;
      if (showProgress) {
        applyStatus(
          t("statusCaptureProgress", {
            done: processed,
            total: keywordList.length,
            errorsPart: failed ? t("statusCaptureErrorsSuffix", { failed }) : "",
          })
        );
      }
    }

    applyStatus(
      failed
        ? t("statusCaptureDoneErrors", {
            done: processed,
            total: keywordList.length,
            failed,
          })
        : t("statusCaptureDone", { done: processed })
    );

  }

  async function runBatch() {
    const selectedDomains = domains;
    if (!selectedDomains.length) {
      applyStatus(t("statusNeedKeywordsAndDomains"));
      return;
    }

    setLoading(true);
    setCurrentPage(1);

    try {
      // Step 1: check domain index status and persist it to seo_domains.
      await checkAndPersistDomainIndexStatus(selectedDomains);

      // Always use the latest active keywords from Supabase only.
      const latestKeywords = await loadKeywordsFromSupabase();
      if (!latestKeywords.length) {
        setStoredKeywords([]);
        setKeywordsInput("");
        applyStatus(t("statusNoKeywords"));
        return;
      }

      setStoredKeywords(latestKeywords);
      setKeywordsInput("");
      await refreshPositions(latestKeywords, selectedDomains, true);
    } catch (error) {
      applyStatus(t("statusRunError", { message: error.message }));
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!data) {
      return;
    }
    const csv = toCsv(data, t);
    const now = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
    downloadCsv(`positions-${now}.csv`, csv);
  }

  async function importKeywordsFromFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const imported = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.split(/[;,|\t]/)[0]?.trim())
        .filter(Boolean);

      if (!imported.length) {
        applyStatus(t("statusCsvEmpty"));
        return;
      }

      const merged = [...new Set([...storedKeywords, ...parseKeywords(keywordsInput), ...imported])];
      setStoredKeywords(merged);
      setKeywordsInput("");
      await saveKeywordsToSupabase(merged);
      setCurrentPage(1);
      applyStatus(t("statusImportSaved", { count: imported.length }));
    } catch (error) {
      applyStatus(t("statusImportFailed", { message: error.message }));
    }
  }

  useEffect(() => {
    if (!storedKeywords.length || !domains.length || loading) {
      return;
    }

    const intervalId = setInterval(() => {
      refreshPositions(storedKeywords, domains, false).catch(() => {
        applyStatus(t("statusAutoRefreshFailed"));
      });
    }, 15 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [storedKeywords, domains, loading, t]);

  const dotIn = "inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(34,197,94,0.45)]";
  const dotOut = "inline-block h-2 w-2 shrink-0 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.35)]";

  const hasTableSearch = Boolean(searchQuery);
  const showPagination = totalPages > 1;
  const tableEmpty = !loading && !domainsLoading && filteredTableRows.length === 0;
  const tableEmptyMessage = hasTableSearch ? t("emptyFiltered") : t("emptyTable");

  const btnIconQuiet =
    "inline-flex cursor-pointer items-center justify-center rounded-lg p-2 text-union-muted transition-colors hover:bg-white/[0.06] hover:text-red-300 disabled:opacity-40";

  return (
    <>
      <UnionStatusToast
        message={statusMessage}
        variant="lime"
        onDismiss={() => applyStatus("")}
        dismissLabel={t("statusDismiss")}
      />

      <div className="w-full space-y-8 pb-10 pt-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-union-text">{t("title")}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={seoBtnLimeOutlineMuted}
            onClick={exportCsv}
            disabled={!canExport || loading}
          >
            <Icon name="export" />
            {t("exportCsv")}
          </button>
          <label className={`${seoBtnLimeOutline} cursor-pointer [&>input]:hidden`}>
            <input type="file" accept=".csv,.txt" onChange={importKeywordsFromFile} disabled={loading} />
            <Icon name="export" />
            {t("importCsv")}
          </label>
        </div>
      </div>

      <div className="space-y-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 space-y-1.5">
            <span className="text-xs font-medium text-union-muted">{t("keywordsLabel")}</span>
            <input
              type="text"
              className={seoInput}
              value={keywordsInput}
              onChange={(event) => setKeywordsInput(event.target.value)}
              onBlur={() => {
                const current = parseKeywords(joinKeywords([...storedKeywords, ...parseKeywords(keywordsInput)]));
                if (!current.length) {
                  return;
                }
                setStoredKeywords(current);
                setKeywordsInput("");
                saveKeywordsToSupabase(current).catch(() => {});
              }}
              placeholder={t("keywordsPlaceholder")}
              disabled={loading}
            />
          </label>

          <label className="block w-full shrink-0 space-y-1.5 sm:max-w-[min(100%,20rem)]">
            <span className="text-xs font-medium text-union-muted">{t("domainSortLabel")}</span>
            <select
              className={`${seoInput} w-full`}
              value={domainSortMode}
              onChange={(event) => setDomainSortMode(event.target.value)}
              disabled={loading || domainsLoading}
            >
              <option value="best">{t("sortBest")}</option>
              <option value="worst">{t("sortWorst")}</option>
              <option value="none">{t("sortNone")}</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={`${seoBtnPrimary} gap-2`} onClick={runBatch} disabled={loading}>
            {!loading ? <Rocket className="h-4 w-4 shrink-0" aria-hidden /> : null}
            {loading ? t("runningCapture") : t("runCapture")}
          </button>
        </div>
      </div>

      <section className={`${seoCard} overflow-hidden !p-0`}>
        <div className="space-y-4 border-b border-union-border px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-union-text">{t("positionsTableTitle")}</h2>
              <p className="mt-1 text-xs text-union-muted">
                {t("statsLine", {
                  columns: activeDomains.length,
                  domains: domains.length,
                  keywords: storedKeywords.length || 0,
                })}
              </p>
            </div>
            {showPagination && !loading ? (
              <div
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
                aria-label={t("paginationAria")}
              >
                <p className="text-xs text-union-muted">
                  <span className="font-medium text-[#d1fe17]">
                    {t("paginationSummary", { current: currentPage, total: totalPages })}
                  </span>
                  {hasTableSearch
                    ? t("paginationFilterFound", {
                        found: filteredTableRows.length,
                        total: tableRows.length,
                      })
                    : null}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={seoBtnLimeOutline}
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage <= 1 || loading}
                  >
                    <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
                    {t("navBack")}
                  </button>
                  <button
                    type="button"
                    className={seoBtnLimeOutline}
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage >= totalPages || loading}
                  >
                    {t("navNext")}
                    <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <label htmlFor="seo-positions-search" className="sr-only">
              {t("searchAria")}
            </label>
            <input
              id="seo-positions-search"
              type="search"
              className={`${seoInput} w-full`}
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchAria")}
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {hasTableSearch && !loading ? (
            <p className="text-xs text-union-muted">
              {searchMatchedDomains.length > 0
                ? t("filterResultDomains", {
                    count: searchMatchedDomains.length,
                    rows: filteredTableRows.length,
                  })
                : t("filterResultCount", { found: filteredTableRows.length })}
            </p>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-union-border bg-union-bg/50 text-xs text-union-muted">
              <tr>
                <th className="whitespace-nowrap px-5 py-3 font-medium">{t("colKeyword")}</th>
                {sortedActiveDomains.map((domain) => (
                  <th key={domain} className="whitespace-nowrap px-5 py-3 font-medium">
                    <span className="inline-flex max-w-[12rem] items-center gap-2">
                      <span
                        className={domainIndexState[domain] ? dotIn : dotOut}
                        title={domainIndexState[domain] ? t("indexIn") : t("indexOut")}
                      />
                      <span className="truncate font-mono text-xs font-normal text-union-muted">{domain}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading || domainsLoading ? (
                <tr>
                  <td
                    colSpan={Math.max(1, sortedActiveDomains.length + 1)}
                    className="px-5 py-8 text-center text-union-muted"
                  >
                    {t("loadingTable")}
                  </td>
                </tr>
              ) : tableEmpty ? (
                <tr>
                  <td
                    colSpan={Math.max(1, sortedActiveDomains.length + 1)}
                    className="px-5 py-8 text-center text-union-muted"
                  >
                    {tableEmptyMessage}
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => (
                  <tr
                    key={row.keyword}
                    className="border-b border-union-border/40 last:border-b-0 hover:bg-white/[0.02]"
                  >
                    <td className="max-w-[240px] px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-union-text">{row.keyword}</span>
                        <button
                          type="button"
                          className={btnIconQuiet}
                          onClick={() => removeKeyword(row.keyword)}
                          disabled={loading}
                          title={t("deleteKeywordTitle")}
                          aria-label={t("deleteKeywordAria", { keyword: row.keyword })}
                        >
                          <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        </button>
                      </div>
                    </td>
                    {sortedActiveDomains.map((domain) => {
                      const numericPosition = getNumericPosition(row, domain);
                      const miss = numericPosition > 100;
                      return (
                        <td
                          key={domain}
                          className={`px-5 py-3 text-right tabular-nums ${
                            miss ? "text-union-muted" : "font-medium text-[#d1fe17]"
                          }`}
                        >
                          {numericPosition}
                        </td>
                      );
                    })}
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
              {t("paginationSummary", { current: currentPage, total: totalPages })}
              {hasTableSearch
                ? t("paginationFilterFound", {
                    found: filteredTableRows.length,
                    total: tableRows.length,
                  })
                : null}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={seoBtnLimeOutline}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
                {t("navBack")}
              </button>
              <button
                type="button"
                className={seoBtnLimeOutline}
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
              >
                {t("navNext")}
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
    </>
  );
}
