import { NextResponse } from "next/server";
import { getSupabaseSourceLabel } from "@/lib/admin-seo/supabaseServer";
import { removeHostProjectDirectory } from "@/lib/admin-seo/hostProjectCleanup";
import { requireSeoSession } from "@/lib/admin-seo/seoApiAuth";

export async function GET() {
  try {
    const session = await requireSeoSession();
    if (session.errorResponse) return session.errorResponse;

    const { userId, supabase } = session;
    const { data, error } = await supabase
      .from("seo_domains")
      .select("host, root_domain, project_name, deployed_at, is_indexed, indexed_checked_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const hosts = [...new Set((data || []).map((item) => item.host).filter(Boolean))];
    const indexStatusMap = {};
    const projectNameMap = {};
    for (const item of data || []) {
      if (!item?.host) {
        continue;
      }
      if (typeof item.is_indexed === "boolean") {
        indexStatusMap[item.host] = item.is_indexed;
      }
      if (item.project_name) {
        projectNameMap[item.host] = item.project_name;
      }
    }

    return NextResponse.json({
      domains: hosts,
      count: hosts.length,
      indexStatusMap,
      projectNameMap,
      source: getSupabaseSourceLabel(),
      warning:
        hosts.length === 0
          ? "No rows returned. Add domains to seo_domains for your account, or check RLS / migration."
          : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load domains",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

/** Додати або оновити домен для поточного користувача (upsert по user_id + host). */
export async function POST(request) {
  try {
    const session = await requireSeoSession();
    if (session.errorResponse) return session.errorResponse;

    const body = await request.json().catch(() => ({}));
    const host = String(body?.host || "").trim().toLowerCase();
    if (!host) {
      return NextResponse.json({ error: "host is required" }, { status: 400 });
    }

    const { userId, supabase } = session;
    const row = {
      user_id: userId,
      host,
      root_domain: body?.root_domain ? String(body.root_domain).trim().toLowerCase() : null,
      project_name: body?.project_name ? String(body.project_name).trim() : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("seo_domains").upsert(row, {
      onConflict: "user_id,host",
    });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, host });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to save domain",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  const session = await requireSeoSession();
  if (session.errorResponse) return session.errorResponse;

  const body = await request.json().catch(() => ({}));
  const host = String(body?.host || "").trim().toLowerCase();
  if (!host) {
    return NextResponse.json({ error: "Host is required" }, { status: 400 });
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
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    const projectName = String(row.project_name || "").trim();
    const { hostRemoved, hostWarning } = await removeHostProjectDirectory(host);

    const { error: positionsError } = await supabase
      .from("seo_positions")
      .delete()
      .eq("domain", host)
      .eq("user_id", userId);
    if (positionsError) {
      throw new Error(positionsError.message);
    }

    const { error: deleteError } = await supabase
      .from("seo_domains")
      .delete()
      .eq("host", host)
      .eq("user_id", userId);
    if (deleteError) {
      throw new Error(deleteError.message);
    }

    return NextResponse.json({
      ok: true,
      host,
      projectName: projectName || null,
      hostRemoved,
      hostWarning,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to delete domain",
        details: error?.message || "unknown error",
      },
      { status: 500 }
    );
  }
}
