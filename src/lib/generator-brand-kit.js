import fs from "node:fs/promises";
import path from "node:path";

import { getSupabaseServerClient } from "@/lib/admin-seo/supabaseServer";
import { normalizePalette } from "@/lib/generator-brand-palette";

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
    .select("id, title, theme_text, page_count, sort_order")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
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
    const safeName = String(asset.fileName || path.basename(asset.storagePath))
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/^-+/, "");
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
    emit(`Бренд: скопировано в img/ — ${copied.length} файл(ов)`);
    return copied.sort();
  }

  emit("Бренд: нет файлов в Storage — fallback на общий пул imgGen");
  const { copyImgGenFallback } = await import("@/src/lib/generator-img-fallback.js");
  return copyImgGenFallback(projectImgDir);
}
