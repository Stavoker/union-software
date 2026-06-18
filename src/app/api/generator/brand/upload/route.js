import { NextResponse } from "next/server";

import { uploadGeneratorBrandFile } from "@/lib/generator-brand-persist";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

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
      supabase,
      user.id,
      file,
      kind,
      slot,
      user.id
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
