import path from "node:path";

import { isBannerAsset } from "@/lib/generator-engine/brand-chrome";

/** @typedef {'logo' | 'favicon' | 'hero' | 'game' | 'payment' | 'misc'} BrandAssetKind */

export const BRAND_UPLOAD_KINDS = ["hero", "game", "payment", "misc"];

const KIND_PREFIX = {
  hero: "banner-",
  game: "slot-",
  payment: "pay-",
};

/**
 * @param {string} fileName
 */
export function sanitizeAssetBaseName(fileName) {
  return String(fileName || "asset")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/^-+/, "")
    .replace(/-+/g, "-");
}

/**
 * @param {string} stem
 * @param {BrandAssetKind} kind
 */
function stemHasKindPrefix(stem, kind) {
  if (kind === "hero") {
    return /^(banner|forbanner|forbaner|baner)/i.test(stem);
  }
  if (kind === "game") {
    return /^(slot|game)-/i.test(stem);
  }
  if (kind === "payment") {
    return /^pay-/i.test(stem);
  }
  return false;
}

/**
 * Ім'я файлу в img/ проєкту з префіксом за kind (banner-/slot-/pay-).
 * @param {{ fileName?: string, kind?: string }} asset
 */
export function materializedDestNameForAsset(asset) {
  const raw = sanitizeAssetBaseName(asset?.fileName || "asset");
  const kind = String(asset?.kind || "misc");
  const ext = path.extname(raw) || ".png";
  const stem = path.basename(raw, ext) || "asset";

  if (kind === "hero" && !stemHasKindPrefix(stem, "hero") && !isBannerAsset(raw)) {
    return `${KIND_PREFIX.hero}${stem.replace(/^(banner-|forbanner-|forbaner-)/i, "")}${ext}`;
  }
  if (kind === "game" && !stemHasKindPrefix(stem, "game")) {
    return `${KIND_PREFIX.game}${stem.replace(/^(slot-|game-)/i, "")}${ext}`;
  }
  if (kind === "payment" && !stemHasKindPrefix(stem, "payment")) {
    return `${KIND_PREFIX.payment}${stem.replace(/^pay-/i, "")}${ext}`;
  }
  return raw;
}

/**
 * @param {string} originalName
 * @param {BrandAssetKind} kind
 */
export function buildUploadFileName(originalName, kind) {
  const safe = sanitizeAssetBaseName(originalName || "asset");
  const ext = path.extname(safe) || ".png";
  const stem = path.basename(safe, ext) || "asset";
  const prefix = KIND_PREFIX[kind];
  if (prefix && !stemHasKindPrefix(stem, kind)) {
    return `${prefix}${stem}${ext}`;
  }
  return safe;
}

/**
 * @param {string} fileName
 * @returns {BrandAssetKind}
 */
export function classifyImageFile(fileName) {
  const f = String(fileName || "");
  if (/^logo\./i.test(f) || /^logo[-_]/i.test(f)) return "logo";
  if (/^favicon\./i.test(f) || /^favicon[-_]/i.test(f)) return "favicon";
  if (/^(banner-|forbanner|forbaner)/i.test(f) || isBannerAsset(f)) return "hero";
  if (/^(slot-|game-)/i.test(f)) return "game";
  if (/^pay-/i.test(f)) return "payment";
  return "misc";
}

/**
 * @param {string[]} imageFiles
 */
export function buildImagePools(imageFiles) {
  const all = Array.isArray(imageFiles) ? [...imageFiles] : [];
  /** @type {{ all: string[], logos: string[], favicons: string[], banners: string[], games: string[], payments: string[], misc: string[] }} */
  const pools = {
    all,
    logos: [],
    favicons: [],
    banners: [],
    games: [],
    payments: [],
    misc: [],
  };

  for (const file of all) {
    const kind = classifyImageFile(file);
    if (kind === "logo") pools.logos.push(file);
    else if (kind === "favicon") pools.favicons.push(file);
    else if (kind === "hero") pools.banners.push(file);
    else if (kind === "game") pools.games.push(file);
    else if (kind === "payment") pools.payments.push(file);
    else pools.misc.push(file);
  }

  return pools;
}

/**
 * @param {ReturnType<typeof buildImagePools>} pools
 * @param {{ assets?: { kind?: string }[] } | null} [brandKit]
 */
export function hasStrictBrandAssetCategories(pools, brandKit) {
  if (
    pools?.banners?.length ||
    pools?.games?.length ||
    pools?.payments?.length
  ) {
    return true;
  }
  return Boolean(
    brandKit?.assets?.some((a) =>
      ["hero", "game", "payment"].includes(String(a?.kind || ""))
    )
  );
}

/**
 * @param {string[]} imageFiles
 * @param {ReturnType<typeof buildImagePools>} pools
 * @param {{ assets?: { kind?: string }[] } | null} [brandKit]
 */
export function resolveGameImageFiles(imageFiles, pools, brandKit) {
  if (pools?.games?.length) return pools.games;
  if (hasStrictBrandAssetCategories(pools, brandKit)) return [];
  return Array.isArray(imageFiles) ? imageFiles : [];
}

/**
 * @param {string[]} imageFiles
 * @param {ReturnType<typeof buildImagePools>} pools
 */
export function resolveBannerImageFiles(imageFiles, pools) {
  if (pools?.banners?.length) return pools.banners;
  const list = Array.isArray(imageFiles) ? imageFiles : [];
  return list.filter(
    (f) => classifyImageFile(f) === "hero" || isBannerAsset(f)
  );
}

/**
 * @param {string[]} imageFiles
 * @param {ReturnType<typeof buildImagePools>} pools
 */
export function resolvePaymentImageFiles(imageFiles, pools) {
  if (pools?.payments?.length) return pools.payments;
  const list = Array.isArray(imageFiles) ? imageFiles : [];
  return list.filter((f) => classifyImageFile(f) === "payment");
}

/**
 * @param {string} text
 * @param {number} [maxLen]
 */
export function sanitizePromptOverlayText(text, maxLen = 6500) {
  const raw = String(text || "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!raw) return "";
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen)}…`;
}

/**
 * @param {string | null | undefined} promptOverlay
 */
export function formatBrandPromptOverlay(promptOverlay) {
  const body = sanitizePromptOverlayText(promptOverlay);
  if (!body) return "";
  return sanitizePromptOverlayText(`БРЕНД КЛИЕНТА (настройки admin):\n${body}`);
}

/**
 * @param {ReturnType<typeof buildImagePools>} pools
 */
export function formatImagePoolsLogLine(pools) {
  return `баннеров ${pools.banners.length}, слотов ${pools.games.length}, оплат ${pools.payments.length}, прочее ${pools.misc.length}`;
}
