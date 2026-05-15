import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getJobsDir, getProjectsDir } from "@/src/lib/app-paths";
import {
  acquirePairedLlmLease,
  releasePairedLlmLease,
  getDeepseekPoolSize,
} from "@/src/lib/deepseek-key-pool";

const JOB_TTL_SEC = Math.ceil((1000 * 60 * 60 * 6) / 1000);
const MAX_LOG_LINES = 5000;
const FLUSH_DEBOUNCE_MS = 800;

/**
 * Next.js dev (Turbopack/HMR) reloads modules — keep Map on globalThis.
 * On Render / multi-instance: each dyno has its own memory and disk — use Redis (REDIS_URL).
 */
function getJobsMap() {
  const g = globalThis;
  if (!g.__auroraBuildJobsMap) {
    g.__auroraBuildJobsMap = new Map();
  }
  return g.__auroraBuildJobsMap;
}

/** Lazy Redis client for shared job state across instances (Render horizontal scaling). */
let redisClient = null;
function getRedisUrl() {
  return (
    process.env.REDIS_URL?.trim() ||
    process.env.BUILD_JOBS_REDIS_URL?.trim() ||
    ""
  );
}

async function getRedis() {
  const url = getRedisUrl();
  if (!url) return null;
  if (!redisClient) {
    const { default: Redis } = await import("ioredis");
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }
  return redisClient;
}

function jobRedisKey(id) {
  return `aurora:buildjob:${String(id || "").trim()}`;
}

async function saveJobRedis(job) {
  if (!job?.id || !getRedisUrl()) return;
  try {
    const r = await getRedis();
    if (!r) return;
    await r.setex(jobRedisKey(job.id), JOB_TTL_SEC, JSON.stringify(job));
  } catch {
    /* ignore */
  }
}

async function loadJobRedis(id) {
  const key = String(id || "").trim();
  if (!key || !getRedisUrl()) return null;
  try {
    const r = await getRedis();
    if (!r) return null;
    const raw = await r.get(jobRedisKey(key));
    if (!raw) return null;
    const job = JSON.parse(raw);
    return job && job.id === key ? job : null;
  } catch {
    return null;
  }
}

const flushTimers = new Map();

function jobFilePath(id) {
  const safe = String(id || "").replace(/[^a-z0-9-]/gi, "");
  return path.join(getJobsDir(), `${safe}.json`);
}

function ensureJobsDir() {
  try {
    fs.mkdirSync(getJobsDir(), { recursive: true });
  } catch {
    /* ignore */
  }
}

function persistJobSync(job) {
  if (!job?.id) return;
  ensureJobsDir();
  try {
    fs.writeFileSync(jobFilePath(job.id), JSON.stringify(job), "utf8");
  } catch {
    /* ignore disk errors */
  }
}

function loadJobFromDisk(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  try {
    const raw = fs.readFileSync(jobFilePath(key), "utf8");
    const job = JSON.parse(raw);
    if (job && job.id === key) return job;
  } catch {
    /* missing or corrupt */
  }
  return null;
}

function schedulePersist(job) {
  if (!job?.id) return;
  const id = job.id;
  const prev = flushTimers.get(id);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    flushTimers.delete(id);
    persistJobSync(job);
    void saveJobRedis(job);
  }, FLUSH_DEBOUNCE_MS);
  flushTimers.set(id, t);
}

function nowIso() {
  return new Date().toISOString();
}

function gcJobs() {
  const jobs = getJobsMap();
  const now = Date.now();
  const ttlMs = JOB_TTL_SEC * 1000;
  for (const [id, job] of jobs.entries()) {
    const updatedTs = Date.parse(job.updatedAt || 0) || 0;
    if (now - updatedTs > ttlMs) {
      jobs.delete(id);
      try {
        fs.unlinkSync(jobFilePath(id));
      } catch {
        /* ignore */
      }
      void (async () => {
        try {
          const r = await getRedis();
          if (r) await r.del(jobRedisKey(id));
        } catch {
          /* ignore */
        }
      })();
    }
  }
}

