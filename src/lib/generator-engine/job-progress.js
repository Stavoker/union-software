import fs from "node:fs/promises";
import path from "node:path";
import { getProjectsDir } from "@/src/lib/app-paths";

export function safeProjectDirSegment(name) {
  const value = String(name || "").trim();
  if (!value) return null;
  const safe = value.replace(/[^a-zA-Z0-9._-]/g, "-");
  return safe || null;
}

export async function readBuildProgressFile(projectNameRaw) {
  const safe = safeProjectDirSegment(projectNameRaw);
  if (!safe) return null;
  const projectsRoot = path.resolve(getProjectsDir());
  const projectDir = path.resolve(projectsRoot, safe);
  const rel = path.relative(projectsRoot, projectDir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return null;
  }
  const progressPath = path.join(projectDir, ".aurora_build_progress.json");
  try {
    const raw = await fs.readFile(progressPath, "utf8");
    const p = JSON.parse(raw);
    const pagesTotal = Math.max(0, Math.trunc(Number(p.pagesTotal)));
    const pagesDone = Math.max(0, Math.trunc(Number(p.pagesDone)));
    if (!Number.isFinite(pagesTotal) || !Number.isFinite(pagesDone)) {
      return null;
    }
    return { pagesTotal, pagesDone };
  } catch {
    return null;
  }
}

export function computeProgressPercent(status, progress) {
  if (status === "done") return 100;
  if (status === "error" || status === "cancelled") return 0;
  if (status === "queued") return 0;
  if (status === "running") {
    if (progress && progress.pagesTotal > 0) {
      const raw = Math.round(
        (100 * Math.min(progress.pagesDone, progress.pagesTotal)) / progress.pagesTotal
      );
      if (progress.pagesDone >= progress.pagesTotal) return 99;
      return Math.max(2, Math.min(98, raw));
    }
    return 3;
  }
  return 0;
}
