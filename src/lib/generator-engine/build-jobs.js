import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getJobsDir } from "@/src/lib/app-paths";
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
export async function setBuildJobResult(id, result) {
  const key = String(id || "").trim();
  if (!key) return false;
  let job = getBuildJobLocal(key);
  if (!job) {
    job = loadJobFromDisk(key) || (await loadJobRedis(key));
    if (job) getJobsMap().set(key, job);
  }
  if (!job) return false;
  job.result = result;
  job.updatedAt = nowIso();
  persistJobSync(job);
  await saveJobRedis(job);
  return true;
}

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

const TRACKED_TERMINAL_MS = 4 * 60 * 60 * 1000;

export function getBuildJobUserId(job) {
  return String(job?.payload?.userId || "").trim();
}

export function isBuildJobOwnedByUser(job, userId) {
  const uid = String(userId || "").trim();
  if (!uid || !job) return false;
  return getBuildJobUserId(job) === uid;
}

function shouldTrackJobForUser(job) {
  if (!job?.id) return false;
  const st = String(job.status || "");
  if (st === "queued" || st === "running") return true;
  if (st === "done" || st === "error" || st === "cancelled") {
    const ts = Date.parse(job.updatedAt || 0) || 0;
    return Date.now() - ts < TRACKED_TERMINAL_MS;
  }
  return false;
}

function collectJobIdsFromDisk() {
  ensureJobsDir();
  try {
    return fs
      .readdirSync(getJobsDir())
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.replace(/\.json$/i, ""));
  } catch {
    return [];
  }
}

/**
 * Активні та недавно завершені jobs користувача (памʼять + disk).
 * @param {string} userId
 * @param {{ limit?: number }} [opts]
 */
