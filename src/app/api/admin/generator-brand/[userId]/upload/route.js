import { NextResponse } from "next/server";

import { uploadGeneratorBrandFile } from "@/lib/generator-brand-persist";
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

  try {
    const result = await uploadGeneratorBrandFile(
      auth.session.supabase,
      userId,
      file,
      kind,
      slot,
      auth.session.userId
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
