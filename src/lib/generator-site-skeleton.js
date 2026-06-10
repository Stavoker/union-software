import crypto from "node:crypto";

import { getSupabaseServerClient } from "@/lib/admin-seo/supabaseServer";

export function isGeneratorSiteSkeletonsTableError(message) {
  const m = String(message || "").toLowerCase();
  return (
    m.includes("generator_site_skeletons") &&
    (m.includes("does not exist") || m.includes("schema cache") || m.includes("relation"))
  );
}

/**
 * @param {Record<string, unknown>} skeletonJson
 */
export function buildSkeletonFingerprint(skeletonJson) {
  const json = skeletonJson && typeof skeletonJson === "object" ? skeletonJson : {};
  const orders = json.pageFrameworks?.orders || json.pageFrameworks || {};
  const payload = JSON.stringify({
    chrome: json.chromeTemplateId || "",
    home: json.homePageFrameworkId || "",
    layout: json.siteLayout || "",
    orders,
  });
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/**
 * @param {import('@/lib/generator-engine/build-jobs').BuildJob | { result?: Record<string, unknown>, payload?: Record<string, unknown> } | null} job
 */
export function buildSiteSkeletonPayloadFromJob(job) {
  const result = job?.result && typeof job.result === "object" ? job.result : {};
  const manifest =
    result.manifest && typeof result.manifest === "object" ? result.manifest : {};
  const pageFrameworksJson =
    result.pageFrameworksJson || job?.payload?.pageFrameworksJson || null;
  const pages = Array.isArray(manifest.pages) ? manifest.pages : [];
  const pageFiles = pages.length
    ? pages.map((p) => String(p?.file || "").trim()).filter(Boolean)
    : Array.isArray(result.pages)
      ? result.pages.map((f) => String(f || "").trim()).filter(Boolean)
      : [];

  const chromeTemplateId = String(result.chromeTemplateId || "").trim();
  const homePageFrameworkId = String(
    result.homeTemplateId || pageFrameworksJson?.home || ""
  ).trim();
  const siteLayout = String(result.siteLayout || manifest.siteLayout || "").trim();
  const stack = String(result.stack || job?.payload?.stack || "react").trim() || "react";

  const skeletonJson = {
    stack,
    siteLayout,
    chromeTemplateId,
    homePageFrameworkId,
    pageCount: pageFiles.length,
    pageFiles,
    pageFrameworks: pageFrameworksJson,
    pages: pages.map((p) => ({
      file: String(p?.file || "").trim(),
      componentIds: Array.isArray(p?.componentIds) ? [...p.componentIds] : [],
      role: String(p?.role || "").trim(),
    })),
    registryPool: Array.isArray(manifest.componentRegistry)
      ? [...manifest.componentRegistry]
      : [],
  };

  return {
    stack,
    siteLayout: siteLayout || null,
    chromeTemplateId: chromeTemplateId || null,
    homePageFrameworkId: homePageFrameworkId || null,
    pageCount: skeletonJson.pageCount,
    skeletonJson,
    skeletonFingerprint: buildSkeletonFingerprint(skeletonJson),
  };
}

/**
 * @param {string[]} a
 * @param {string[]} b
 */
function orderSequenceSimilarity(a, b) {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  if (!left.length && !right.length) return 1;
  const maxLen = Math.max(left.length, right.length, 1);
  let matches = 0;
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] === right[i]) matches += 1;
  }
  return matches / maxLen;
}

/**
 * Structural similarity 0–100 between two skeleton rows or payloads.
 * @param {Record<string, unknown>} a
 * @param {Record<string, unknown>} b
 */
