import { isBotGateGenerationMode } from "@/src/lib/generation-modes";
import { isReactGenerationStack } from "@/src/lib/generation-stack";

/** @typedef {"php" | "spa" | "auto"} DeployVhostMode */

export const VHOST_MODE_PHP = "php";
export const VHOST_MODE_SPA = "spa";
export const VHOST_MODE_AUTO = "auto";

/**
 * @param {unknown} raw
 * @returns {DeployVhostMode}
 */
export function normalizeVhostMode(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (v === VHOST_MODE_SPA || v === "react" || v === "static" || v === "spa-static") {
    return VHOST_MODE_SPA;
  }
  if (v === VHOST_MODE_AUTO) return VHOST_MODE_AUTO;
  return VHOST_MODE_PHP;
}

/**
 * @param {{ stack?: string; generationMode?: string; hasIndexPhp?: boolean; hasIndexHtml?: boolean }} opts
 * @returns {DeployVhostMode}
 */
export function resolveDeployVhostMode(opts = {}) {
  if (opts.hasIndexPhp) return VHOST_MODE_PHP;
  if (
    isReactGenerationStack(opts.stack) &&
    !isBotGateGenerationMode(opts.generationMode)
  ) {
    return VHOST_MODE_SPA;
  }
  if (opts.hasIndexHtml && !opts.hasIndexPhp) return VHOST_MODE_SPA;
  return VHOST_MODE_PHP;
}
