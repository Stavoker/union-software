import { NextResponse } from "next/server";
import { requireSeoSession } from "@/lib/admin-seo/seoApiAuth";

function asArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function normalizeList(value) {
  return [...new Set(asArray(value).map((item) => String(item || "").trim()).filter(Boolean))];
}

export async function GET(request) {
  try {
    const session = await requireSeoSession();
    if (session.errorResponse) return session.errorResponse;

    const { searchParams } = new URL(request.url);
    const keywords = normalizeList((searchParams.get("keywords") || "").split(","));
    const domains = normalizeList((searchParams.get("domains") || "").split(","));

    if (!keywords.length || !domains.length) {
      return NextResponse.json({ rows: [] });
    }

    const { userId, supabase } = session;
    const { data, error } = await supabase
      .from("seo_positions")
      .select("keyword, domain, position, indexed, search_frequency, updated_at")
      .eq("user_id", userId)
      .in("keyword", keywords)
      .in("domain", domains);

    if (error) {
      throw new Error(error.message);
    }

    const rowsMap = new Map();
    for (const keyword of keywords) {
      rowsMap.set(keyword, {
        keyword,
        totalResultsChecked: 0,
        searchFrequency: null,
        domains: {},
      });
    }

    for (const item of data || []) {
      const row = rowsMap.get(item.keyword);
      if (!row) {
        continue;
      }
      row.searchFrequency = item.search_frequency ?? row.searchFrequency;
      row.domains[item.domain] = {
        position: item.position,
        indexed: !!item.indexed,
      };
    }

    return NextResponse.json({
      rows: keywords.map((keyword) => rowsMap.get(keyword)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load saved positions",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const session = await requireSeoSession();
    if (session.errorResponse) return session.errorResponse;

    const body = await request.json();
    const rows = asArray(body?.rows);

    if (!rows.length) {
      return NextResponse.json({ error: "rows array is required" }, { status: 400 });
    }

    const { userId, supabase } = session;
    const payload = [];
    for (const row of rows) {
      const keyword = String(row?.keyword || "").trim();
      if (!keyword) {
        continue;
      }

      const domains = row?.domains || {};
      for (const [domain, info] of Object.entries(domains)) {
        const domainName = String(domain || "").trim();
        if (!domainName) {
          continue;
        }
        payload.push({
          user_id: userId,
          keyword,
          domain: domainName,
          position: info?.position ?? null,
          indexed: !!info?.indexed,
          search_frequency: row?.searchFrequency ?? null,
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (!payload.length) {
      return NextResponse.json({ success: true, saved: 0 });
    }

    const { error } = await supabase.from("seo_positions").upsert(payload, {
      onConflict: "user_id,keyword,domain",
    });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      saved: payload.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to save positions",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
