/**
 * Лёгкий слой «blueprint» для промпта: без жёстких layout/sidebar/density из seed.
 * Порядок секций в промпте = **sectionOrder** из плана архитектора (после normalizePagesPlan).
 * Модель сама выбирает сетку, сайдбар и плотность в рамках layoutVariant и контента.
 */

function toBlueprintDirectives(page, planSectionOrder) {
  const type = String(page?.type || "");
  return {
    sectionSequence: Array.isArray(planSectionOrder) ? [...planSectionOrder] : [],
    domHint:
      type === "article"
        ? "longform with nested article blocks and toc landmarks"
        : type === "comparison"
          ? "table-heavy with alternating rows and side explanations"
          : type === "faq"
            ? "faq-first flow with scannable headings"
            : "modular semantic sections with varied hierarchy",
  };
}

function formatPromptBlock(pageBlueprints, referenceBlend = false) {
  const lines = pageBlueprints
    .map((p) => {
      const seq = Array.isArray(p.blueprint?.sectionSequence)
        ? p.blueprint.sectionSequence.join(" -> ")
        : "—";
      return `- ${p.file}: type=${p.type}; sectionOrder (план архитектора): ${seq}`;
    })
    .join("\n");
  if (referenceBlend) {
    return `
STAGE 4 — PAGE BLUEPRINT (без фиксированных layout/sidebar/density из кода генератора):
${lines}

Порядок крупных блоков в <main> — из JSON плана архитектора и **REFERENCE LOCK**: **максимально тот же каркас**, что у референса (включая двухколоночные макеты с aside). dom_hint — вторична: **не** отходи от паттерна референса ради «разнообразия между билдами».

РЕФЕРЕНС = ЗЕРКАЛО КАРКАСА:
- Меняй копирайт и бренд; **не** меняй типовую схему секций, hero и сайдбаров относительно референса.
- Внутренние страницы этого сайта — тот же принцип: ближе к референсу по DOM-ритму, чем к случайному «уникальному» шаблону.
`;
  }
  return `
STAGE 4 — PAGE BLUEPRINT (без фиксированных layout/sidebar/density из кода генератора):
${lines}

Порядок крупных блоков в <main> — только из JSON плана архитектора (sectionOrder) и блока «ПЛАН АРХИТЕКТОРА» на странице; dom_hint ниже — мягкая подсказка по форме текста, не замена плана.

ANTI-PATTERN RULES (MANDATORY):
- Do not repeat the same first 3 sections across pages.
- Do not repeat identical DOM depth rhythm for all pages.
- Do not reuse one hero structure on every page.
- Home/index: never treat «hero split + row of equal KPI cells + symmetric icon grid» as the default spine; if metric_strip or icon_columns appears, separate it from the first screen and change shape (asymmetric, prose, timeline).
- Inner pages (not index): avoid the recurring «main column + narrow sticky right rail» with three boxed widgets and stock Russian labels like «НА ЭТОЙ СТРАНИЦЕ / ДРУГИЕ РАЗДЕЛЫ / СОВЕТ»; use different navigation patterns (inline anchors, horizontal chips, one compact aside) and unique widget titles if any sidebar exists.
- Vary list/table/card/text density between pages.
`;
}

/**
 * @param {object} opts
 * @param {object} opts.manifest — manifest пакета (page_types и т.д.)
 * @param {Array<object>} opts.pages — уже нормализованный план страниц (sectionOrder из архитектора)
 * @param {string} opts.siteSeed — оставлен в сигнатуре для совместимости вызовов; не используется для порядка секций
 * @param {function} [opts.onLog]
 * @param {boolean} [opts.referenceBlend] — режим «каркас как у референса»: смягчает ANTI-PATTERN блока blueprint.
 */
export function buildPageBlueprintPlan({
  manifest,
  pages,
  siteSeed: _siteSeed,
  onLog,
  referenceBlend = false,
}) {
  const pageBlueprints = (pages || []).map((p) => {
    const type = String(
      manifest?.page_types?.find((x) => String(x.file) === String(p.file))?.type ||
        "resource"
    );
    const planOrder = Array.isArray(p.sectionOrder) ? p.sectionOrder : [];
    const blueprint = toBlueprintDirectives({ ...p, type }, planOrder);
    return { file: p.file, type, blueprint };
  });
  if (typeof onLog === "function") {
    onLog(`[blueprints] page blueprints (plan-driven section order): ${pageBlueprints.length}`);
  }
  return {
    byFile: Object.fromEntries(pageBlueprints.map((p) => [String(p.file), p])),
    promptBlock: formatPromptBlock(pageBlueprints, referenceBlend),
  };
}
