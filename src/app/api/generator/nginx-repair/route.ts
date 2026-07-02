import { NextResponse } from "next/server";

import { repairDeployedSiteStack } from "@/lib/admin-seo/hostDomainFolders";
import {
  repairSslNginxVhostFromPemOnHost,
  sslPemPresentOnHost,
} from "@/lib/admin-seo/hostNginxSslDeploy";
import { getHostById } from "@/lib/admin-seo/hostsRepository";
import { getSessionUser } from "@/shared/lib/auth/get-session-user";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Перезапис vhost nginx + права на каталог (без повторного завантаження файлів). */
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

  const hostId = String(body.hostId || "").trim();
  const domain = String(body.domain || "").trim().toLowerCase();
  if (!hostId || !domain) {
    return NextResponse.json(
      { ok: false, error: "hostId and domain are required" },
      { status: 400 }
    );
  }

  try {
    const host = await getHostById(hostId, user.id);
    if (!host) {
      return NextResponse.json({ ok: false, error: "Host not found" }, { status: 404 });
    }

    const logs: string[] = [];
    const onLog = (msg: string) => logs.push(msg);

    const pemPresent = await sslPemPresentOnHost({
      domain,
      deployHostIp: host.hostIp,
      sshUser: host.sshUser,
      sshPassword: host.sshPassword,
      sshPort: host.sshPort,
      projectsBaseDir: host.projectsDir,
    });

    if (pemPresent) {
      const sslRepair = await repairSslNginxVhostFromPemOnHost({
        domain,
        deployHostIp: host.hostIp,
        sshUser: host.sshUser,
        sshPassword: host.sshPassword,
        sshPort: host.sshPort,
        projectsBaseDir: host.projectsDir,
        onLog,
      });
      if (sslRepair.ok) {
        return NextResponse.json({
          ok: true,
          mode: "ssl_vhost",
          repair: sslRepair,
          logs,
        });
      }
      logs.push(`[ssl-repair] fallback: ${sslRepair.warning || "ssl vhost repair failed"}`);
    }

    const result = await repairDeployedSiteStack({ host, domain, onLog });
    return NextResponse.json({
      ok: result.ok,
      mode: "site_stack",
      repair: result,
      logs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
