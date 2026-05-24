import { NextResponse } from "next/server";

import {
  computeProgressPercent,
  readBuildProgressFile,
} from "@/lib/generator-engine/job-progress";
import { getSessionUser } from "@/shared/lib/auth/get-session-user";

export const runtime = "nodejs";

type BuildJobRecord = {
  id: string;
  status: string;
  logs?: string[];
  error?: string;
  payload?: Record<string, unknown>;
};

async function serializeJobForClient(job: BuildJobRecord) {
  const payload = job.payload || {};
  const projectName = String(payload.projectName || "").trim();
  const progress =
    job.status === "running" || job.status === "queued"
      ? await readBuildProgressFile(projectName)
      : null;
  const progressPercent = computeProgressPercent(job.status, progress);
  const logs = Array.isArray(job.logs) ? job.logs : [];
  const logTail = logs.length > 120 ? logs.slice(-120) : logs;

  return {
    jobId: job.id,
    projectName,
    status: job.status,
    cursor: logs.length,
    logTail,
    error:
      job.status === "error" || job.status === "cancelled"
        ? String(job.error || "")
        : "",
    progressPercent,
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { listBuildJobsForUser } = await import("@/src/lib/build-jobs.js");
  const rows = await listBuildJobsForUser(user.id, { limit: 10 });
  const jobs = await Promise.all(rows.map((job) => serializeJobForClient(job)));

  return NextResponse.json({
    ok: true,
    jobs,
  });
}
