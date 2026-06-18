import { randomUUID } from "node:crypto";
import path from "node:path";

import { buildUploadFileName } from "@/lib/brand-image-pools";
import {
  GENERATOR_ASSETS_BUCKET,
  loadGeneratorBrandForUser,
  storagePathForUserFile,
} from "@/lib/generator-brand-kit";
import { normalizePaletteCore } from "@/lib/generator-brand-palette";

/**
 * @param {Record<string, unknown>} body
 * @param {string} userId
 * @param {string} updatedBy
 */
export function buildGeneratorBrandRow(body, userId, updatedBy) {
  const palette = normalizePaletteCore(body?.palette);
  return {
    user_id: userId,
    brand_name: String(body?.brandName || "").trim(),
    notes: String(body?.notes || "").trim(),
    geo: String(body?.geo || "").trim().toLowerCase(),
    palette,
    default_theme_text: String(body?.defaultThemeText || "").trim(),
    prompt_overlay: String(body?.promptOverlay || "").trim(),
    layout_variant: ["auto", "sidebar-left", "top-nav"].includes(
      String(body?.layoutVariant || "").trim()
    )
      ? String(body.layoutVariant).trim()
      : "auto",
    logo_storage_path: body?.logoStoragePath ? String(body.logoStoragePath) : null,
    favicon_storage_path: body?.faviconStoragePath ? String(body.faviconStoragePath) : null,
    seo_keywords: String(body?.seoKeywords || body?.seo_keywords || "").trim(),
    updated_by: updatedBy,
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {Record<string, unknown>} body
 * @param {string} updatedBy
 */
export async function persistGeneratorBrand(supabase, userId, body, updatedBy) {
  const row = buildGeneratorBrandRow(body, userId, updatedBy);
  const { error } = await supabase.from("generator_user_brands").upsert(row, {
    onConflict: "user_id",
  });
  if (error) throw new Error(error.message);

  if (Array.isArray(body?.themes)) {
    await supabase.from("generator_themes").delete().eq("user_id", userId);
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
        seo_keywords: String(t?.seoKeywords || t?.seo_keywords || "").trim(),
      }))
      .filter((t) => t.title && t.theme_text);

    if (themes.length) {
      const { error: thErr } = await supabase.from("generator_themes").insert(themes);
      if (thErr) throw new Error(thErr.message);
    }
  }

  return loadGeneratorBrandForUser(supabase, userId);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {File} file
 * @param {string} kind
 * @param {string} slot
 * @param {string} updatedBy
 */
export async function uploadGeneratorBrandFile(supabase, userId, file, kind, slot, updatedBy) {
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
    safeKind === "logo" || safeKind === "favicon" ? baseName : `assets/${baseName}`;
  const storagePath = storagePathForUserFile(userId, relative);
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from(GENERATOR_ASSETS_BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
  if (upErr) throw new Error(upErr.message);

  if (safeKind === "logo" || safeKind === "favicon") {
    const patch =
      safeKind === "logo"
        ? { logo_storage_path: storagePath }
        : { favicon_storage_path: storagePath };
    await supabase.from("generator_user_brands").upsert(
      { user_id: userId, ...patch, updated_by: updatedBy },
      { onConflict: "user_id" }
    );
    return { storagePath, kind: safeKind, asset: null };
  }

  const { data: row, error: insErr } = await supabase
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
  if (insErr) throw new Error(insErr.message);
  return { storagePath, kind: safeKind, asset: row };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} assetId
 */
export async function deleteGeneratorBrandAsset(supabase, userId, assetId) {
  const { data: asset, error: findErr } = await supabase
    .from("generator_brand_assets")
    .select("id, storage_path")
    .eq("id", assetId)
    .eq("user_id", userId)
    .maybeSingle();
  if (findErr || !asset) throw new Error("Asset not found");

  await supabase.storage.from(GENERATOR_ASSETS_BUCKET).remove([asset.storage_path]);
  await supabase.from("generator_brand_assets").delete().eq("id", assetId);
}
