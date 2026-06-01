import fs from "node:fs/promises";
import path from "node:path";
import { getProjectsDir } from "@/src/lib/app-paths";
import {
  pickEtalonByAlternatingIndex,
  SITE_TEMPLATE_BET162,
  SITE_TEMPLATE_SPOT064,
} from "@/lib/generator-engine/site-templates";

const SEQ_FILE = ".etalon-alternation-seq";

/** Резервує `count` індексів черги (0=bet162, 1=spot064, …) і повертає перший. */
export async function reserveEtalonAlternationIndices(count = 1) {
  const n = Math.max(1, Math.trunc(Number(count) || 1));
  const dir = getProjectsDir();
  await fs.mkdir(dir, { recursive: true });
  const seqPath = path.join(dir, SEQ_FILE);
  let base = 0;
  try {
    const raw = String(await fs.readFile(seqPath, "utf8")).trim();
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) base = parsed;
  } catch {
    /* перший запуск */
  }
  await fs.writeFile(seqPath, String(base + n), "utf8");
  return base;
}

export function resolveEtalonTemplateForAlternatingIndex(index = 0) {
  const fromEnv = String(process.env.SOFTGEN_ETALON_TEMPLATE || "")
    .trim()
    .toLowerCase();
  if (fromEnv === "bet162" || fromEnv === SITE_TEMPLATE_BET162) {
    return SITE_TEMPLATE_BET162;
  }
  if (fromEnv === "spot064" || fromEnv === SITE_TEMPLATE_SPOT064) {
    return SITE_TEMPLATE_SPOT064;
  }
  return pickEtalonByAlternatingIndex(index);
}

export function etalonLabelForTemplateId(templateId) {
  return templateId === SITE_TEMPLATE_SPOT064 ? "u-spot064" : "u-bet162";
}
