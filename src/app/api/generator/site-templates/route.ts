import { NextResponse } from "next/server";
import { listActiveSiteTemplates } from "@/lib/generator-engine/generation-site-templates";
import { getSessionUser } from "@/shared/lib/auth/get-session-user";

export const runtime = "nodejs";

/** GET /api/generator/site-templates — список активных эталонов */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const templates = await listActiveSiteTemplates();
    return NextResponse.json({ ok: true, templates });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: String((e as Error)?.message || e).slice(0, 400),
      },
      { status: 500 }
    );
  }
}
