import { NextResponse } from "next/server";

import {
  GENERATOR_ASSETS_BUCKET,
  loadGeneratorBrandForUser,
} from "@/lib/generator-brand-kit";
import {
  deleteGeneratorBrandAsset,
  persistGeneratorBrand,
} from "@/lib/generator-brand-persist";
import { requireAdminSession } from "@/shared/lib/auth/require-admin";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  const auth = await requireAdminSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { userId } = await params;
  try {
    const brand = await loadGeneratorBrandForUser(auth.session.supabase, userId);
    const { data: themes } = await auth.session.supabase
      .from("generator_themes")
      .select("id, title, theme_text, page_count, sort_order, is_active, seo_keywords")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });

    return NextResponse.json({
      ok: true,
      brand,
      themes: themes || [],
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}

export async function PUT(req, { params }) {
  const auth = await requireAdminSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { userId } = await params;
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const brand = await persistGeneratorBrand(
      auth.session.supabase,
      userId,
      body,
      auth.session.userId
    );
    return NextResponse.json({ ok: true, brand });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}

export async function DELETE(req, { params }) {
  const auth = await requireAdminSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { userId } = await params;
  const assetId = new URL(req.url).searchParams.get("assetId");
  if (!assetId) {
    return NextResponse.json({ ok: false, error: "assetId required" }, { status: 400 });
  }

  try {
    await deleteGeneratorBrandAsset(auth.session.supabase, userId, assetId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
