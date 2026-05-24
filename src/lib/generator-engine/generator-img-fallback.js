import fs from "node:fs/promises";
import path from "node:path";

import { getImgGenDir } from "@/src/lib/app-paths";

/** Fallback pool when brand has no uploaded images. */
export async function copyImgGenFallback(projectImgDir) {
  const srcDir = getImgGenDir();
  await fs.mkdir(projectImgDir, { recursive: true });
  let names;
  try {
    names = await fs.readdir(srcDir);
  } catch {
    return [];
  }
  const copied = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const sp = path.join(srcDir, name);
    const dp = path.join(projectImgDir, name);
    try {
      const st = await fs.stat(sp);
      if (st.isFile()) {
        await fs.copyFile(sp, dp);
        copied.push(name);
      }
    } catch {
      /* skip */
    }
  }
  return copied.sort();
}
