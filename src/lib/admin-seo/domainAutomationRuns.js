import { randomUUID } from "node:crypto";

const RUN_TTL_SEC = 60 * 60 * 6;
const MAX_LOG_LINES = 800;

function getRunsMap() {
  const g = globalThis;
  if (!g.__domainAutomationRunsMap) {
    g.__domainAutomationRunsMap = new Map();
  }
  return g.__domainAutomationRunsMap;
}

let redisClient = null;
function getRedisUrl() {
  return process.env.REDIS_URL?.trim() || process.env.BUILD_JOBS_REDIS_URL?.trim() || "";
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

function runRedisKey(id) {
  return `union:domain-automation:${String(id || "").trim()}`;
}

async function saveRunRedis(run) {
  if (!run?.id || !getRedisUrl()) return;
  try {
    const r = await getRedis();
    if (!r) return;
    await r.setex(runRedisKey(run.id), RUN_TTL_SEC, JSON.stringify(run));
  } catch {
    /* ignore */
  }
}

async function loadRunRedis(id) {
  const key = String(id || "").trim();
  if (!key || !getRedisUrl()) return null;
  try {
    const r = await getRedis();
    if (!r) return null;
    const raw = await r.get(runRedisKey(key));
    if (!raw) return null;
    const run = JSON.parse(raw);
    return run && run.id === key ? run : null;
  } catch {
    return null;
  }
}

function trimRun(run) {
  if (!run) return run;
  if (Array.isArray(run.logs) && run.logs.length > MAX_LOG_LINES) {
    run.logs = run.logs.slice(-MAX_LOG_LINES);
  }
  return run;
}

function persistRun(run) {
  if (!run?.id) return;
  trimRun(run);
  getRunsMap().set(run.id, run);
  void saveRunRedis(run);
}

export function createDomainAutomationRun({ userId, domains = [] } = {}) {
  const id = randomUUID();
  const run = {
    id,
    userId: String(userId || "").trim() || null,
    domains: Array.isArray(domains) ? domains : [],
    status: "running",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    logs: [],
    steps: [],
    result: null,
    error: null,
  };
  persistRun(run);
  return run;
}

export function appendDomainAutomationLog(runId, message, extra = null) {
  const id = String(runId || "").trim();
  if (!id) return;
  const run = getRunsMap().get(id);
  if (!run) return;
  const ts = new Date().toISOString();
  const line = `[${ts}] ${String(message || "").trim()}`;
  const rendered = extra ? `${line}\n${JSON.stringify(extra, null, 2)}` : line;
  run.logs.push(rendered);
  run.updatedAt = ts;
  persistRun(run);
}

export function appendDomainAutomationStep(runId, { domain, step } = {}) {
  const id = String(runId || "").trim();
  if (!id || !step) return;
  const run = getRunsMap().get(id);
  if (!run) return;
  const ts = new Date().toISOString();
  const entry = {
    at: ts,
    domain: domain || null,
    step,
  };
  const idx = run.steps.findIndex((s) => s?.domain === domain && s?.step?.id === step.id);
  if (idx >= 0) {
    run.steps[idx] = entry;
  } else {
    run.steps.push(entry);
  }
  const status = step?.pending ? "pending" : step?.skipped ? "skipped" : step?.ok ? "ok" : "fail";
  appendDomainAutomationLog(id, `[${domain || "domain"}] ${step.id}: ${status}`, step?.warning ? { warning: step.warning } : null);
  run.updatedAt = ts;
  persistRun(run);
}

export function completeDomainAutomationRun(runId, { ok, result, error } = {}) {
  const id = String(runId || "").trim();
  if (!id) return;
  const run = getRunsMap().get(id) || { id, logs: [], steps: [] };
  run.status = ok ? "completed" : "failed";
  run.finishedAt = new Date().toISOString();
  run.updatedAt = run.finishedAt;
  run.result = result ?? null;
  run.error = error ? String(error?.message || error) : null;
  if (result?.steps && Array.isArray(result.steps)) {
    for (const step of result.steps) {
      if (!step?.id) continue;
      const domain = result.domain || null;
      const existing = run.steps.findIndex((s) => s?.domain === domain && s?.step?.id === step.id);
      const entry = { at: run.finishedAt, domain, step };
      if (existing >= 0) {
        run.steps[existing] = entry;
      } else {
        run.steps.push(entry);
      }
    }
  }
  persistRun(run);
}

export function patchDomainAutomationRunResult(runId, result) {
  const id = String(runId || "").trim();
  if (!id || !result) return;
  const run = getRunsMap().get(id);
  if (!run) return;
  run.result = result;
  run.updatedAt = new Date().toISOString();
  if (result?.steps?.some((s) => s?.id === "spaceship-ssl-letsencrypt-dns01" && s?.pending)) {
    run.status = "ssl_pending";
  } else if (run.status === "ssl_pending" && result?.steps?.some((s) => s?.id === "spaceship-ssl-letsencrypt-dns01" && !s?.pending)) {
    run.status = "completed";
    run.finishedAt = run.updatedAt;
  }
  persistRun(run);
}

export async function getDomainAutomationRun(runId, userId) {
  const id = String(runId || "").trim();
  if (!id) return null;
  let run = getRunsMap().get(id);
  if (!run) {
    run = await loadRunRedis(id);
    if (run) {
      getRunsMap().set(id, run);
    }
  }
  if (!run) return null;
  const uid = String(userId || "").trim();
  if (uid && run.userId && run.userId !== uid) {
    return null;
  }
  return run;
}
