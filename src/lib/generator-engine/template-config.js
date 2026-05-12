import fs from "node:fs";
import path from "node:path";
import { getTemplatesDir } from "@/src/lib/app-paths";

const TEMPLATES_DIR = getTemplatesDir();

const TEMPLATE_ORDER = [
  {
    key: "laki-world-one-calster",
    label: "laki-world-one-calster",
    humanLabel: "Создать под отдельный кластер Laki World",
    humanDescription:
      "Один выбранный кластер для главной и цепочки /en/ (глубина 10–100 задаётся при сборке).",
    brand: "laki-world",
    mode: "one-cluster",
    sourceDir: path.join(TEMPLATES_DIR, "laki-world-one-calster"),
  },
  {
    key: "laki-world-random-claster",
    label: "laki-world-random-claster",
    humanLabel: "Создать под разные кластеры Laki World",
    humanDescription:
      "Разные кластеры из массива для главной и цепочки /en/ (глубина 10–100 при сборке).",
    brand: "laki-world",
    mode: "random-cluster",
    sourceDir: path.join(TEMPLATES_DIR, "laki-world-random-claster"),
  },
  {
    key: "laki-world-random-topic",
    label: "lakiworld-random-topic",
    humanLabel: "Создать под разные темы Laki World",
    humanDescription:
      "Разные тематические тексты про Laki World для главной и цепочки /en/ (глубина 10–100 при сборке).",
    brand: "laki-world",
    mode: "random-topic",
    sourceDir: path.join(TEMPLATES_DIR, "lakiworld-random-topic"),
  },
  {
    key: "laki-one-claster",
    label: "laki-one-claster",
    humanLabel: "Создать под отдельный кластер Laki",
    humanDescription:
      "Один выбранный кластер для бренда Laki (без world/ворлд).",
    brand: "laki",
    mode: "one-cluster",
    sourceDir: path.join(TEMPLATES_DIR, "laki-one-claster"),
  },
  {
    key: "laki-random-claster",
    label: "laki-random-claster",
    humanLabel: "Создать под разные кластеры Laki",
    humanDescription:
      "Разные кластеры из массива для бренда Laki (без world/ворлд).",
    brand: "laki",
    mode: "random-cluster",
    sourceDir: path.join(TEMPLATES_DIR, "laki-random-claster"),
  },
  {
    key: "laki-random-topic",
    label: "laki-random-topic",
    humanLabel: "Создать под разные темы Laki",
    humanDescription:
      "Разные тематические тексты про Laki для главной и цепочки /en/ (глубина 10–100 при сборке).",
    brand: "laki",
    mode: "random-topic",
    sourceDir: path.join(TEMPLATES_DIR, "laki-random-topic"),
    fallbackSourceDir: path.join(TEMPLATES_DIR, "laki-random-topic копія"),
  },
];

export function listTemplates() {
  return TEMPLATE_ORDER.map((item) => ({
    key: item.key,
    label: item.label,
    humanLabel: item.humanLabel || item.label,
    humanDescription: item.humanDescription || "",
    brand: item.brand,
    mode: item.mode,
    available: Boolean(resolveTemplateSource(item)),
  }));
}

export function getTemplateByKey(key) {
  const tpl = TEMPLATE_ORDER.find((item) => item.key === key);
  if (!tpl) return null;
  const sourceDir = resolveTemplateSource(tpl);
  if (!sourceDir) return null;
  return { ...tpl, sourceDir };
}

function resolveTemplateSource(template) {
  if (fs.existsSync(template.sourceDir)) return template.sourceDir;
  if (template.fallbackSourceDir && fs.existsSync(template.fallbackSourceDir)) {
    return template.fallbackSourceDir;
  }
  return null;
}
