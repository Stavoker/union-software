/** @typedef {{ root_domain: string, daily_limit: number, used_today: number, last_reset_day: string | null, active?: boolean }} RootDomainRow */

export function utcDateString() {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeRoot(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) {
    return null;
  }
  return v;
}

/**
 * Класифікація коренів під два бренди (laki*.casino vs lakiworld*.casino).
 * Усе інше — generic (один корінь може обслуговувати обидва префікси піддоменів).
 * @param {string} root
 * @returns {"laki" | "lakiworld" | "generic"}
 */
export function rootDomainBrandPool(root) {
  const d = String(root || "").trim().toLowerCase();
  if (/^lakiworld\d+\./.test(d)) {
    return "lakiworld";
  }
  if (/^laki\d+\./.test(d)) {
    return "laki";
  }
  return "generic";
}

/**
 * @param {RootDomainRow[]} rows
 * @param {"laki" | "lakiworld"} brand
 */
export function filterRootRowsForBrand(rows, brand) {
  return rows.filter((r) => {
    const pool = rootDomainBrandPool(r.root_domain);
    if (pool === "generic") {
      return true;
    }
    return pool === brand;
  });
}

/**
 * @param {string} supabaseUrl
 * @param {string} serviceKey
 * @param {string} table
 * @returns {Promise<RootDomainRow[]>}
 */
export async function fetchActiveRootDomains(supabaseUrl, serviceKey, table) {
  const base = supabaseUrl.replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/${encodeURIComponent(table)}`);
  url.searchParams.set("select", "root_domain,daily_limit,used_today,last_reset_day,active");
  url.searchParams.set("active", "eq.true");
  url.searchParams.set("order", "root_domain.asc");

  const res = await fetch(url.toString(), {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : [];
  } catch {
    throw new Error("Supabase: некорректный JSON при чтении root_domains");
  }
  if (!res.ok) {
    const msg = typeof data === "object" && data?.message ? String(data.message) : text.slice(0, 200);
    throw new Error(`Supabase ${res.status}: ${msg}`);
  }
  return Array.isArray(data) ? data : [];
}

/**
 * @param {RootDomainRow} row
 * @param {string} today YYYY-MM-DD (UTC)
 */
export function effectiveUsedToday(row, today = utcDateString()) {
  const last = row.last_reset_day == null ? null : String(row.last_reset_day).slice(0, 10);
  if (last !== today) {
    return 0;
  }
  return Math.max(0, Number(row.used_today) || 0);
}

/**
 * @param {RootDomainRow} row
 * @param {string} today
 */
export function remainingDailySlots(row, today = utcDateString()) {
  const limit = Math.max(0, Number(row.daily_limit) || 0);
  return Math.max(0, limit - effectiveUsedToday(row, today));
}

/**
 * @param {RootDomainRow[]} rows
 * @param {number} needSlots
 * @param {string} today
 * @returns {RootDomainRow | null}
 */
export function pickRootForBatch(rows, needSlots, today = utcDateString()) {
  for (const row of rows) {
    if (remainingDailySlots(row, today) >= needSlots) {
      return row;
    }
  }
  return null;
}

/**
 * @param {RootDomainRow[]} rows
 * @param {string} rootNorm
 * @returns {RootDomainRow | undefined}
 */
export function findRootRow(rows, rootNorm) {
  const key = String(rootNorm || "").trim().toLowerCase();
  return rows.find((r) => String(r.root_domain || "").trim().toLowerCase() === key);
}

/**
 * Persist used_today / last_reset_day after allocating subdomains on this root.
 * @param {boolean} skip when using env-only synthetic row (no DB row)
 */
export async function incrementRootUsedToday(
  supabaseUrl,
  serviceKey,
  table,
  row,
  increment,
  today = utcDateString(),
  skip = false
) {
  if (skip || increment <= 0) {
    return;
  }
  const root = String(row.root_domain || "").trim();
  if (!root) {
    return;
  }
  const last = row.last_reset_day == null ? null : String(row.last_reset_day).slice(0, 10);
  const eff = last === today ? Math.max(0, Number(row.used_today) || 0) : 0;
  const newUsed = eff + increment;

  const base = supabaseUrl.replace(/\/+$/, "");
  const url = `${base}/rest/v1/${encodeURIComponent(table)}?root_domain=eq.${encodeURIComponent(root)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: "return=minimal",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      used_today: newUsed,
      last_reset_day: today,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    const msg = typeof data === "object" && data?.message ? String(data.message) : text.slice(0, 200);
    throw new Error(`Supabase PATCH root_domains ${res.status}: ${msg}`);
  }
}