export async function listBuildJobsForUser(userId, opts = {}) {
  const uid = String(userId || "").trim();
  if (!uid) return [];
  const limit = Math.min(20, Math.max(1, Number(opts.limit) || 10));
  const byId = new Map();

  const ingest = (job) => {
    if (!job?.id || !isBuildJobOwnedByUser(job, uid) || !shouldTrackJobForUser(job)) {
      return;
    }
    const prev = byId.get(job.id);
    if (!prev) {
      byId.set(job.id, job);
      return;
    }
    const prevTs = Date.parse(prev.updatedAt || 0) || 0;
    const nextTs = Date.parse(job.updatedAt || 0) || 0;
    if (nextTs >= prevTs) byId.set(job.id, job);
  };

  for (const job of getJobsMap().values()) {
    ingest(job);
  }

  for (const id of collectJobIdsFromDisk()) {
    const local = getBuildJobLocal(id);
    if (local) ingest(local);
    else {
      const fromRedis = await loadJobRedis(id);
      if (fromRedis) {
        getJobsMap().set(id, fromRedis);
        ingest(fromRedis);
      }
    }
  }

  return Array.from(byId.values())
    .sort(
      (a, b) =>
        (Date.parse(b.updatedAt || 0) || 0) - (Date.parse(a.updatedAt || 0) || 0)
    )
    .slice(0, limit);
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

function buildJobDeployNotifyFields(job) {
  const deploy = job?.result?.deploy;
  const status = String(deploy?.status || "");
  const domain = String(deploy?.domain || job?.payload?.plannedDeployDomain || "").trim();
  const project = String(
    job?.payload?.projectName || deploy?.projectName || job?.result?.projectName || "site"
  ).trim();
  const siteUrl = String(deploy?.siteUrl || (domain ? `https://${domain}/` : "")).trim();

  let deployNoteKey = "";
  let deployFailMessage = "";
  if (status === "deployed" && domain) {
    deployNoteKey = "";
  } else if (status === "pending_no_slot") {
    deployNoteKey = "deploy_no_slot";
  } else if (status === "skipped_no_host") {
    deployNoteKey = "deploy_no_host";
  } else if (status === "failed") {
    deployNoteKey = "deploy_failed";
    deployFailMessage = String(deploy?.message || "error").slice(0, 120);
  } else if (status) {
    deployNoteKey = "deploy_other";
    deployFailMessage = status;
  }

  return { project, domain, siteUrl, deployStatus: status, deployNoteKey, deployFailMessage };
}

async function notifyBuildJobTelegram(job, eventKey, extra = {}) {
  const userId = String(job?.payload?.userId || "").trim();
  if (!userId) return;
  try {
    const { notifyUserTelegram } = await import("@/lib/telegram/telegramNotify.js");
    const pages = Array.isArray(job?.result?.pages)
      ? job.result.pages.length
      : job?.payload?.pageCount || "—";
    const deployFields = buildJobDeployNotifyFields(job);
    await notifyUserTelegram(userId, eventKey, {
      ...deployFields,
      pages,
      mode: job?.result?.mode || "",
      error: String(extra.error || job?.error || "").slice(0, 280),
      plannedDomain: String(job?.payload?.plannedDeployDomain || "").trim(),
    });
  } catch (e) {
    console.warn("[build-jobs][telegram]", e?.message || e);
  }
}

export async function markBuildJobDone(id, result) {
  const job = getBuildJobLocal(id);
  if (!job) return;
  job.status = "done";
  let mergedResult = result || null;

  try {
    const { autoDeployBuildJobToHost } = await import(
      "@/lib/admin-seo/hostDomainFolders.js"
    );
    let deploy = await autoDeployBuildJobToHost(job, mergedResult, {
      onLog: (msg) => appendBuildJobLog(id, msg),
    });
    if (deploy?.status === "deployed" && deploy.stackReady === false) {
      try {
        const { ensurePhpNginxForDeployedDomain } = await import(
          "@/lib/admin-seo/hostDomainFolders.js"
        );
        const { getHostById } = await import("@/lib/admin-seo/hostsRepository.js");
        const hostId = String(job?.payload?.hostId || "").trim();
        const userId = String(job?.payload?.userId || "").trim();
        const host = await getHostById(hostId, userId);
        if (host && deploy.domain) {
          appendBuildJobLog(id, "[deploy] retry PHP+nginx stack");
          const retry = await ensurePhpNginxForDeployedDomain({
            host,
            domain: deploy.domain,
            onLog: (msg) => appendBuildJobLog(id, msg),
          });
          deploy = {
            ...deploy,
            stackReady: retry.stackReady,
            nginx: retry.nginx,
            warning: retry.warning,
          };
        }
      } catch (e) {
        appendBuildJobLog(id, `[deploy] stack retry failed: ${e?.message || e}`);
      }
    }
    mergedResult = {
      ...(mergedResult && typeof mergedResult === "object" ? mergedResult : {}),
      deploy,
    };
    if (deploy?.status === "deployed") {
      const proj = String(job?.payload?.projectName || mergedResult?.projectName || "site").trim();
      appendBuildJobLog(
        id,
        `[deploy] project ${proj} → ${deploy.domain} (${deploy.remotePath || deploy.siteUrl || ""})`
      );
      appendBuildJobLog(
        id,
        `[deploy] site uploaded to ${deploy.domain} (${deploy.remotePath})`
      );
      if (deploy.stackReady === false && deploy.warning) {
        appendBuildJobLog(id, `[deploy] WARNING: ${deploy.warning}`);
      } else if (deploy.nginx?.smokeStatus) {
        appendBuildJobLog(id, `[deploy] nginx smoke: ${deploy.nginx.smokeStatus}`);
      }
    } else if (deploy?.status === "pending_no_slot") {
      appendBuildJobLog(
        id,
        "[deploy] no empty domain folders on host — purchase a domain or free a folder"
      );
    } else if (deploy?.status === "failed" && deploy?.message) {
      appendBuildJobLog(id, `[deploy] failed: ${deploy.message}`);
    }
  } catch (e) {
    const deploy = {
      status: "failed",
      message: e?.message || String(e),
    };
    mergedResult = {
      ...(mergedResult && typeof mergedResult === "object" ? mergedResult : {}),
      deploy,
    };
    appendBuildJobLog(id, `[deploy] failed: ${deploy.message}`);
  }

  job.result = mergedResult;
  job.updatedAt = nowIso();
  const prev = flushTimers.get(id);
  if (prev) clearTimeout(prev);
  flushTimers.delete(id);
  persistJobSync(job);
  await saveJobRedis(job);
  void persistTokenUsageForJob(job);
  void notifyBuildJobTelegram(job, "generator_done");
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
  void notifyBuildJobTelegram(job, "generator_error", { error });
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
  void notifyBuildJobTelegram(job, "generator_cancelled");
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

function isBuildJobCancelled(id) {
  const job = getBuildJobLocal(id);
  return Boolean(job?.cancelRequested || job?.status === "cancelled");
}

export async function runBuildJob(id, runner) {
  const job = getBuildJobLocal(id);
  if (!job) return;

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
    void notifyBuildJobTelegram(job, "generator_started");
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
