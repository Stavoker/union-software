import fs from "node:fs/promises";
import path from "node:path";

import { getSupabaseServerClient } from "@/lib/admin-seo/supabaseServer";
import {
  buildImagePools,
  formatImagePoolsLogLine,
  materializedDestNameForAsset,
} from "@/lib/brand-image-pools";
import { normalizePalette } from "@/lib/generator-brand-palette";
import { resolveGatewayUrlForBuild } from "@/src/lib/generator-engine/brand-chrome";

export const GENERATOR_ASSETS_BUCKET = "generator-assets";

export {
  expandPalette,
  normalizePalette,
  normalizePaletteCore,
} from "@/lib/generator-brand-palette";

/**
 * @param {Record<string, unknown> | null} row
 */
export function brandRowToKit(row) {
  if (!row) return null;
  return {
    userId: String(row.user_id || ""),
    brandName: String(row.brand_name || "").trim(),
    notes: String(row.notes || "").trim(),
    palette: normalizePalette(row.palette),
    logoStoragePath: row.logo_storage_path ? String(row.logo_storage_path) : "",
    faviconStoragePath: row.favicon_storage_path ? String(row.favicon_storage_path) : "",
    defaultThemeText: String(row.default_theme_text || "").trim(),
    promptOverlay: String(row.prompt_overlay || "").trim(),
    seoKeywords: String(row.seo_keywords || "").trim(),
    geo: String(row.geo || "").trim().toLowerCase(),
    layoutVariant: String(row.layout_variant || "auto").trim() || "auto",
    botGateRedirectUrl: String(row.bot_gate_redirect_url || "").trim(),
    assets: [],
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function loadGeneratorBrandForUser(supabase, userId) {
  const uid = String(userId || "").trim();
  if (!uid) return null;

  const { data: brand, error: brandErr } = await supabase
    .from("generator_user_brands")
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();

  if (brandErr) {
    throw new Error(brandErr.message);
  }
  if (!brand) return null;

  const { data: assets, error: assetsErr } = await supabase
    .from("generator_brand_assets")
    .select("id, kind, storage_path, file_name, mime_type, sort_order")
    .eq("user_id", uid)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (assetsErr) {
    throw new Error(assetsErr.message);
  }

  const kit = brandRowToKit(brand);
  kit.assets = (assets || []).map((a) => ({
    id: String(a.id),
    kind: String(a.kind || "misc"),
    storagePath: String(a.storage_path || ""),
    fileName: String(a.file_name || path.basename(String(a.storage_path || ""))),
    mimeType: a.mime_type ? String(a.mime_type) : null,
    sortOrder: Number(a.sort_order) || 0,
  }));
  return kit;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function loadActiveGeneratorThemes(supabase, userId) {
  const { data, error } = await supabase
    .from("generator_themes")
    .select("id, title, theme_text, page_count, sort_order, seo_keywords")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function loadGeneratorThemesForUser(supabase, userId) {
  const { data, error } = await supabase
    .from("generator_themes")
    .select("id, title, theme_text, page_count, sort_order, is_active, seo_keywords")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Ключові слова для збірки: спочатку з пресету теми (за theme_text), інакше fallback з бренду.
 * @param {{ themeText: string, themes?: { theme_text?: string, seo_keywords?: string }[], brandKit?: { seoKeywords?: string } | null }} opts
 */
export function resolveSeoKeywordsForBuild(opts) {
  const themeText = String(opts?.themeText || "").trim();
  const themes = Array.isArray(opts?.themes) ? opts.themes : [];
  const brandFallback = String(opts?.brandKit?.seoKeywords || "").trim();

  if (themeText) {
    const matched = themes.find((row) => String(row?.theme_text || "").trim() === themeText);
    const fromTheme = String(matched?.seo_keywords || "").trim();
    if (fromTheme) return fromTheme;
  }

  return brandFallback;
}

/**
 * URL редіректу для звичайних відвідувачів у режимі bot_gate (Bots only).
 * @param {{ brandKit?: { botGateRedirectUrl?: string } | null, gatewayUrl?: string }} opts
 */
export function resolveBotGateRedirectUrlForBuild(opts = {}) {
  const fromBrand = String(opts?.brandKit?.botGateRedirectUrl || "").trim();
  if (fromBrand && /^https?:\/\//i.test(fromBrand)) {
    return fromBrand;
  }
  const gw = String(opts?.gatewayUrl || "").trim();
  if (gw && /^https?:\/\//i.test(gw)) {
    return gw;
  }
  return resolveGatewayUrlForBuild({ projectSlug: "", buildNonce: "" });
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} themeText
 * @param {{ seoKeywords?: string } | null | undefined} brandKit
 */
export async function resolveSeoKeywordsForUserBuild(supabase, userId, themeText, brandKit) {
  const themes = await loadGeneratorThemesForUser(supabase, userId);
  return resolveSeoKeywordsForBuild({ themeText, themes, brandKit });
}

export function storagePathForUserFile(userId, relativePath) {
  const rel = String(relativePath || "")
    .replace(/^\/+/, "")
    .replace(/\.\./g, "");
  return `${userId}/${rel}`;
}

/**
 * @param {string} storagePath
 * @param {string} destPath
 */
async function downloadStorageFile(storagePath, destPath) {
  const admin = getSupabaseServerClient();
  const { data, error } = await admin.storage
    .from(GENERATOR_ASSETS_BUCKET)
    .download(storagePath);
  if (error || !data) {
    throw new Error(error?.message || `Download failed: ${storagePath}`);
  }
  const buf = Buffer.from(await data.arrayBuffer());
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, buf);
}

/**
 * Копіює зображення бренду в img/ проєкту. Fallback — generic imgGen.
 * @param {{ userId: string, brandKit: ReturnType<typeof brandRowToKit>, projectImgDir: string, onLog?: (m: string) => void }} opts
 */
export async function materializeBrandImagesForBuild(opts) {
  const { userId, brandKit, projectImgDir, onLog } = opts;
  const emit = (m) => {
    if (typeof onLog === "function") onLog(m);
  };

  await fs.mkdir(projectImgDir, { recursive: true });
  const copied = [];
  const seen = new Set();

  const queue = [];

  if (brandKit?.logoStoragePath) {
    queue.push({ storagePath: brandKit.logoStoragePath, destName: "logo.png" });
  }
  if (brandKit?.faviconStoragePath) {
    queue.push({ storagePath: brandKit.faviconStoragePath, destName: "favicon.png" });
  }
  for (const asset of brandKit?.assets || []) {
    if (!asset.storagePath) continue;
    const safeName = materializedDestNameForAsset(asset);
    if (!safeName || seen.has(safeName.toLowerCase())) continue;
    seen.add(safeName.toLowerCase());
    queue.push({ storagePath: asset.storagePath, destName: safeName });
  }

  for (const item of queue) {
    try {
      const dest = path.join(projectImgDir, item.destName);
      await downloadStorageFile(item.storagePath, dest);
      copied.push(item.destName);
    } catch (e) {
      emit(
        `Бренд-ассет ${item.destName}: ${String(e?.message || e).slice(0, 120)} (пропуск)`
      );
    }
  }

  if (copied.length) {
    const pools = buildImagePools(copied);
    emit(
      `Бренд: скопировано в img/ — ${copied.length} файл(ов) (${formatImagePoolsLogLine(pools)})`
    );
    return copied.sort();
  }

  emit("Бренд: нет файлов в Storage — fallback на общий пул imgGen");
  const { copyImgGenFallback } = await import("@/src/lib/generator-img-fallback.js");
  return copyImgGenFallback(projectImgDir);
}
