import { NextResponse } from "next/server";
import { loadIntegrationSettingsForUser } from "@/lib/account-integration-settings";
import { removeHostProjectDirectory } from "@/lib/admin-seo/hostProjectCleanup";
import {
  listSeoDomainsForUser,
  syncSeoDomainsFromUserHosts,
  upsertSeoDomainForUser,
} from "@/lib/admin-seo/seoDomainsRepository";
import { requireSeoSession } from "@/lib/admin-seo/seoApiAuth";
import { getSupabaseSourceLabel } from "@/lib/admin-seo/supabaseServer";

function mapDomainsPayload(data) {
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
  return { hosts, indexStatusMap, projectNameMap };
}

export async function GET(request) {
  try {
    const session = await requireSeoSession();
    if (session.errorResponse) {
      return session.errorResponse;
    }

    const { userId, supabase } = session;
    const url = new URL(request.url);
    const syncRequested = url.searchParams.get("sync") === "1";

    let data = await listSeoDomainsForUser(userId);
    let syncMeta = null;

    if (syncRequested || data.length === 0) {
      const userEnv = await loadIntegrationSettingsForUser(supabase, userId).catch(() => ({}));
      syncMeta = await syncSeoDomainsFromUserHosts(userId, { integrationEnv: userEnv });
      data = await listSeoDomainsForUser(userId);
    }

    const { hosts, indexStatusMap, projectNameMap } = mapDomainsPayload(data);

    let warning = null;
    if (hosts.length === 0) {
      const parts = [];
      if (syncMeta?.warnings?.length) {
        parts.push(...syncMeta.warnings);
      } else {
        parts.push(
          "No domains in seo_domains. Run domain automation or sync from SSH host (Settings → SSH servers with /var/www projects)."
        );
      }
      warning = parts.join(" ");
    }

    return NextResponse.json({
      domains: hosts,
      count: hosts.length,
      indexStatusMap,
      projectNameMap,
      source: getSupabaseSourceLabel(),
      syncedFromHost: syncMeta,
      warning,
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
    if (session.errorResponse) {
      return session.errorResponse;
    }

    const body = await request.json().catch(() => ({}));
    const host = String(body?.host || "").trim().toLowerCase();
    if (!host) {
      return NextResponse.json({ error: "host is required" }, { status: 400 });
    }

    await upsertSeoDomainForUser(session.userId, host, {
      rootDomain: body?.root_domain,
      projectName: body?.project_name,
      setDeployedAt: false,
    });

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
  if (session.errorResponse) {
    return session.errorResponse;
  }

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