/** Fast path: same process that created the job (writer). Sync memory + disk. */
function getBuildJobLocal(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  const jobs = getJobsMap();
  let job = jobs.get(key);
  if (job) return job;
  job = loadJobFromDisk(key);
  if (job) {
    jobs.set(key, job);
  }
  return job;
}

/**
 * For polling from any instance: memory → disk → Redis.
 */
export async function getBuildJob(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  let job = getBuildJobLocal(key);
  if (job) return job;
  job = await loadJobRedis(key);
  if (job) {
    getJobsMap().set(key, job);
  }
  return job;
}

export async function createBuildJob(payload) {
  gcJobs();
  const id = randomUUID();
  const job = {
    id,
    status: "queued",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    logs: [],
    result: null,
    error: "",
    payload,
  };
  getJobsMap().set(id, job);
  persistJobSync(job);
  await saveJobRedis(job);
  return id;
}

export function appendBuildJobLog(id, message) {
  const job = getBuildJobLocal(id);
  if (!job) return;
  const line = String(message || "").trim();
  if (!line) return;
  job.logs.push(line);
  if (job.logs.length > MAX_LOG_LINES) {
    job.logs.splice(0, job.logs.length - MAX_LOG_LINES);
  }
  job.updatedAt = nowIso();
  schedulePersist(job);
}

export async function markBuildJobRunning(id) {
  const job = getBuildJobLocal(id);
  if (!job) return;
  job.status = "running";
  job.updatedAt = nowIso();
  persistJobSync(job);
  await saveJobRedis(job);
}

async function persistTokenUsageForJob(job) {
  try {
    const { recordGeneratorTokenUsageFromJob } = await import(
      "@/lib/generator-token-usage.js"
    );
    await recordGeneratorTokenUsageFromJob(job);
  } catch (e) {
    console.error("[build-jobs] token usage persist:", e?.message || e);
  }
}

export async function markBuildJobDone(id, result) {
  const job = getBuildJobLocal(id);
  if (!job) return;
  job.status = "done";
  job.result = result || null;
  job.updatedAt = nowIso();
  const prev = flushTimers.get(id);
  if (prev) clearTimeout(prev);
  flushTimers.delete(id);
  persistJobSync(job);
  await saveJobRedis(job);
  void persistTokenUsageForJob(job);
}

export async function markBuildJobError(id, error) {
  const job = getBuildJobLocal(id);
  if (!job) return;
  job.status = "error";
  job.error = String(error || "Ошибка сборки");
  job.updatedAt = nowIso();
  const prev = flushTimers.get(id);
  if (prev) clearTimeout(prev);
  flushTimers.delete(id);
  persistJobSync(job);
  await saveJobRedis(job);
  void persistTokenUsageForJob(job);
}

export async function markBuildJobCancelled(id) {
  const job = getBuildJobLocal(id);
  if (!job) return;
  job.status = "cancelled";
  job.error = "Генерация остановлена пользователем.";
  job.updatedAt = nowIso();
  const prev = flushTimers.get(id);
  if (prev) clearTimeout(prev);
  flushTimers.delete(id);
  persistJobSync(job);
  await saveJobRedis(job);
  void persistTokenUsageForJob(job);
}

export async function cancelBuildJob(id) {
  const job = getBuildJobLocal(id) || (await getBuildJob(id));
  if (!job) return false;
  if (job.status === "done" || job.status === "error" || job.status === "cancelled") {
    return true;
  }
  job.cancelRequested = true;
  job.updatedAt = nowIso();
  appendBuildJobLog(id, "BUILD STOP REQUESTED (user)");
  persistJobSync(job);
  await saveJobRedis(job);
  return true;
}

