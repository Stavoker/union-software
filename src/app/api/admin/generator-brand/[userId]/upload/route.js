import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { buildUploadFileName } from "@/lib/brand-image-pools";
import {
  GENERATOR_ASSETS_BUCKET,
  storagePathForUserFile,
} from "@/lib/generator-brand-kit";
import { requireAdminSession } from "@/shared/lib/auth/require-admin";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const auth = await requireAdminSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { userId } = await params;
  let form;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  const kind = String(form.get("kind") || "misc").trim();
  const slot = String(form.get("slot") || "").trim();

  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ ok: false, error: "file required" }, { status: 400 });
  }

  const safeKind = ["logo", "favicon", "hero", "game", "payment", "misc"].includes(kind)
    ? kind
    : "misc";
  const ext = path.extname(file.name || "").toLowerCase() || ".png";
  const baseName =
    slot === "logo"
      ? `logo${ext}`
      : slot === "favicon"
        ? `favicon${ext}`
        : ["hero", "game", "payment"].includes(safeKind)
          ? buildUploadFileName(file.name || "asset", safeKind)
          : `${randomUUID().slice(0, 8)}-${(file.name || "asset").replace(/[^a-zA-Z0-9._-]/g, "-")}`;

  const relative =
    safeKind === "logo" || safeKind === "favicon"
      ? baseName
      : `assets/${baseName}`;
  const storagePath = storagePathForUserFile(userId, relative);

  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await auth.session.supabase.storage
    .from(GENERATOR_ASSETS_BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  if (safeKind === "logo" || safeKind === "favicon") {
    const patch =
      safeKind === "logo"
        ? { logo_storage_path: storagePath }
        : { favicon_storage_path: storagePath };
    await auth.session.supabase.from("generator_user_brands").upsert(
      {
        user_id: userId,
        ...patch,
        updated_by: auth.session.userId,
      },
      { onConflict: "user_id" }
    );
    return NextResponse.json({
      ok: true,
      storagePath,
      kind: safeKind,
    });
  }

  const { data: row, error: insErr } = await auth.session.supabase
    .from("generator_brand_assets")
    .insert({
      user_id: userId,
      kind: safeKind,
      storage_path: storagePath,
      file_name: path.basename(baseName),
      mime_type: file.type || null,
    })
    .select("id, kind, storage_path, file_name")
    .single();

  if (insErr) {
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, asset: row });
}
