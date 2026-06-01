import { NextResponse } from "next/server";
import { loadIntegrationSettingsForUser, withUserIntegrationEnv } from "@/lib/account-integration-settings";
import { loadGeneratorBrandForUser } from "@/lib/generator-brand-kit";
import { getSessionUser } from "@/shared/lib/auth/get-session-user";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 900;

function clampMultipagePageCountTotal(raw: unknown) {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return undefined;
  return Math.min(4, Math.max(1, n));
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
  let resetPairedLlmPool: () => void;
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
    ({ getDeepseekPoolSize, resetPairedLlmPool } = await import(
      "@/src/lib/deepseek-key-pool.js"
    ));
    resetPairedLlmPool();
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

  const brandKit = await loadGeneratorBrandForUser(supabase, user.id);
  if (!brandKit?.userId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Бренд для вашого акаунта ще не налаштовано. Зверніться до адміністратора Union.",
      },
      { status: 400 }
    );
  }

  const themeInput = String(body.theme || "").trim();
  const theme =
    themeInput || String(brandKit.defaultThemeText || "").trim();
  if (!theme) {
    return NextResponse.json(
      {
        ok: false,
        error: "Вкажіть тему сайту або попросіть адміністратора задати тему за замовчуванням у бренді.",
      },
      { status: 400 }
    );
  }

  const pageCount = clampMultipagePageCountTotal(body.pageCount);
  const siteCount = clampSiteCount(body.siteCount);
  const generationModeRaw = String(body.generationMode || "standard").trim();
  const hostId = String(body.hostId || "").trim();
  const siteUrlInputGlobal = String(body.siteUrl || "").trim();

  let selectedHost: Awaited<
    ReturnType<(typeof import("@/lib/admin-seo/hostsRepository"))["getHostById"]>
  > = null;
  let plannedDomains: string[] = [];

  if (hostId) {
    const { getHostById } = await import("@/lib/admin-seo/hostsRepository");
    selectedHost = await getHostById(hostId, user.id);
    if (!selectedHost) {
      return NextResponse.json(
        { ok: false, error: "Обраний SSH-хост не знайдено або неактивний." },
        { status: 400 }
      );
    }
    if (!String(selectedHost.sshPassword || "").trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: "У обраного хоста не збережено SSH-пароль. Оновіть хост у Settings.",
        },
        { status: 400 }
      );
    }

    const { listDomainFolderAvailabilityOnHost } = await import(
      "@/lib/admin-seo/hostDomainFolders"
    );
    const folderScan = await listDomainFolderAvailabilityOnHost(selectedHost);
    plannedDomains = folderScan.available.slice(0, siteCount);
    if (plannedDomains.length < siteCount) {
      return NextResponse.json(
        {
          ok: false,
          error:
            siteCount <= 1
              ? `На хості немає вільної папки домену (вільних: ${folderScan.available.length}). Спочатку придбайте домен через автоматизацію доменів.`
              : `Потрібно ${siteCount} вільних папок доменів, знайдено ${folderScan.available.length}. Придбайте домени або звільніть папки на хості.`,
          availableDomains: folderScan.available.length,
          requiredDomains: siteCount,
        },
        { status: 400 }
      );
    }
  }

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

  let poolSize = 0;
  if (usePooledKeys) {
    try {
      poolSize = getDeepseekPoolSize();
      if (poolSize < 1) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Claude API keys are not configured. Add CLAUDE_API_KEY_01 in Dashboard → Settings.",
          },
          { status: 400 }
        );
      }
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Claude API keys are not configured. Add CLAUDE_API_KEY_01 in Dashboard → Settings.";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
  }

  const widRaw = body.windowId;
  const widNum = Math.trunc(Number(widRaw));
  const windowId =
    Number.isFinite(widNum) && widNum >= 1 && widNum <= 10 ? widNum : 1;

  const jobsOut: { jobId: string; projectName: string }[] = [];

  const { reserveEtalonAlternationIndices } = await import(
    "@/src/lib/etalon-alternation.js"
  );
  const etalonAlternationBase = await reserveEtalonAlternationIndices(
    projectNames.length
  );

  for (let i = 0; i < projectNames.length; i += 1) {
    const projectName = projectNames[i];
    const plannedDomain = plannedDomains[i] || "";
    const siteUrlForBuild =
      siteUrlInputGlobal ||
      (plannedDomain ? `https://${plannedDomain}` : "") ||
      `https://${projectName.replace(/[^a-z0-9._-]/gi, "-") || "project"}.generator.local`;

    const jobPayload: Record<string, unknown> = {
      userId: user.id,
      projectName,
      windowId,
      theme,
      brandKit,
      templateKey: body.templateKey,
      html: body.html,
      clusterTheme: body.clusterTheme,
      maxDepth: body.maxDepth,
      claudeApiKey: usePooledKeys ? "" : overrideCk,
      pairedFromPool: usePooledKeys,
      siteUrl: siteUrlForBuild,
      parentSiteUrl: body.parentSiteUrl,
      pageCount,
      referenceTemplateMode: true,
      generationMode: generationModeRaw,
      etalonAlternatingIndex: etalonAlternationBase + i,
    };

    if (hostId && selectedHost) {
      jobPayload.hostId = hostId;
      jobPayload.hostName = selectedHost.name;
      jobPayload.projectsDir = selectedHost.projectsDir || "/var/www";
      if (plannedDomain) {
        jobPayload.plannedDeployDomain = plannedDomain;
      }
    }

    const jobId = await createBuildJob(jobPayload);

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
    keys: usePooledKeys
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
