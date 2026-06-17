import { NextResponse } from "next/server";

import { getUserAutoscriptQueue } from "@/lib/admin-seo/autoscriptQueueRepository";
import { getSessionUser } from "@/shared/lib/auth/get-session-user";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await getUserAutoscriptQueue(user.id);
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to load SEO queue" },
      { status: 500 }
    );
  }
}
