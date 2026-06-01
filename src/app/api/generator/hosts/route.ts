import { NextResponse } from "next/server";

import { listActiveHosts } from "@/lib/admin-seo/hostsRepository";
import { getSessionUser } from "@/shared/lib/auth/get-session-user";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const hosts = await listActiveHosts(user.id);
    return NextResponse.json({ ok: true, hosts });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load hosts",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
