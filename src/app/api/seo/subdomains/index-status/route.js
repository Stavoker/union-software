import { NextResponse } from "next/server";
import { requireSeoSession } from "@/lib/admin-seo/seoApiAuth";

function asArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export async function POST(request) {
  try {
    const session = await requireSeoSession();
    if (session.errorResponse) return session.errorResponse;

    const body = await request.json();
    const statuses = asArray(body?.statuses)
      .map((item) => ({
        host: String(item?.host || "").trim(),
        is_indexed: !!item?.is_indexed,
        indexed_checked_at: new Date().toISOString(),
      }))
      .filter((item) => item.host);

    if (!statuses.length) {
      return NextResponse.json({ error: "statuses array is required" }, { status: 400 });
    }

    const { userId, supabase } = session;
    const failedHosts = [];

    for (const item of statuses) {
      const { error } = await supabase
        .from("seo_domains")
        .update({
          is_indexed: item.is_indexed,
          indexed_checked_at: item.indexed_checked_at,
        })
        .eq("host", item.host)
        .eq("user_id", userId);

      if (error) {
        failedHosts.push({
          host: item.host,
          message: error.message,
        });
      }
    }

    if (failedHosts.length) {
      return NextResponse.json(
        {
          error: "Failed to update some domain index statuses",
          details: failedHosts[0].message,
          failedHosts,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      updated: statuses.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to update domain index statuses",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
