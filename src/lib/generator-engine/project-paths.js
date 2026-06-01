import fs from "node:fs/promises";
import path from "node:path";

import { getProjectsDir } from "./app-paths.js";

export function sanitizeProjectName(name) {
  const value = String(name || "").trim();
  if (!value) {
    throw new Error("Укажи название проекта.");
  }
  const safe = value.replace(/[^a-zA-Z0-9._-]/g, "-");
  if (!safe) {
    throw new Error("Некорректное название проекта.");
  }
  return safe;
}

export async function ensureProjectExists(projectPath) {
  try {
    const stat = await fs.stat(projectPath);
    if (!stat.isDirectory()) {
      throw new Error("Путь проекта не является папкой.");
    }
  } catch {
    throw new Error("Проект не найден. Сначала выполни сборку.");
  }
}

export async function getProjectPath(projectName) {
  const safeName = sanitizeProjectName(projectName);
  const outputDir = path.join(getProjectsDir(), safeName);
  await ensureProjectExists(outputDir);
  return outputDir;
}
