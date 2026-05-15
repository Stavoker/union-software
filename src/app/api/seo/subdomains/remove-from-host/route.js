import { NextResponse } from "next/server";
import { removeHostProjectDirectory, assertSafeHostForRemotePath } from "@/lib/admin-seo/hostProjectCleanup";
import { requireSeoSession } from "@/lib/admin-seo/seoApiAuth";

/**
 * Видалити файли сайту з хоста (SFTP), залишивши рядок у Supabase seo_domains
 * (щоб не повторювалися домени, що вже світились в інтернеті).
 */
export async function POST(request) {
  const session = await requireSeoSession();
  if (session.errorResponse) return session.errorResponse;

  const body = await request.json().catch(() => ({}));
  let host;
  try {
    host = assertSafeHostForRemotePath(String(body?.host || ""));
  } catch {
    return NextResponse.json({ error: "Invalid host" }, { status: 400 });
  }

  const { userId, supabase } = session;
  try {
    const { data: row, error: fetchError } = await supabase
      .from("seo_domains")
      .select("host, project_name")
      .eq("host", host)
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) {
      throw new Error(fetchError.message);
    }
    if (!row) {
      return NextResponse.json(
        { error: "Domain not found in database", details: "Only your registered hosts can be cleaned." },
        { status: 404 }
      );
    }

    const { hostRemoved, hostWarning } = await removeHostProjectDirectory(host);

    return NextResponse.json({
      ok: true,
      host,
      projectName: String(row.project_name || "").trim() || null,
      hostRemoved,
      hostWarning,
      dbRowKept: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to remove site from host",
        details: error?.message || "unknown error",
      },
      { status: 500 }
    );
  }
}
