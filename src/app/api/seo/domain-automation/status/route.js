import { NextResponse } from "next/server";

import { getDomainAutomationRun } from "@/lib/admin-seo/domainAutomationRuns";
import { requireSeoSession } from "@/lib/admin-seo/seoApiAuth";

export async function GET(request) {
  const session = await requireSeoSession();
  if (session.errorResponse) {
    return session.errorResponse;
  }

  const runId = String(new URL(request.url).searchParams.get("runId") || "").trim();
  if (!runId) {
    return NextResponse.json(
      { ok: false, error: "runId query parameter is required" },
      { status: 400 }
    );
  }

  const run = await getDomainAutomationRun(runId, session.userId);
  if (!run) {
    return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    run: {
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      updatedAt: run.updatedAt,
      finishedAt: run.finishedAt,
      logs: run.logs || [],
      steps: run.steps || [],
      result: run.result || null,
      error: run.error || null,
    },
  });
}
