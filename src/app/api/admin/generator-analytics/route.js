import { NextResponse } from "next/server";

import { fetchAdminGeneratorAnalytics } from "@/lib/generator-admin-analytics";
import { requireAdminSession } from "@/shared/lib/auth/require-admin";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireAdminSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") || "1");
    const search = url.searchParams.get("q") || "";
    const status = url.searchParams.get("status") || "all";

    const payload = await fetchAdminGeneratorAnalytics(auth.session.supabase, {
      page,
      search,
      status,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load generator analytics",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
