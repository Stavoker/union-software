import { NextResponse } from "next/server";

import {
  GENERATOR_ASSETS_BUCKET,
  loadGeneratorBrandForUser,
  storagePathForUserFile,
} from "@/lib/generator-brand-kit";
import { normalizePaletteCore } from "@/lib/generator-brand-palette";
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
      .select("id, title, theme_text, page_count, sort_order, is_active")
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

  const palette = normalizePaletteCore(body?.palette);
  const row = {
    user_id: userId,
    brand_name: String(body?.brandName || "").trim(),
    notes: String(body?.notes || "").trim(),
    palette,
    default_theme_text: String(body?.defaultThemeText || "").trim(),
    prompt_overlay: String(body?.promptOverlay || "").trim(),
    logo_storage_path: body?.logoStoragePath
      ? String(body.logoStoragePath)
      : null,
    favicon_storage_path: body?.faviconStoragePath
      ? String(body.faviconStoragePath)
      : null,
    updated_by: auth.session.userId,
  };

  try {
    const { error } = await auth.session.supabase
      .from("generator_user_brands")
      .upsert(row, { onConflict: "user_id" });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (Array.isArray(body?.themes)) {
      await auth.session.supabase.from("generator_themes").delete().eq("user_id", userId);
      const themes = body.themes
        .map((t, index) => ({
          user_id: userId,
          title: String(t?.title || "").trim(),
          theme_text: String(t?.themeText || t?.theme_text || "").trim(),
          page_count:
            t?.pageCount === 3 || t?.pageCount === 4 || t?.page_count === 3 || t?.page_count === 4
              ? Number(t.pageCount ?? t.page_count)
              : null,
          sort_order: Number(t?.sortOrder ?? t?.sort_order ?? index) || index,
          is_active: t?.isActive !== false && t?.is_active !== false,
        }))
        .filter((t) => t.title && t.theme_text);

      if (themes.length) {
        const { error: thErr } = await auth.session.supabase
          .from("generator_themes")
          .insert(themes);
        if (thErr) {
          return NextResponse.json({ ok: false, error: thErr.message }, { status: 500 });
        }
      }
    }

    const brand = await loadGeneratorBrandForUser(auth.session.supabase, userId);
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
    const { data: asset, error: findErr } = await auth.session.supabase
      .from("generator_brand_assets")
      .select("id, storage_path")
      .eq("id", assetId)
      .eq("user_id", userId)
      .maybeSingle();

    if (findErr || !asset) {
      return NextResponse.json({ ok: false, error: "Asset not found" }, { status: 404 });
    }

    await auth.session.supabase.storage
      .from(GENERATOR_ASSETS_BUCKET)
      .remove([asset.storage_path]);

    await auth.session.supabase
      .from("generator_brand_assets")
      .delete()
      .eq("id", assetId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
