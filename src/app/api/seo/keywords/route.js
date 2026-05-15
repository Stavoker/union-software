import { NextResponse } from "next/server";
import { getSupabaseSourceLabel } from "@/lib/admin-seo/supabaseServer";
import { requireSeoSession } from "@/lib/admin-seo/seoApiAuth";

function normalizeKeywords(input) {
  const list = Array.isArray(input) ? input : [];
  return [...new Set(list.map((item) => String(item || "").trim()).filter(Boolean))];
}

export async function GET() {
  try {
    const session = await requireSeoSession();
    if (session.errorResponse) return session.errorResponse;

    const { userId, supabase } = session;
    const { data, error } = await supabase
      .from("seo_keywords")
      .select("keyword")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      keywords: (data || []).map((item) => item.keyword).filter(Boolean),
      source: getSupabaseSourceLabel(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load keywords",
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
    const keywords = normalizeKeywords(body?.keywords);

    if (!keywords.length) {
      return NextResponse.json({ error: "keywords array is required" }, { status: 400 });
    }

    const { userId, supabase } = session;
    const payload = keywords.map((keyword) => ({ keyword, user_id: userId }));
    const { error } = await supabase.from("seo_keywords").upsert(payload, {
      onConflict: "user_id,keyword",
    });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      saved: keywords.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to save keywords",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const session = await requireSeoSession();
    if (session.errorResponse) return session.errorResponse;

    const body = await request.json();
    const keyword = String(body?.keyword || "").trim();

    if (!keyword) {
      return NextResponse.json({ error: "keyword is required" }, { status: 400 });
    }

    const { userId, supabase } = session;
    const { error } = await supabase
      .from("seo_keywords")
      .delete()
      .eq("keyword", keyword)
      .eq("user_id", userId);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      removed: keyword,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to delete keyword",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
