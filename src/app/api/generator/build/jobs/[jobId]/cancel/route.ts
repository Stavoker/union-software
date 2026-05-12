import { NextResponse } from "next/server";
import { getSessionUserEmail } from "@/shared/lib/auth/get-session-user";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
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
  if (!jobId) {
    return NextResponse.json(
      { ok: false, error: "Job id required" },
      { status: 400 }
    );
  }

  const { cancelBuildJob, getBuildJob } = await import("@/src/lib/build-jobs.js");
  const job = await getBuildJob(jobId);
  if (!job) {
    return NextResponse.json(
      { ok: false, error: "Job not found" },
      { status: 404 }
    );
  }
  await cancelBuildJob(jobId);
  return NextResponse.json({ ok: true });
}
