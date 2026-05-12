/**
 * PHP CLI used for warmup and related exec. Native Render "Node" images do not ship php — use the Dockerfile or set SOFT_SUBFOLDER_PHP.
 */
export function getPhpBinary() {
  const fromEnv =
    process.env.SOFT_SUBFOLDER_PHP?.trim() ||
    process.env.PHP_BINARY?.trim() ||
    "";
  return fromEnv || "php";
}
