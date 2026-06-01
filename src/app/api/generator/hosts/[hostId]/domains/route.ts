import { NextResponse } from "next/server";

import { listDomainFolderAvailabilityOnHost } from "@/lib/admin-seo/hostDomainFolders";
import { getHostById } from "@/lib/admin-seo/hostsRepository";
import { getSessionUser } from "@/shared/lib/auth/get-session-user";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ hostId: string }> }
) {
  const user = await getSessionUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { hostId: rawId } = await context.params;
  const hostId = String(rawId || "").trim();
  if (!hostId) {
    return NextResponse.json({ ok: false, error: "hostId required" }, { status: 400 });
  }

  try {
    const host = await getHostById(hostId, user.id);
    if (!host) {
      return NextResponse.json({ ok: false, error: "Host not found" }, { status: 404 });
    }

    const scan = await listDomainFolderAvailabilityOnHost(host);
    return NextResponse.json({
      ok: true,
      hostId: host.id,
      hostName: host.name,
      projectsBaseDir: scan.projectsBaseDir,
      available: scan.available,
      occupied: scan.occupied,
      warning: scan.warning,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to scan domain folders",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
