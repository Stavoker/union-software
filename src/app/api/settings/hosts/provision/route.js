import { NextResponse } from "next/server";

import { provisionHostPhpStack } from "@/lib/admin-seo/hostDomainFolders";
import { getHostById } from "@/lib/admin-seo/hostsRepository";
import { requireSeoSession } from "@/lib/admin-seo/seoApiAuth";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Встановити nginx+PHP-FPM на VPS і оновити vhost для всіх сайтів з index.php. */
export async function POST(request) {
  try {
    const session = await requireSeoSession();
    if (session.errorResponse) return session.errorResponse;

    const body = await request.json().catch(() => ({}));
    const hostId = String(body?.id || body?.hostId || "").trim();
    if (!hostId) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }

    const host = await getHostById(hostId, session.userId);
    if (!host) {
      return NextResponse.json({ ok: false, error: "Host not found" }, { status: 404 });
    }
    if (!String(host.sshPassword || "").trim()) {
      return NextResponse.json(
        { ok: false, error: "SSH password not saved for this host" },
        { status: 400 }
      );
    }

    const logs = [];
    const result = await provisionHostPhpStack({
      host,
      onLog: (msg) => logs.push(String(msg)),
    });

    return NextResponse.json({
      ok: result.ok,
      provision: result,
      logs: logs.slice(-80),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Host provision failed",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
