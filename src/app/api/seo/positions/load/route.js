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

async function loadPositionsChunked(supabase, userId, keywords, domains, chunkSize = 40) {
  const all = [];
  for (let i = 0; i < keywords.length; i += chunkSize) {
    const chunk = keywords.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("seo_positions")
      .select("keyword, domain, position, indexed, search_frequency, updated_at")
      .eq("user_id", userId)
      .in("keyword", chunk)
      .in("domain", domains);

    if (error) {
      throw new Error(error.message);
    }
    all.push(...(data || []));
  }
  return all;
}

export async function POST(request) {
  try {
    const session = await requireSeoSession();
    if (session.errorResponse) return session.errorResponse;

    const body = await request.json();
    const keywords = normalizeList(body?.keywords);
    const domains = normalizeList(body?.domains);

    if (!keywords.length || !domains.length) {
      return NextResponse.json({ rows: [] });
    }

    const { userId, supabase } = session;
    const data = await loadPositionsChunked(supabase, userId, keywords, domains);

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

export async function GET(request) {
  try {
    const session = await requireSeoSession();
    if (session.errorResponse) return session.errorResponse;

    const { searchParams } = new URL(request.url);
    const domains = normalizeList((searchParams.get("domains") || "").split(","));

    if (!domains.length) {
      return NextResponse.json({ rows: [] });
    }

    const { userId, supabase } = session;
    const { data: keywordsData, error: keywordsError } = await supabase
      .from("seo_keywords")
      .select("keyword")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (keywordsError) {
      throw new Error(keywordsError.message);
    }

    const keywords = normalizeList((keywordsData || []).map((item) => item.keyword));
    if (!keywords.length) {
      return NextResponse.json({ rows: [] });
    }

    const data = await loadPositionsChunked(supabase, userId, keywords, domains);

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