export function computeSkeletonSimilarityPercent(a, b) {
  if (!a || !b) return 0;

  const weights = {
    chrome: 0.12,
    homeFramework: 0.08,
    siteLayout: 0.1,
    pageCount: 0.05,
    frameworkIds: 0.22,
    sectionOrders: 0.43,
  };

  let score = 0;
  if (String(a.chrome_template_id || a.chromeTemplateId || "") ===
      String(b.chrome_template_id || b.chromeTemplateId || "")) {
    score += weights.chrome;
  }
  if (String(a.home_page_framework_id || a.homePageFrameworkId || "") ===
      String(b.home_page_framework_id || b.homePageFrameworkId || "")) {
    score += weights.homeFramework;
  }
  if (String(a.site_layout || a.siteLayout || "") ===
      String(b.site_layout || b.siteLayout || "")) {
    score += weights.siteLayout;
  }
  const pageCountA = Number(a.page_count ?? a.pageCount) || 0;
  const pageCountB = Number(b.page_count ?? b.pageCount) || 0;
  if (pageCountA > 0 && pageCountA === pageCountB) score += weights.pageCount;

  const jsonA = a.skeleton_json || a.skeletonJson || {};
  const jsonB = b.skeleton_json || b.skeletonJson || {};
  const pfA = jsonA.pageFrameworks || {};
  const pfB = jsonB.pageFrameworks || {};
  const byKindA = pfA.byPageKind || {};
  const byKindB = pfB.byPageKind || {};
  const ordersA = pfA.orders || {};
  const ordersB = pfB.orders || {};

  const kinds = new Set([
    "home",
    ...Object.keys(byKindA),
    ...Object.keys(byKindB),
    ...Object.keys(ordersA),
    ...Object.keys(ordersB),
  ]);

  let fwSum = 0;
  let orderSum = 0;
  let kindCount = 0;
  for (const kind of kinds) {
    kindCount += 1;
    if (kind === "home") {
      const homeA = String(jsonA.homePageFrameworkId || pfA.home || "").trim();
      const homeB = String(jsonB.homePageFrameworkId || pfB.home || "").trim();
      fwSum += homeA && homeA === homeB ? 1 : 0;
      orderSum += orderSequenceSimilarity(ordersA.home, ordersB.home);
    } else {
      fwSum += String(byKindA[kind] || "") === String(byKindB[kind] || "") ? 1 : 0;
      orderSum += orderSequenceSimilarity(ordersA[kind], ordersB[kind]);
    }
  }

  if (kindCount > 0) {
    score += weights.frameworkIds * (fwSum / kindCount);
    score += weights.sectionOrders * (orderSum / kindCount);
  }

  return Math.round(Math.min(1, Math.max(0, score)) * 100);
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {string} excludeJobId
 */
export function findMaxSimilarityForRow(rows, row, excludeJobId = "") {
  let best = 0;
  let bestProject = "";
  for (const other of rows || []) {
    if (!other || other.job_id === row.job_id) continue;
    if (excludeJobId && other.job_id === excludeJobId) continue;
    const pct = computeSkeletonSimilarityPercent(row, other);
    if (pct > best) {
      best = pct;
      bestProject = String(other.project_name || "").trim();
    }
  }
  return { percent: best, projectName: bestProject };
}

/**
 * Top similar pairs from a list of skeleton rows.
 * @param {Record<string, unknown>[]} rows
 * @param {number} limit
 * @param {number} minPercent
 */
export function findTopSimilarPairs(rows, limit = 15, minPercent = 55) {
  const list = Array.isArray(rows) ? rows : [];
  const pairs = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const pct = computeSkeletonSimilarityPercent(list[i], list[j]);
      if (pct < minPercent) continue;
      pairs.push({
        percent: pct,
        a: {
          jobId: list[i].job_id,
          projectName: list[i].project_name || "—",
          userId: list[i].user_id,
        },
        b: {
          jobId: list[j].job_id,
          projectName: list[j].project_name || "—",
          userId: list[j].user_id,
        },
      });
    }
  }
  pairs.sort((x, y) => y.percent - x.percent);
  return pairs.slice(0, Math.max(1, limit));
}

/**
 * @param {import('@/lib/generator-engine/build-jobs').BuildJob | null} job
 */
export async function recordGeneratorSiteSkeletonFromJob(job) {
  const userId = String(job?.payload?.userId || "").trim();
  if (!userId || !job?.id) return { ok: false, skipped: true, reason: "no_user" };

  const built = buildSiteSkeletonPayloadFromJob(job);
  if (!built.pageCount && !built.chromeTemplateId && !built.homePageFrameworkId) {
    return { ok: false, skipped: true, reason: "empty_skeleton" };
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    return { ok: false, skipped: true, reason: "supabase_unavailable" };
  }

  const row = {
    user_id: userId,
    job_id: job.id,
    project_name: String(job?.payload?.projectName || "").trim(),
    status: String(job?.status || "done"),
    stack: built.stack,
    site_layout: built.siteLayout,
    chrome_template_id: built.chromeTemplateId,
    home_page_framework_id: built.homePageFrameworkId,
    page_count: built.pageCount,
    skeleton_json: built.skeletonJson,
    skeleton_fingerprint: built.skeletonFingerprint,
  };

  const { error } = await supabase.from("generator_site_skeletons").upsert(row, {
    onConflict: "job_id",
  });

  if (error) {
    if (isGeneratorSiteSkeletonsTableError(error.message)) {
      return { ok: false, skipped: true, reason: "table_missing" };
    }
    console.error("[generator-site-skeleton] record failed:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true, fingerprint: built.skeletonFingerprint };
}
