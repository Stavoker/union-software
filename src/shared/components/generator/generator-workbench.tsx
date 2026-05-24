"use client";

import { Rocket, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { seoBtnPrimary } from "@/shared/components/seo/seo-ui";
import { GeneratorOrb } from "./generator-orb";

const POLL_MS = 1500;
const JOBS_SESSION_KEY = "union_gen_tracked_jobs_v1";
const DISMISSED_JOBS_SESSION_KEY = "union_gen_dismissed_jobs_v1";

function readDismissedJobIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_JOBS_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed) ? parsed.map((id) => String(id || "")).filter(Boolean) : []
    );
  } catch {
    return new Set();
  }
}

function writeDismissedJobIds(ids: Set<string>) {
  try {
    sessionStorage.setItem(DISMISSED_JOBS_SESSION_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

function writeTrackedJobs(jobs: JobRow[]) {
  try {
    sessionStorage.setItem(
      JOBS_SESSION_KEY,
      JSON.stringify(jobs.map((j) => ({ jobId: j.jobId, projectName: j.projectName })))
    );
  } catch {
    /* ignore */
  }
}

const TERMINAL = new Set(["done", "error", "cancelled"]);

const FALLBACK_THEME_PRESETS = [
  "казино онлайн",
  "бонусы и фриспины",
  "live casino",
  "слоты без верификации",
  "vip программа казино",
  "мобильное казино",
];

export type GeneratorThemePreset = {
  value: string;
  pageCount?: 3 | 4;
};

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

type JobRow = {
  jobId: string;
  projectName: string;
  status: string;
  cursor: number;
  logTail: string[];
  error: string;
  progressPercent: number;
};

type GeneratorWorkbenchProps = {
  themePresets?: GeneratorThemePreset[];
  defaultTheme?: string;
};

export function GeneratorWorkbench({
  themePresets = [],
  defaultTheme = "",
}: GeneratorWorkbenchProps) {
  const t = useTranslations("generatorWorkbench");

  const resolvedPresets: GeneratorThemePreset[] =
    themePresets.length > 0
      ? themePresets
      : FALLBACK_THEME_PRESETS.map((value) => ({ value }));

  const initialTheme =
    defaultTheme.trim() ||
    resolvedPresets[0]?.value ||
    FALLBACK_THEME_PRESETS[0] ||
    "";

  const [projectName, setProjectName] = useState(() => randomProjectSlug());
  const [theme, setTheme] = useState(initialTheme);
  const [pageCount, setPageCount] = useState<3 | 4>(4);
  const [siteCount, setSiteCount] = useState(1);
  const [siteUrl, setSiteUrl] = useState("");

  const [starting, setStarting] = useState(false);
  const [resuming, setResuming] = useState(true);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [dismissedJobIds, setDismissedJobIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");

  const jobsRef = useRef<JobRow[]>([]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    setDismissedJobIds(readDismissedJobIds());
  }, []);

  useEffect(() => {
    if (!jobs.length) return;
    writeTrackedJobs(jobs);
  }, [jobs]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/generator/build/jobs", {
          cache: "no-store",
          credentials: "include",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          jobs?: JobRow[];
        };
        if (!mounted || !res.ok || !data.ok || !Array.isArray(data.jobs)) return;
        const dismissed = readDismissedJobIds();
        const visible = data.jobs.filter((j) => j?.jobId && !dismissed.has(j.jobId));
        if (visible.length) {
          setDismissedJobIds(dismissed);
          setJobs(
            visible.map((j) => ({
              jobId: j.jobId,
              projectName: j.projectName,
              status: j.status || "queued",
              cursor: typeof j.cursor === "number" ? j.cursor : 0,
              logTail: Array.isArray(j.logTail) ? j.logTail : [],
              error: j.error || "",
              progressPercent:
                typeof j.progressPercent === "number" ? j.progressPercent : 0,
            }))
          );
        }
      } catch {
        /* ignore */
      } finally {
        if (mounted) setResuming(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const pollOne = useCallback(async (row: JobRow) => {
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

  const hasActiveJob = jobs.some((j) => !TERMINAL.has(j.status));
  const showForm = !starting && !hasActiveJob && !resuming;
  const showOrb = starting || resuming || hasActiveJob;
  const showCards = jobs.length > 0;

  useEffect(() => {
    if (!hasActiveJob) return;
    const tick = () => {
      const list = jobsRef.current.filter((j) => !TERMINAL.has(j.status));
      void Promise.all(list.map((j) => pollOne(j)));
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [hasActiveJob, pollOne]);

  async function startBuild() {
    setError("");
    setStarting(true);
    setJobs([]);
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
    try {
      await fetch(`/api/generator/build/jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* ignore */
    }
  }

  function dismissJob(jobId: string) {
    setJobs((prev) => {
      const next = prev.filter((j) => j.jobId !== jobId);
      writeTrackedJobs(next);
      return next;
    });
    setDismissedJobIds((prev) => {
      const next = new Set(prev);
      next.add(jobId);
      writeDismissedJobIds(next);
      return next;
    });
  }

  return (
    <div className="w-full space-y-0">
      {resuming && !jobs.length ? (
        <p className="pb-6 pt-2 text-sm text-union-muted">{t("resuming")}</p>
      ) : null}

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
                onChange={(e) => {
                  const next = e.target.value;
                  setTheme(next);
                  const match = resolvedPresets.find((p) => p.value === next);
                  if (match?.pageCount) setPageCount(match.pageCount);
                }}
                className="w-full rounded-xl border border-union-border bg-union-bg/80 px-3 py-2 text-sm text-union-text outline-none ring-union-ring focus:ring-2"
              />
              <datalist id="generator-theme-presets">
                {resolvedPresets.map((p) => (
                  <option key={p.value} value={p.value} />
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
            className={`${seoBtnPrimary} gap-2`}
          >
            {!starting ? <Rocket className="h-4 w-4 shrink-0" aria-hidden /> : null}
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
              const canStop = !TERMINAL.has(job.status);
              const canDismiss = TERMINAL.has(job.status);

              return (
                <div
                  key={job.jobId}
                  className="relative rounded-2xl border border-union-border bg-union-surface/50 p-4 backdrop-blur-md md:p-5"
                >
                  {canDismiss ? (
                    <button
                      type="button"
                      onClick={() => dismissJob(job.jobId)}
                      className="absolute right-3 top-3 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-union-border/80 bg-black/30 text-union-muted transition-colors hover:border-white/25 hover:bg-black/50 hover:text-union-text"
                      aria-label={t("dismissJob")}
                      title={t("dismissJob")}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  ) : null}
                  <div className="flex flex-wrap items-start justify-between gap-2 pr-9">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-union-muted">
                        {t("jobProject")}
                      </p>
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
