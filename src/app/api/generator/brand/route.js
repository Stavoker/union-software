import { NextResponse } from "next/server";

import { deleteGeneratorBrandAsset, persistGeneratorBrand } from "@/lib/generator-brand-persist";
import {
  loadGeneratorBrandForUser,
  loadGeneratorThemesForUser,
} from "@/lib/generator-brand-kit";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export const runtime = "nodejs";

async function requireOwnSession() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true, supabase, userId: user.id };
}

export async function GET() {
  const auth = await requireOwnSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const brand = await loadGeneratorBrandForUser(auth.supabase, auth.userId);
    const themes = await loadGeneratorThemesForUser(auth.supabase, auth.userId);
    return NextResponse.json({ ok: true, brand, themes });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}

export async function PUT(req) {
  const auth = await requireOwnSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const brand = await persistGeneratorBrand(
      auth.supabase,
      auth.userId,
      body,
      auth.userId
    );
    return NextResponse.json({ ok: true, brand });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}

export async function DELETE(req) {
  const auth = await requireOwnSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const assetId = new URL(req.url).searchParams.get("assetId");
  if (!assetId) {
    return NextResponse.json({ ok: false, error: "assetId required" }, { status: 400 });
  }

  try {
    await deleteGeneratorBrandAsset(auth.supabase, auth.userId, assetId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
