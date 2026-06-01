import { Resolver } from "node:dns";

const PUBLIC_RESOLVERS = ["8.8.8.8", "8.8.4.4", "1.1.1.1", "1.0.0.1"];

function queryResolver(resolver, zone, rrType) {
  return new Promise((resolve, reject) => {
    resolver[rrType](zone, (err, val) => {
      if (err) reject(err);
      else resolve(val);
    });
  });
}

/**
 * NS через публічні резолвери (як dig @8.8.8.8). На Render системний resolveNs часто відстає.
 */
export async function resolveNsPublic(zoneApex, { servers = PUBLIC_RESOLVERS } = {}) {
  const zone = String(zoneApex || "").trim().toLowerCase();
  if (!zone) {
    return { ns: [], source: "empty", error: "empty zone" };
  }
  const resolver = new Resolver();
  resolver.setServers(servers);
  try {
    const ns = await queryResolver(resolver, zone, "resolveNs");
    const list = (Array.isArray(ns) ? ns : [])
      .map((h) => String(h || "").trim().toLowerCase())
      .filter(Boolean);
    if (list.length) {
      return { ns: list, source: `public:${servers[0]}`, error: null };
    }
    return { ns: [], source: "public", error: "empty NS set" };
  } catch (e) {
    return { ns: [], source: "public", error: e?.message || String(e) };
  }
}

/** Спочатку публічний DNS, потім системний (fallback). */
export async function resolveNsBestEffort(zoneApex) {
  const zone = String(zoneApex || "").trim().toLowerCase();
  const pub = await resolveNsPublic(zone);
  if (pub.ns.length) {
    return { ns: pub.ns, source: pub.source, error: null };
  }
  try {
    const dns = await import("node:dns/promises");
    const sys = await dns.resolveNs(zone);
    const list = (Array.isArray(sys) ? sys : [])
      .map((h) => String(h || "").trim().toLowerCase())
      .filter(Boolean);
    if (list.length) {
      return { ns: list, source: "system", error: null };
    }
    return { ns: [], source: "system", error: "empty NS set" };
  } catch (e) {
    return { ns: [], source: "system", error: pub.error || e?.message || String(e) };
  }
}
