import path from "node:path";

/** Paths under /Users/… are macOS home dirs; on Linux (e.g. Render) they are almost always copied local .env and fail with EACCES on mkdir. */
function isLeakedMacPath(p) {
  if (!p) return false;
  const abs = path.resolve(p);
  return abs === "/Users" || abs.startsWith(`${path.sep}Users${path.sep}`);
}

function shouldIgnoreCandidate(candidate) {
  return (
    Boolean(candidate) &&
    process.platform !== "darwin" &&
    isLeakedMacPath(candidate)
  );
}

export function getAppRoot() {
  const fromEnv = process.env.SOFT_SUBFOLDER_ROOT_DIR?.trim();
  if (!fromEnv || shouldIgnoreCandidate(fromEnv)) return process.cwd();
  return fromEnv;
}

export function getTemplatesDir() {
  const fromEnv = process.env.SOFT_SUBFOLDER_TEMPLATES_DIR?.trim();
  const appRoot = getAppRoot();
  if (!fromEnv || shouldIgnoreCandidate(fromEnv)) {
    return path.join(appRoot, "templates");
  }
  return fromEnv;
}

export function getProjectsDir() {
  const fromEnv = process.env.SOFT_SUBFOLDER_PROJECTS_DIR?.trim();
  const appRoot = getAppRoot();
  if (!fromEnv || shouldIgnoreCandidate(fromEnv)) {
    return path.join(appRoot, "storage", "projects");
  }
  return fromEnv;
}

export function getJobsDir() {
  return path.join(getAppRoot(), "storage", "jobs");
}

/** Stock images copied into each generated project as `img/`. */
export function getImgGenDir() {
  return path.join(getAppRoot(), "src", "img-gen");
}
