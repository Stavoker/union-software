import { NextResponse } from "next/server";

import { fetchGeneratorUsageForUser } from "@/lib/generator-token-usage";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const payload = await fetchGeneratorUsageForUser(supabase, user.id);
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
