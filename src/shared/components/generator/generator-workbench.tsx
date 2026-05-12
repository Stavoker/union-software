"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { GeneratorOrb } from "./generator-orb";

const POLL_MS = 1500;

const TERMINAL = new Set(["done", "error", "cancelled"]);

const THEME_PRESETS = [
  "казино онлайн",
  "бонусы и фриспины",
  "live casino",
  "слоты без верификации",
  "vip программа казино",
  "мобильное казино",
];

/** `u-` + English word + exactly 3 digits (folder-safe, matches random slug button). */
const SLUG_WORDS = [
  "site",
  "page",
  "web",
  "net",
  "app",
  "hub",
  "club",
  "zone",
  "spot",
  "play",
  "star",
  "gold",
  "blue",
  "top",
  "best",
  "pro",
  "vip",
  "live",
  "slot",
  "spin",
  "win",
  "bet",
  "luck",
  "mega",
  "super",
  "game",
  "cash",
  "bonus",
] as const;

function randomUint32(): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] ?? 0;
  }
  return Math.floor(Math.random() * 0x1_0000_0000);
}

function randomProjectSlug() {
  const word = SLUG_WORDS[randomUint32() % SLUG_WORDS.length] ?? "site";
  const n = randomUint32() % 1000;
  return `u-${word}${String(n).padStart(3, "0")}`;
}

function sanitizeProjectBase(name: string) {
  const value = name.trim();
  if (!value) return "";
  const safe = value.replace(/[^a-zA-Z0-9._-]/g, "-");
  return safe || "";
}

function makeVisualPreviewJobs(projectNameRaw: string, siteCount: number): JobRow[] {
  const safe = sanitizeProjectBase(projectNameRaw);
  if (!safe) return [];
  const names =
    siteCount <= 1
      ? [safe]
      : Array.from({ length: siteCount }, (_, i) => `${safe}-s${i + 1}`);
  const stamp = Date.now();
  return names.map((projectName, i) => ({
    jobId: `__preview__${stamp}_${i}`,
    projectName,
    status: "running",
    cursor: 0,
    logTail: [],
    error: "",
    progressPercent: Math.min(28, 6 + i * 5),
  }));
}

function isPreviewJobId(jobId: string) {
  return jobId.startsWith("__preview__");
}

type JobRow = {
  jobId: string;
  projectName: string;
  status: string;
  cursor: number;
  logTail: string[];
  error: string;
  progressPercent: number;
};

