import { NextResponse } from "next/server";
import { loadIntegrationSettingsForUser } from "@/lib/account-integration-settings";
import { requireSeoSession } from "@/lib/admin-seo/seoApiAuth";
import { listSeoDomainsForUser, syncSeoDomainsFromUserHosts } from "@/lib/admin-seo/seoDomainsRepository";
import { getSupabaseSourceLabel } from "@/lib/admin-seo/supabaseServer";

function mapDomainsResponse(data) {
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

export async function POST() {
  try {
    const session = await requireSeoSession();
    if (session.errorResponse) {
      return session.errorResponse;
    }

    const userEnv = await loadIntegrationSettingsForUser(session.supabase, session.userId).catch(() => ({}));
    const sync = await syncSeoDomainsFromUserHosts(session.userId, { integrationEnv: userEnv });
    const data = await listSeoDomainsForUser(session.userId);
    const mapped = mapDomainsResponse(data);

    return NextResponse.json({
      ok: sync.ok,
      sync,
      domains: mapped.hosts,
      count: mapped.hosts.length,
      indexStatusMap: mapped.indexStatusMap,
      projectNameMap: mapped.projectNameMap,
      source: getSupabaseSourceLabel(),
      warning:
        mapped.hosts.length === 0
          ? sync.warnings?.length
            ? sync.warnings.join(" ")
            : "No project folders found on configured SSH hosts."
          : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to sync domains from host",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