function sleepMs(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sanitizeProjectDirName(name) {
  const value = String(name || "").trim();
  if (!value) return "";
  return value.replace(/[^a-zA-Z0-9._-]/g, "-") || "";
}

/**
 * Simulates multipage progress for UI when Claude keys are missing (no LLM, no real site).
 * Writes `.aurora_build_progress.json` so GET /jobs/:id progress matches the real contract.
 */
async function runUiDryRunSimulation(jobId, payload) {
  const safe = sanitizeProjectDirName(payload.projectName);
  if (!safe) {
    throw new Error("Invalid project name.");
  }
  const outDir = path.join(getProjectsDir(), safe);
  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch {
    /* ignore */
  }

  let pagesTotal = Math.trunc(Number(payload.pageCount));
  if (!Number.isFinite(pagesTotal) || pagesTotal < 3) pagesTotal = 4;
  if (pagesTotal > 4) pagesTotal = 4;

  const progressPath = path.join(outDir, ".aurora_build_progress.json");
  const writeProgress = (pagesDone) => {
    const body = {
      pagesTotal,
      pagesDone,
      status:
        pagesTotal > 0 && pagesDone >= pagesTotal ? "complete" : "building",
      dryRun: true,
    };
    try {
      fs.writeFileSync(progressPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    } catch {
      /* ignore */
    }
  };

  appendBuildJobLog(
    jobId,
    "[UI test] Claude API keys are not configured — dry run only (no LLM, no production output)."
  );
  writeProgress(0);

  for (let done = 0; done <= pagesTotal; done += 1) {
    if (isBuildJobCancelled(jobId)) {
      throw new Error("Генерация остановлена пользователем.");
    }
    await sleepMs(420);
    writeProgress(done);
    appendBuildJobLog(
      jobId,
      `[UI test] simulated stage ${done}/${pagesTotal} (progress file updated)`
    );
  }

  appendBuildJobLog(
    jobId,
    "[UI test] dry run complete. ZIP may be empty or missing — configure CLAUDE_API_KEY_01 for real builds."
  );
}

function isBuildJobCancelled(id) {
  const job = getBuildJobLocal(id);
  return Boolean(job?.cancelRequested || job?.status === "cancelled");
}

export async function runBuildJob(id, runner) {
  const job = getBuildJobLocal(id);
  if (!job) return;

  if (job.payload?.dryRun) {
    try {
      await markBuildJobRunning(id);
      await runUiDryRunSimulation(id, job.payload);
      if (isBuildJobCancelled(id)) {
        await markBuildJobCancelled(id);
        return;
      }
      await markBuildJobDone(id, { dryRun: true });
    } catch (e) {
      if (isBuildJobCancelled(id)) {
        await markBuildJobCancelled(id);
        return;
      }
      await markBuildJobError(id, e?.message || e);
    }
    return;
  }

  let poolLeaseHeld = false;
  try {
    let runPayload = { ...job.payload };
    if (runPayload.pairedFromPool) {
      appendBuildJobLog(
        id,
        `[pool] ожидание свободного Claude-слота (в пуле ключей: ${getDeepseekPoolSize()}; одновременно не больше этого числа сборок)…`
      );
      const lease = await acquirePairedLlmLease(() => isBuildJobCancelled(id));
      poolLeaseHeld = true;
      runPayload = {
        ...runPayload,
        claudeApiKey: lease.claudeKey,
      };
      appendBuildJobLog(
        id,
        `[pool] выдан слот ${lease.slot} из ${lease.poolSize} (сервер выбрал Claude-ключ из env)`
      );
    }
    await markBuildJobRunning(id);
    const result = await runner(
      runPayload,
      (msg) => {
        appendBuildJobLog(id, msg);
      },
      () => isBuildJobCancelled(id)
    );
    if (isBuildJobCancelled(id)) {
      await markBuildJobCancelled(id);
      return;
    }
    await markBuildJobDone(id, result);
  } catch (e) {
    if (isBuildJobCancelled(id)) {
      await markBuildJobCancelled(id);
      return;
    }
    await markBuildJobError(id, e?.message || e);
  } finally {
    if (poolLeaseHeld) {
      releasePairedLlmLease();
    }
  }
}
