import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { getProjectPath } from "@/src/lib/project-service";
import { getJobsDir } from "@/src/lib/app-paths";
import { getPhpBinary } from "@/src/lib/php-binary";

const JOBS_DIR = getJobsDir();

export async function startWarmupJob({ projectName, force = true }) {
  const projectPath = await getProjectPath(projectName);
  await fs.mkdir(JOBS_DIR, { recursive: true });

  const jobId = randomUUID();
  const jobDir = path.join(JOBS_DIR, jobId);
  const statusPath = path.join(jobDir, "status.json");
  const logPath = path.join(jobDir, "warmup.log");
  await fs.mkdir(jobDir, { recursive: true });

  const scriptArgs = ["warmup_text_cache.php"];
  if (force) scriptArgs.push("--force");
  // PHP buffers stdout when piped; without this, logs stay empty until ~4KB or exit (looks "stuck" during long Claude calls).
  const phpArgs = [
    "-d",
    "output_buffering=0",
    "-d",
    "implicit_flush=1",
    "-d",
    "zlib.output_compression=0",
    ...scriptArgs,
  ];

  const phpBin = getPhpBinary();
  const initialStatus = {
    jobId,
    projectName,
    command: `${phpBin} ${phpArgs.join(" ")}`,
    state: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    error: null,
    pid: null,
    stopRequestedAt: null,
    logPath,
  };
  await fs.writeFile(statusPath, JSON.stringify(initialStatus, null, 2), "utf8");

  const outStream = fsSync.createWriteStream(logPath, { flags: "a" });
  outStream.write(
    `${new Date().toISOString()} [start] ${initialStatus.command} cwd=${projectPath}\n`
  );

  const child = spawn(phpBin, phpArgs, {
    cwd: projectPath,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    outStream.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    outStream.write(chunk);
  });

  child.on("close", async (code) => {
    outStream.write(`\n${new Date().toISOString()} [close] exit_code=${code}\n`);
    outStream.end();
    const current = await readStatus(statusPath);
    if (current.state === "stopped") {
      await patchStatus(statusPath, {
        finishedAt: current.finishedAt || new Date().toISOString(),
        exitCode: code,
      });
      return;
    }
    let hasFailLines = false;
    try {
      const rawLog = await fs.readFile(logPath, "utf8");
      hasFailLines = /\bFAIL\b/.test(rawLog);
    } catch {}

    const finalState =
      code === 0 && !hasFailLines ? "completed" : "failed";
    await patchStatus(statusPath, {
      state: finalState,
      finishedAt: new Date().toISOString(),
      exitCode: code,
      error:
        code === 0 && hasFailLines
          ? "Warmup завершился с FAIL строками в логе."
          : null,
    });
  });

  child.on("error", (error) => {
    void (async () => {
      try {
        outStream.write(
          `\n${new Date().toISOString()} [error] ${error.message}\n`
        );
        outStream.end();
        await patchStatus(statusPath, {
          state: "failed",
          finishedAt: new Date().toISOString(),
          error: error.message,
        });
      } catch (e) {
        console.error("[warmup-jobs] error handler:", e);
      }
    })();
  });

  await patchStatus(statusPath, { pid: child.pid });

  child.unref();
  return { jobId, statusPath, logPath };
}

export async function stopWarmupJob(jobId) {
  const safeJobId = String(jobId || "").trim();
  if (!safeJobId) {
    throw new Error("Обязательный параметр: jobId");
  }

  const jobDir = path.join(JOBS_DIR, safeJobId);
  const statusPath = path.join(jobDir, "status.json");
  const status = await readStatus(statusPath);
  const pid = Number(status.pid || 0);

  if (status.state !== "running") {
    return {
      jobId: safeJobId,
      state: status.state,
      alreadyFinished: true,
    };
  }

  if (!Number.isInteger(pid) || pid <= 0) {
    await patchStatus(statusPath, {
      state: "failed",
      finishedAt: new Date().toISOString(),
      error: "Не найден PID процесса прогрева.",
    });
    throw new Error("Не найден PID процесса прогрева.");
  }

  let stopped = false;
  try {
    process.kill(pid, "SIGTERM");
    stopped = true;
  } catch (error) {
    if (error.code === "ESRCH") {
      await patchStatus(statusPath, {
        state: "failed",
        finishedAt: new Date().toISOString(),
        error: "Процесс прогрева уже завершен.",
      });
      throw new Error("Процесс прогрева уже завершен.");
    }
    throw error;
  }

  if (stopped) {
    await patchStatus(statusPath, {
      state: "stopped",
      stopRequestedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      error: null,
    });
  }

  return {
    jobId: safeJobId,
    state: "stopped",
    pid,
  };
}

export async function getWarmupJobStatus(jobId) {
  const safeJobId = String(jobId || "").trim();
  if (!safeJobId) {
    throw new Error("Обязательный параметр: jobId");
  }

  const jobDir = path.join(JOBS_DIR, safeJobId);
  const statusPath = path.join(jobDir, "status.json");
  const statusRaw = await fs.readFile(statusPath, "utf8");
  const status = JSON.parse(statusRaw);

  let logText = "";
  try {
    logText = await fs.readFile(status.logPath, "utf8");
  } catch {
    logText = "";
  }

  return {
    ...status,
    logText: tailLines(logText, 250),
  };
}

async function patchStatus(statusPath, patch) {
  const prev = await readStatus(statusPath);
  const next = { ...prev, ...patch };
  await fs.writeFile(statusPath, JSON.stringify(next, null, 2), "utf8");
}

async function readStatus(statusPath) {
  return JSON.parse(await fs.readFile(statusPath, "utf8"));
}

function tailLines(text, maxLines) {
  const lines = String(text || "").split("\n");
  if (lines.length <= maxLines) return lines.join("\n");
  return lines.slice(lines.length - maxLines).join("\n");
}
