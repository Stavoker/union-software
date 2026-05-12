import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getProjectsDir } from "@/src/lib/app-paths.js";
import { getSessionUserEmail } from "@/shared/lib/auth/get-session-user";

export const runtime = "nodejs";

function safeProjectDirSegment(name: unknown) {
  const value = String(name || "").trim();
  if (!value) return null;
  const safe = value.replace(/[^a-zA-Z0-9._-]/g, "-");
  return safe || null;
}

async function readBuildProgressFile(projectNameRaw: unknown) {
  const safe = safeProjectDirSegment(projectNameRaw);
  if (!safe) return null;
  const projectsRoot = path.resolve(getProjectsDir());
  const projectDir = path.resolve(projectsRoot, safe);
  const rel = path.relative(projectsRoot, projectDir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return null;
  }
  const progressPath = path.join(projectDir, ".aurora_build_progress.json");
  try {
    const raw = await fs.readFile(progressPath, "utf8");
    const p = JSON.parse(raw) as { pagesTotal?: unknown; pagesDone?: unknown };
    const pagesTotal = Math.max(0, Math.trunc(Number(p.pagesTotal)));
    const pagesDone = Math.max(0, Math.trunc(Number(p.pagesDone)));
    if (!Number.isFinite(pagesTotal) || !Number.isFinite(pagesDone)) {
      return null;
    }
    return { pagesTotal, pagesDone };
  } catch {
    return null;
  }
}

function computeProgressPercent(
  status: string,
  progress: { pagesTotal: number; pagesDone: number } | null
) {
  if (status === "done") return 100;
  if (status === "error" || status === "cancelled") return 0;
  if (status === "queued") return 0;
  if (status === "running") {
    if (progress && progress.pagesTotal > 0) {
      const raw = Math.round(
        (100 * Math.min(progress.pagesDone, progress.pagesTotal)) /
          progress.pagesTotal
      );
      if (progress.pagesDone >= progress.pagesTotal) return 99;
      return Math.max(2, Math.min(98, raw));
    }
    return 3;
  }
  return 0;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const email = await getSessionUserEmail();
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { jobId: rawId } = await context.params;
  const jobId = String(rawId || "").trim();
  const { getBuildJob } = await import("@/src/lib/build-jobs.js");
  const job = await getBuildJob(jobId);
  if (!job) {
    return NextResponse.json(
      { ok: false, error: "Job not found" },
      { status: 404 }
    );
  }

  const cursorRaw = new URL(req.url).searchParams.get("cursor");
  const cursorNum = Number(cursorRaw);
  const cursor =
    Number.isFinite(cursorNum) && cursorNum >= 0 ? Math.trunc(cursorNum) : 0;
  const logs = job.logs.slice(cursor);
  const nextCursor = cursor + logs.length;

  const payload = job.payload as Record<string, unknown> | undefined;
  const projectName = payload?.projectName;
  const progress =
    job.status === "running" || job.status === "queued"
      ? await readBuildProgressFile(projectName)
      : null;

  const progressPercent = computeProgressPercent(job.status, progress);

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    logs,
    cursor: nextCursor,
    result: job.status === "done" ? job.result : null,
    error:
      job.status === "error" || job.status === "cancelled" ? job.error : "",
    progress,
    progressPercent,
  });
}
