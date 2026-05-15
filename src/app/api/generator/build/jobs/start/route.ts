import { NextResponse } from "next/server";
import { loadIntegrationSettingsForUser, withUserIntegrationEnv } from "@/lib/account-integration-settings";
import { getSessionUser } from "@/shared/lib/auth/get-session-user";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 900;

function clampMultipagePageCountTotal(raw: unknown) {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return undefined;
  return Math.min(4, Math.max(3, n));
}

/** Batch size cap: text + layout agents run per site; keep concurrency predictable. */
function clampSiteCount(raw: unknown) {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return 1;
  return Math.min(10, Math.max(1, n));
}

function sanitizeProjectNameForBatch(name: string) {
  const value = String(name || "").trim();
  if (!value) {
    throw new Error("Project name is required.");
  }
  const safe = value.replace(/[^a-zA-Z0-9._-]/g, "-");
  if (!safe) {
    throw new Error("Invalid project name.");
  }
  return safe;
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.id) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const supabase = await createSupabaseServerClient();
  let userEnv: Record<string, string> = {};
  try {
    userEnv = await loadIntegrationSettingsForUser(supabase, user.id);
  } catch {
    userEnv = {};
  }

  return withUserIntegrationEnv(userEnv, async () => {
  let getDeepseekPoolSize: () => number;
  let createBuildJob: (payload: Record<string, unknown>) => Promise<string>;
  let runBuildJob: (
    id: string,
    runner: (
      payload: Record<string, unknown>,
      onLog: (msg: string) => void,
      shouldStop: () => boolean
    ) => Promise<unknown>
  ) => Promise<void>;
  let buildProject: (opts: Record<string, unknown>) => Promise<unknown>;

  try {
    ({ getDeepseekPoolSize } = await import("@/src/lib/deepseek-key-pool.js"));
    ({ createBuildJob, runBuildJob } = await import("@/src/lib/build-jobs.js"));
    ({ buildProject } = await import("@/src/lib/project-service.js"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        error: `Generator engine failed to load: ${msg}`,
      },
      { status: 500 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const pageCount = clampMultipagePageCountTotal(body.pageCount);
  const siteCount = clampSiteCount(body.siteCount);

  const baseProjectName = String(body.projectName || "").trim();
  let safeBase: string;
  try {
    safeBase = sanitizeProjectNameForBatch(baseProjectName);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid project name.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  const projectNames: string[] =
    siteCount <= 1
      ? [safeBase]
      : Array.from({ length: siteCount }, (_, i) => `${safeBase}-s${i + 1}`);

  const overrideCk = String(body.claudeApiKey || "").trim();
  const usePooledKeys = !overrideCk.startsWith("sk-ant-");

  let dryRun = false;
  let poolSize = 0;
  if (usePooledKeys) {
    try {
      poolSize = getDeepseekPoolSize();
    } catch {
      dryRun = true;
      poolSize = 0;
    }
  }

  const widRaw = body.windowId;
  const widNum = Math.trunc(Number(widRaw));
  const windowId =
    Number.isFinite(widNum) && widNum >= 1 && widNum <= 10 ? widNum : 1;

  const jobsOut: { jobId: string; projectName: string }[] = [];

  for (const projectName of projectNames) {
    const siteUrlInput = String(body.siteUrl || "").trim();
    const siteUrlForBuild =
      siteUrlInput ||
      `https://${projectName.replace(/[^a-z0-9._-]/gi, "-") || "project"}.generator.local`;

    const jobId = await createBuildJob({
      userId: user.id,
      projectName,
      windowId,
      theme: body.theme,
      templateKey: body.templateKey,
      html: body.html,
      clusterTheme: body.clusterTheme,
      maxDepth: body.maxDepth,
      claudeApiKey: usePooledKeys ? "" : overrideCk,
      pairedFromPool: !dryRun && usePooledKeys,
      dryRun,
      siteUrl: siteUrlForBuild,
      parentSiteUrl: body.parentSiteUrl,
      pageCount,
      referenceTemplateMode: false,
    });

    jobsOut.push({ jobId, projectName });

    setImmediate(() => {
      void withUserIntegrationEnv(userEnv, () =>
        runBuildJob(jobId, async (payload, onLog, shouldStop) =>
          buildProject({
            ...payload,
            onLog,
            shouldStop,
          })
        )
      ).catch((err: unknown) => {
        console.error("[generator] runBuildJob failed:", err);
      });
    });
  }

  return NextResponse.json({
    ok: true,
    jobs: jobsOut,
    jobId: jobsOut[0]?.jobId ?? null,
    siteCount: projectNames.length,
    pagesPlanned: pageCount ?? null,
    uiDryRun: dryRun,
    keys: dryRun
      ? {
          slot: null,
          slotSuffix: null,
          poolSize: 0,
          pairedFromEnv: false,
          leasePending: false,
          uiDryRun: true,
        }
      : usePooledKeys
        ? {
            slot: null,
            slotSuffix: null,
            poolSize,
            pairedFromEnv: true,
            leasePending: true,
          }
        : {
            slot: Number(body.keySlotOverride) || 0,
            slotSuffix: null,
            poolSize,
            pairedFromEnv: false,
            leasePending: false,
          },
  });
  });
}
