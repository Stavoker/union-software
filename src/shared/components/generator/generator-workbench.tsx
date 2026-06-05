"use client";

import { Rocket, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { seoBtnPrimary, seoInput, seoNoteLime } from "@/shared/components/seo/seo-ui";
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

export type GeneratorPageCount = 1 | 2 | 3 | 4;

export type GeneratorGenerationMode = "standard" | "bot_gate";

export type GeneratorStack = "php" | "react";

export type GeneratorThemePreset = {
  value: string;
  pageCount?: GeneratorPageCount;
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

type DeployInfo = {
  status?: string;
  domain?: string;
  remotePath?: string;
  siteUrl?: string;
  message?: string;
};

type HostOption = {
  id: string;
  name: string | null;
  hostIp: string | null;
  projectsDir: string | null;
  hasPassword?: boolean;
};

type JobRow = {
  jobId: string;
  projectName: string;
  status: string;
  cursor: number;
  logTail: string[];
  error: string;
  progressPercent: number;
  deploy?: DeployInfo | null;
  hostId?: string;
  uploading?: boolean;
  downloadingZip?: boolean;
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

  const mainTheme = defaultTheme.trim();

  /** Основна тема бренду завжди в списку, далі — теми з БД. */
  const themeSelectOptions = useMemo(() => {
    const options: GeneratorThemePreset[] = [];
    const seen = new Set<string>();
    if (mainTheme) {
      options.push({ value: mainTheme });
      seen.add(mainTheme);
    }
    for (const preset of resolvedPresets) {
      const value = String(preset.value || "").trim();
      if (!value || seen.has(value)) continue;
      options.push(preset);
      seen.add(value);
    }
    if (!options.length) {
      return FALLBACK_THEME_PRESETS.map((value) => ({ value })) as GeneratorThemePreset[];
    }
    return options;
  }, [mainTheme, resolvedPresets]);

  const initialTheme = mainTheme || themeSelectOptions[0]?.value || FALLBACK_THEME_PRESETS[0] || "";

  const [projectName, setProjectName] = useState(() => randomProjectSlug());
  const [theme, setTheme] = useState(initialTheme);
  const [pageCount, setPageCount] = useState<GeneratorPageCount>(4);
  const [generationMode, setGenerationMode] = useState<GeneratorGenerationMode>("standard");
  const [stack, setStack] = useState<GeneratorStack>("php");
  const [siteCount, setSiteCount] = useState(1);
  const [siteUrl, setSiteUrl] = useState("");
  const [hosts, setHosts] = useState<HostOption[]>([]);
  const [hostsLoading, setHostsLoading] = useState(true);
  const [selectedHostId, setSelectedHostId] = useState("");
  const [domainScan, setDomainScan] = useState<{
    available: string[];
    occupied: string[];
    projectsBaseDir: string;
    warning: string | null;
  } | null>(null);
  const [domainScanLoading, setDomainScanLoading] = useState(false);

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
    let mounted = true;
    (async () => {
      setHostsLoading(true);
      try {
        const res = await fetch("/api/generator/hosts", { credentials: "include", cache: "no-store" });
        const data = (await res.json()) as { ok?: boolean; hosts?: HostOption[] };
        if (!mounted || !res.ok || !data.ok) return;
        const list = Array.isArray(data.hosts) ? data.hosts : [];
        setHosts(list);
        if (list.length === 1) {
          setSelectedHostId(String(list[0].id || ""));
        }
      } catch {
        /* ignore */
      } finally {
        if (mounted) setHostsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const hostId = String(selectedHostId || "").trim();
    if (!hostId) {
      setDomainScan(null);
      return;
    }
    let mounted = true;
    setDomainScanLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/generator/hosts/${encodeURIComponent(hostId)}/domains`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          available?: string[];
          occupied?: string[];
          projectsBaseDir?: string;
          warning?: string | null;
        };
        if (!mounted || !res.ok || !data.ok) {
          if (mounted) setDomainScan(null);
          return;
        }
        setDomainScan({
          available: Array.isArray(data.available) ? data.available : [],
          occupied: Array.isArray(data.occupied) ? data.occupied : [],
          projectsBaseDir: String(data.projectsBaseDir || "/var/www"),
          warning: data.warning ? String(data.warning) : null,
        });
      } catch {
        if (mounted) setDomainScan(null);
      } finally {
        if (mounted) setDomainScanLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedHostId]);

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
              deploy: (j as { deploy?: DeployInfo | null }).deploy ?? null,
              hostId: (j as { hostId?: string }).hostId,
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
        deploy?: DeployInfo | null;
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
            deploy: data.deploy ?? j.deploy ?? null,
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
          generationMode,
          stack,
          siteUrl: siteUrl.trim() || undefined,
          siteCount,
          hostId: selectedHostId.trim() || undefined,
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
          deploy: null,
          hostId: selectedHostId.trim() || undefined,
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

  async function downloadProjectZip(job: JobRow) {
    setJobs((prev) =>
      prev.map((j) => (j.jobId === job.jobId ? { ...j, downloadingZip: true } : j))
    );
    try {
      const url = `/api/generator/download?projectName=${encodeURIComponent(job.projectName)}`;
      const res = await fetch(url, { credentials: "include" });
      const contentType = String(res.headers.get("content-type") || "").toLowerCase();
      if (!res.ok || contentType.includes("application/json")) {
        let msg = t("downloadZipFailed");
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) msg = data.error;
        } catch {
          /* not json */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${job.projectName}.zip`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("downloadZipFailed"));
    } finally {
      setJobs((prev) =>
        prev.map((j) => (j.jobId === job.jobId ? { ...j, downloadingZip: false } : j))
      );
    }
  }

  async function uploadJobToHost(job: JobRow) {
    const hostId = String(job.hostId || selectedHostId || "").trim();
    if (!hostId) {
      setError(t("deployHostRequired"));
      return;
    }
    setJobs((prev) =>
      prev.map((j) => (j.jobId === job.jobId ? { ...j, uploading: true } : j))
    );
    try {
      const res = await fetch("/api/generator/deploy", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.jobId,
          projectName: job.projectName,
          hostId,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        deploy?: DeployInfo;
        error?: string;
        details?: string;
      };
      const deploy = data.deploy ?? null;
      setJobs((prev) =>
        prev.map((j) =>
          j.jobId === job.jobId
            ? {
                ...j,
                uploading: false,
                deploy: deploy || {
                  status: "failed",
                  message: data.details || data.error || "Deploy failed",
                },
              }
            : j
        )
      );
      if (selectedHostId) {
        const scanRes = await fetch(
          `/api/generator/hosts/${encodeURIComponent(selectedHostId)}/domains`,
          { credentials: "include", cache: "no-store" }
        );
        const scanData = (await scanRes.json()) as {
          ok?: boolean;
          available?: string[];
          occupied?: string[];
          projectsBaseDir?: string;
        };
        if (scanRes.ok && scanData.ok) {
          setDomainScan({
            available: Array.isArray(scanData.available) ? scanData.available : [],
            occupied: Array.isArray(scanData.occupied) ? scanData.occupied : [],
            projectsBaseDir: String(scanData.projectsBaseDir || "/var/www"),
            warning: null,
          });
        }
      }
    } catch (e) {
      setJobs((prev) =>
        prev.map((j) =>
          j.jobId === job.jobId
            ? {
                ...j,
                uploading: false,
                deploy: {
                  status: "failed",
                  message: e instanceof Error ? e.message : String(e),
                },
              }
            : j
        )
      );
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
              {themeSelectOptions.length > 0 ? (
                <select
                  value={theme}
                  onChange={(e) => {
                    const next = e.target.value;
                    setTheme(next);
                    const match = themeSelectOptions.find((p) => p.value === next);
                    if (match?.pageCount) setPageCount(match.pageCount);
                  }}
                  className="w-full rounded-xl border border-union-border bg-union-bg/80 px-3 py-2 text-sm text-union-text outline-none ring-union-ring focus:ring-2"
                >
                  {themeSelectOptions.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.value}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={theme}
                  onChange={(e) => {
                    const next = e.target.value;
                    setTheme(next);
                    const match = themeSelectOptions.find((p) => p.value === next);
                    if (match?.pageCount) setPageCount(match.pageCount);
                  }}
                  className="w-full rounded-xl border border-union-border bg-union-bg/80 px-3 py-2 text-sm text-union-text outline-none ring-union-ring focus:ring-2"
                />
              )}
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-union-muted">{t("pageCount")}</span>
              <select
                value={pageCount}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n >= 1 && n <= 4) setPageCount(n as GeneratorPageCount);
                }}
                className="w-full rounded-xl border border-union-border bg-union-bg/80 px-3 py-2 text-sm text-union-text outline-none ring-union-ring focus:ring-2"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
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

            <fieldset className="block space-y-2 md:col-span-2">
              <legend className="text-xs font-medium text-union-muted">{t("generationStack")}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    {
                      id: "php" as const,
                      title: t("generationStackPhpTitle"),
                      desc: t("generationStackPhpDesc"),
                    },
                    {
                      id: "react" as const,
                      title: t("generationStackReactTitle"),
                      desc: t("generationStackReactDesc"),
                    },
                  ] as const
                ).map((item) => {
                  const selected = stack === item.id;
                  return (
                    <label
                      key={item.id}
                      className={`flex cursor-pointer gap-3 rounded-xl border px-4 py-3 transition-colors ${
                        selected
                          ? "border-[#d1fe17]/55 bg-[#d1fe17]/[0.07] ring-1 ring-[#d1fe17]/35"
                          : "border-union-border bg-union-bg/80 hover:border-white/20"
                      }`}
                    >
                      <input
                        type="radio"
                        name="generationStack"
                        value={item.id}
                        checked={selected}
                        onChange={() => setStack(item.id)}
                        className="sr-only"
                      />
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                          selected
                            ? "border-[#d1fe17] bg-[#d1fe17]"
                            : "border-union-border bg-transparent"
                        }`}
                        aria-hidden
                      >
                        {selected ? <span className="h-2 w-2 rounded-full bg-black" /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-union-text">{item.title}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-union-muted">
                          {item.desc}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="block space-y-2 md:col-span-2">
              <legend className="text-xs font-medium text-union-muted">{t("generationMode")}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    {
                      id: "standard" as const,
                      title: t("generationModeStandardTitle"),
                      desc: t("generationModeStandardDesc"),
                    },
                    {
                      id: "bot_gate" as const,
                      title: t("generationModeBotGateTitle"),
                      desc: t("generationModeBotGateDesc"),
                    },
                  ] as const
                ).map((mode) => {
                  const selected = generationMode === mode.id;
                  return (
                    <label
                      key={mode.id}
                      className={`flex cursor-pointer gap-3 rounded-xl border px-4 py-3 transition-colors ${
                        selected
                          ? "border-[#d1fe17]/55 bg-[#d1fe17]/[0.07] ring-1 ring-[#d1fe17]/35"
                          : "border-union-border bg-union-bg/80 hover:border-white/20"
                      }`}
                    >
                      <input
                        type="radio"
                        name="generationMode"
                        value={mode.id}
                        checked={selected}
                        onChange={() => setGenerationMode(mode.id)}
                        className="sr-only"
                      />
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                          selected
                            ? "border-[#d1fe17] bg-[#d1fe17]"
                            : "border-union-border bg-transparent"
                        }`}
                        aria-hidden
                      >
                        {selected ? (
                          <span className="h-2 w-2 rounded-full bg-black" />
                        ) : null}
                      </span>
                      <span className="min-w-0 space-y-1">
                        <span className="block text-sm font-medium text-union-text">{mode.title}</span>
                        <span className="block text-xs leading-relaxed text-union-muted">{mode.desc}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid min-w-0 gap-5 md:col-span-2 md:grid-cols-2 md:items-start">
              <label className="block min-w-0 space-y-1.5">
                <span className="text-xs font-medium text-union-muted">
                  {t("deployHost")}{" "}
                  <span className="font-normal text-union-muted/80">({t("deployHostOptional")})</span>
                </span>
                {hostsLoading ? (
                  <p className="text-sm text-union-muted">{t("deployHostScanning")}</p>
                ) : hosts.length === 0 ? (
                  <p className="text-sm text-union-muted">
                    {t("deployHostNoHosts")}{" "}
                    <Link href="/dashboard/settings" className="text-[#d1fe17] underline-offset-2 hover:underline">
                      {t("deployHostSettingsLink")}
                    </Link>
                  </p>
                ) : (
                  <select
                    value={selectedHostId}
                    onChange={(e) => setSelectedHostId(e.target.value)}
                    className={`${seoInput} w-full`}
                  >
                    <option value="">{t("deployHostPlaceholder")}</option>
                    {hosts.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name || h.hostIp}
                        {h.hostIp ? ` (${h.hostIp})` : ""}
                        {!h.hasPassword ? " — no password" : ""}
                      </option>
                    ))}
                  </select>
                )}
                {selectedHostId && domainScan ? (
                  <div className="space-y-1 pt-1 text-xs text-union-muted">
                    <p>{t("deployHostPath", { path: domainScan.projectsBaseDir })}</p>
                    <p className="font-medium text-[#D1FE17]">
                      {t("deployHostAvailable", { count: domainScan.available.length })}
                      {" · "}
                      {t("deployHostOccupied", { count: domainScan.occupied.length })}
                    </p>
                    {domainScan.warning ? <p className="text-amber-200/90">{domainScan.warning}</p> : null}
                  </div>
                ) : null}
                {selectedHostId && domainScanLoading ? (
                  <p className="text-xs text-union-muted">{t("deployHostScanning")}</p>
                ) : null}
              </label>

              <label className="block min-w-0 space-y-1.5">
                <span className="text-xs font-medium text-union-muted">
                  {t("siteUrl")}{" "}
                  <span className="font-normal text-union-muted/80">({t("siteUrlOptional")})</span>
                </span>
                <input
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  className={`${seoInput} w-full`}
                  placeholder="https://example.com"
                />
                <p className="text-xs leading-relaxed text-union-muted">{t("siteUrlHint")}</p>
              </label>
            </div>
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
              const canStop = !TERMINAL.has(job.status);
              const canDismiss = TERMINAL.has(job.status);
              const deploy = job.deploy;
              const deployStatus = String(deploy?.status || "");
              const deployPending =
                done &&
                deployStatus !== "deployed" &&
                (deployStatus === "pending_no_slot" ||
                  deployStatus === "failed" ||
                  !deployStatus ||
                  (deployStatus === "skipped_no_host" && Boolean(selectedHostId)));
              const deployOk = deployStatus === "deployed" && deploy?.domain;
              const showUploadBtn = done && deployPending && !job.uploading;

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

                  {done && deployStatus === "pending_no_slot" ? (
                    <p className={`${seoNoteLime} mt-4 text-xs`}>{t("deployPending")}</p>
                  ) : null}
                  {done && deployStatus === "failed" && deploy?.message ? (
                    <p className={`${seoNoteLime} mt-4 text-xs`}>
                      {t("deployFailed", { message: deploy.message })}
                    </p>
                  ) : null}
                  {deployOk ? (
                    <p className="mt-4 text-xs text-[#d1fe17]">
                      {t("deployDone", { domain: deploy.domain || "" })}
                      {deploy.siteUrl ? (
                        <>
                          {" "}
                          <a
                            href={deploy.siteUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2"
                          >
                            {t("deployOpenSite")}
                          </a>
                        </>
                      ) : null}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {done ? (
                      <button
                        type="button"
                        disabled={job.downloadingZip}
                        onClick={() => void downloadProjectZip(job)}
                        className="inline-flex items-center justify-center rounded-full border border-union-accent/40 bg-union-accent/10 px-4 py-2 text-xs font-medium text-union-accent hover:bg-union-accent/20 disabled:opacity-50"
                      >
                        {job.downloadingZip ? t("downloadingZip") : t("downloadZip")}
                      </button>
                    ) : null}
                    {showUploadBtn ? (
                      <button
                        type="button"
                        disabled={job.uploading}
                        onClick={() => void uploadJobToHost(job)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[#d1fe17] px-4 py-2 text-xs font-medium text-[#d1fe17] transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {job.uploading ? t("uploadingToHost") : t("uploadToHost")}
                      </button>
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
