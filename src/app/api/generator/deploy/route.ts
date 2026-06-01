import { NextResponse } from "next/server";

import {
  autoDeployBuildJobToHost,
  deployGeneratedSiteToDomainFolder,
  listDomainFolderAvailabilityOnHost,
} from "@/lib/admin-seo/hostDomainFolders";
import { getHostById } from "@/lib/admin-seo/hostsRepository";
import { getSessionUser } from "@/shared/lib/auth/get-session-user";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const projectName = String(body.projectName || "").trim();
  const hostId = String(body.hostId || "").trim();
  const domain = String(body.domain || "").trim().toLowerCase();
  const jobId = String(body.jobId || "").trim();

  if (!projectName) {
    return NextResponse.json({ ok: false, error: "projectName required" }, { status: 400 });
  }

  if (!hostId && jobId) {
    const { getBuildJob, isBuildJobOwnedByUser } = await import("@/src/lib/build-jobs.js");
    const job = await getBuildJob(jobId);
    if (!job || !isBuildJobOwnedByUser(job, user.id)) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }
    if (job.status !== "done") {
      return NextResponse.json({ ok: false, error: "Job is not finished" }, { status: 400 });
    }

    const deploy = await autoDeployBuildJobToHost(job, job.result, {});
    const { setBuildJobResult } = await import("@/src/lib/build-jobs.js");
    await setBuildJobResult(jobId, {
      ...(job.result && typeof job.result === "object" ? job.result : {}),
      deploy,
    });

    return NextResponse.json({
      ok: deploy?.status === "deployed",
      deploy,
    });
  }

  if (!hostId) {
    return NextResponse.json({ ok: false, error: "hostId required" }, { status: 400 });
  }

  try {
    const host = await getHostById(hostId, user.id);
    if (!host) {
      return NextResponse.json({ ok: false, error: "Host not found" }, { status: 404 });
    }

    let targetDomain = domain;
    if (!targetDomain) {
      const scan = await listDomainFolderAvailabilityOnHost(host);
      targetDomain = scan.available[0] || "";
      if (!targetDomain) {
        return NextResponse.json({
          ok: false,
          deploy: {
            status: "pending_no_slot",
            message: "no_empty_domain_folders",
            projectsBaseDir: scan.projectsBaseDir,
            occupiedCount: scan.occupied.length,
          },
        });
      }
    }

    const deployed = await deployGeneratedSiteToDomainFolder({
      host,
      domain: targetDomain,
      projectName,
      userId: user.id,
    });

    if (jobId) {
      const { getBuildJob, isBuildJobOwnedByUser, setBuildJobResult } = await import(
        "@/src/lib/build-jobs.js"
      );
      const job = await getBuildJob(jobId);
      if (job && isBuildJobOwnedByUser(job, user.id)) {
        await setBuildJobResult(jobId, {
          ...(job.result && typeof job.result === "object" ? job.result : {}),
          deploy: {
            status: "deployed",
            domain: deployed.domain,
            remotePath: deployed.remotePath,
            siteUrl: deployed.siteUrl,
          },
        });
      }
    }

    return NextResponse.json({
      ok: deployed.stackReady !== false,
      deploy: {
        status: "deployed",
        domain: deployed.domain,
        remotePath: deployed.remotePath,
        siteUrl: deployed.siteUrl,
        stackReady: deployed.stackReady,
        nginx: deployed.nginx,
        warning: deployed.warning,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Deploy failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
