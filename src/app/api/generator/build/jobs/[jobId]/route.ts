import { NextResponse } from "next/server";

import {
  computeProgressPercent,
  readBuildProgressFile,
} from "@/lib/generator-engine/job-progress";
import { getSessionUser } from "@/shared/lib/auth/get-session-user";

export async function GET(
  req: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const user = await getSessionUser();
  if (!user?.id) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { jobId: rawId } = await context.params;
  const jobId = String(rawId || "").trim();
  const { getBuildJob, isBuildJobOwnedByUser } = await import("@/src/lib/build-jobs.js");
  const job = await getBuildJob(jobId);
  if (!job) {
    return NextResponse.json(
      { ok: false, error: "Job not found" },
      { status: 404 }
    );
  }
  if (!isBuildJobOwnedByUser(job, user.id)) {
    return NextResponse.json(
      { ok: false, error: "Forbidden" },
      { status: 403 }
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

  const result =
    job.status === "done" && job.result && typeof job.result === "object"
      ? job.result
      : null;
  const deploy =
    result && typeof result === "object" && "deploy" in result
      ? (result as { deploy?: unknown }).deploy
      : null;

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    logs,
    cursor: nextCursor,
    result,
    deploy,
    error:
      job.status === "error" || job.status === "cancelled" ? job.error : "",
    progress,
    progressPercent,
  });
}