export function GeneratorWorkbench() {
  const t = useTranslations("generatorWorkbench");

  const [projectName, setProjectName] = useState(() => randomProjectSlug());
  const [theme, setTheme] = useState(THEME_PRESETS[0] ?? "казино онлайн");
  const [pageCount, setPageCount] = useState<3 | 4>(4);
  const [siteCount, setSiteCount] = useState(1);
  const [siteUrl, setSiteUrl] = useState("");

  const [starting, setStarting] = useState(false);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [error, setError] = useState("");

  const jobsRef = useRef<JobRow[]>([]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const pollOne = useCallback(async (row: JobRow) => {
    if (isPreviewJobId(row.jobId)) return;
    try {
      const url = `/api/generator/build/jobs/${encodeURIComponent(row.jobId)}?cursor=${row.cursor}`;
      const res = await fetch(url, { credentials: "include" });
      const data = (await res.json()) as {
        ok?: boolean;
        logs?: string[];
        cursor?: number;
        status?: string;
        error?: string;
        progressPercent?: number;
      };
      if (!data.ok || !Array.isArray(data.logs)) return;
      const lines = data.logs;
      const nextCursor =
        typeof data.cursor === "number" ? data.cursor : row.cursor + lines.length;
      const st = String(data.status || row.status);
      const pct =
        typeof data.progressPercent === "number" && Number.isFinite(data.progressPercent)
          ? Math.max(0, Math.min(100, Math.round(data.progressPercent)))
          : row.progressPercent;

      setJobs((prev) =>
        prev.map((j) => {
          if (j.jobId !== row.jobId) return j;
          const merged = [...j.logTail, ...lines];
          const logTail = merged.length > 400 ? merged.slice(-400) : merged;
          return {
            ...j,
            logTail,
            cursor: nextCursor,
            status: st,
            progressPercent: pct,
            error: data.error || j.error,
          };
        })
      );
    } catch {
      /* ignore transient network errors */
    }
  }, []);

  const hasPreviewJobs = jobs.some((j) => isPreviewJobId(j.jobId));

  useEffect(() => {
    if (!hasPreviewJobs) return;
    const id = setInterval(() => {
      setJobs((prev) =>
        prev.map((j) => {
          if (!isPreviewJobId(j.jobId)) return j;
          if (j.progressPercent >= 42) return j;
          return { ...j, progressPercent: Math.min(42, j.progressPercent + 4) };
        })
      );
    }, 420);
    return () => clearInterval(id);
  }, [hasPreviewJobs]);

  const hasActiveJob = jobs.some((j) => !TERMINAL.has(j.status));
  const showForm = !starting && !hasActiveJob;
  const showOrb = starting || (jobs.length > 0 && hasActiveJob);
  const showCards = jobs.length > 0;

  useEffect(() => {
    if (!hasActiveJob) return;
    const tick = () => {
      const list = jobsRef.current.filter(
        (j) => !TERMINAL.has(j.status) && !isPreviewJobId(j.jobId)
      );
      void Promise.all(list.map((j) => pollOne(j)));
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [hasActiveJob, pollOne]);

  async function startBuild() {
    setError("");
    setStarting(true);
    const previews = makeVisualPreviewJobs(projectName, siteCount);
    setJobs(previews);
    try {
      const res = await fetch("/api/generator/build/jobs/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName,
          theme,
          pageCount,
          siteUrl: siteUrl.trim() || undefined,
          siteCount,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        jobs?: { jobId: string; projectName: string }[];
        error?: string;
      };
      if (!res.ok || !data.ok || !Array.isArray(data.jobs) || !data.jobs.length) {
        throw new Error(data.error || t("startFailed"));
      }
      setJobs(
        data.jobs.map((j) => ({
          jobId: j.jobId,
          projectName: j.projectName,
          status: "queued",
          cursor: 0,
          logTail: [],
          error: "",
          progressPercent: 0,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("startFailed"));
      setJobs([]);
    } finally {
      setStarting(false);
    }
  }

  async function cancelJob(jobId: string) {
    if (isPreviewJobId(jobId)) return;
    try {
      await fetch(`/api/generator/build/jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="w-full space-y-0">
      {showForm ? (
        <div className="space-y-6 pb-10 pt-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-union-text">
              {t("title")}
            </h1>
            {t("subtitle")?.trim() ? (
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-union-muted">
                {t("subtitle")}
              </p>
            ) : null}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-union-muted">{t("projectName")}</span>
              <div className="flex overflow-hidden rounded-xl border border-union-border bg-union-bg/80 ring-union-ring focus-within:ring-2">
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm text-union-text outline-none placeholder:text-union-muted"
                  placeholder="u-casino742"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setProjectName(randomProjectSlug())}
                  className="shrink-0 cursor-pointer border-l border-black/10 bg-[#d1fe17] px-3 py-2 text-xs font-semibold text-black transition-[opacity,filter] hover:opacity-90 active:brightness-95"
                >
                  {t("newSlug")}
                </button>
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-union-muted">{t("theme")}</span>
              <input
                list="generator-theme-presets"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="w-full rounded-xl border border-union-border bg-union-bg/80 px-3 py-2 text-sm text-union-text outline-none ring-union-ring focus:ring-2"
              />
              <datalist id="generator-theme-presets">
                {THEME_PRESETS.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-union-muted">{t("pageCount")}</span>
              <select
                value={pageCount}
                onChange={(e) => setPageCount(Number(e.target.value) === 3 ? 3 : 4)}
                className="w-full rounded-xl border border-union-border bg-union-bg/80 px-3 py-2 text-sm text-union-text outline-none ring-union-ring focus:ring-2"
              >
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-union-muted">{t("siteCount")}</span>
              <select
                value={siteCount}
                onChange={(e) => setSiteCount(Number(e.target.value))}
                className="w-full rounded-xl border border-union-border bg-union-bg/80 px-3 py-2 text-sm text-union-text outline-none ring-union-ring focus:ring-2"
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-xs font-medium text-union-muted">{t("siteUrl")}</span>
              <input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                className="w-full rounded-xl border border-union-border bg-union-bg/80 px-3 py-2 text-sm text-union-text outline-none ring-union-ring placeholder:text-union-muted focus:ring-2"
                placeholder="https://example.com"
              />
            </label>
          </div>

          {error ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            disabled={starting}
            onClick={() => void startBuild()}
            className="inline-flex cursor-pointer items-center justify-center rounded-full bg-union-accent px-5 py-2.5 text-sm font-medium text-union-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {starting ? t("starting") : t("start")}
          </button>
        </div>
      ) : null}

      {showOrb ? (
        <div className={showCards ? "w-full mb-7 md:mb-9" : "w-full"}>
          <GeneratorOrb />
        </div>
      ) : null}

      {showCards ? (
        <div
          className={`w-full space-y-4 pb-12 ${showForm ? "pt-10" : showOrb ? "pt-2 md:pt-3" : "pt-2"}`}
        >
          <div className="grid gap-4 md:grid-cols-2">
            {jobs.map((job) => {
              const done = job.status === "done";
              const downloadZip = done
                ? `/api/generator/download?projectName=${encodeURIComponent(job.projectName)}`
                : null;
              const canStop = !TERMINAL.has(job.status) && !isPreviewJobId(job.jobId);

              return (
                <div
                  key={job.jobId}
                  className="rounded-2xl border border-union-border bg-union-surface/50 p-4 backdrop-blur-md md:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-union-muted">
                          {t("jobProject")}
                        </p>
                        {isPreviewJobId(job.jobId) ? (
                          <span className="rounded-full border border-amber-400/35 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-100/90">
                            {t("visualPreviewBadge")}
                          </span>
                        ) : null}
                      </div>
                      <p className="truncate font-mono text-sm text-union-text">{job.projectName}</p>
                      <p className="mt-1 text-xs text-union-muted">
                        {t("status")}: <span className="text-union-text">{job.status}</span>
                      </p>
                    </div>
                    <p className="shrink-0 text-lg font-semibold tabular-nums text-union-accent">
                      {job.progressPercent}%
                    </p>
                  </div>

                  <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-black/35">
                    <div
                      className="h-full rounded-full transition-[width] duration-500 ease-out"
                      style={{
                        width: `${job.progressPercent}%`,
                        backgroundColor: "#d1fe17",
                        boxShadow: "0 0 14px rgb(209 254 23 / 0.55)",
                      }}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {downloadZip ? (
                      <a
                        href={downloadZip}
                        className="inline-flex items-center justify-center rounded-full border border-union-accent/40 bg-union-accent/10 px-4 py-2 text-xs font-medium text-union-accent hover:bg-union-accent/20"
                      >
                        {t("downloadZip")}
                      </a>
                    ) : null}
                    {canStop ? (
                      <button
                        type="button"
                        onClick={() => void cancelJob(job.jobId)}
                        className="cursor-pointer rounded-full border border-union-border px-4 py-2 text-xs text-union-muted transition-colors hover:border-white/20 hover:text-union-text"
                      >
                        {t("stopThisSite")}
                      </button>
                    ) : null}
                  </div>

                  {job.error ? (
                    <p className="mt-3 text-xs text-red-200/90">{job.error}</p>
                  ) : null}

                  {job.logTail.length ? (
                    <details className="mt-3 group">
                      <summary className="cursor-pointer text-xs text-union-muted hover:text-union-text">
                        {t("logTitle")}
                      </summary>
                      <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-union-border/60 bg-black/25 p-2 font-mono text-[10px] leading-relaxed text-union-text/85">
                        {job.logTail.join("\n")}
                      </pre>
                    </details>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
