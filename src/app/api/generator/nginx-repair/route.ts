import { NextResponse } from "next/server";

import { repairDeployedSiteStack } from "@/lib/admin-seo/hostDomainFolders";
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

    const result = await repairDeployedSiteStack({ host, domain });
    return NextResponse.json({
      ok: result.ok,
      repair: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
