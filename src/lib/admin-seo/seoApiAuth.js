import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/admin-seo/supabaseServer";
import { getSessionUser } from "@/shared/lib/auth/get-session-user";

/**
 * SEO dashboard APIs store rows per authenticated user (seo_domains, seo_keywords, seo_positions).
 * Uses Supabase service-role client with explicit user_id filters (same pattern as before).
 */
export async function requireSeoSession() {
  const user = await getSessionUser();
  if (!user?.id) {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized", details: "Sign in required." },
        { status: 401 }
      ),
    };
  }
  return { userId: user.id, supabase: getSupabaseServerClient() };
}
