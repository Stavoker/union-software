import { NextResponse } from "next/server";
import { getSessionUser } from "@/shared/lib/auth/get-session-user";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
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
  if (!jobId) {
    return NextResponse.json(
      { ok: false, error: "Job id required" },
      { status: 400 }
    );
  }

  const { cancelBuildJob, getBuildJob, isBuildJobOwnedByUser } = await import(
    "@/src/lib/build-jobs.js"
  );
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
  await cancelBuildJob(jobId);
  return NextResponse.json({ ok: true });
}
