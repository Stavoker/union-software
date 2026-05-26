import { NextResponse } from "next/server";
import {
  fetchSiteTemplateBundleFromSupabase,
  listActiveSiteTemplates,
} from "@/lib/generator-engine/generation-site-templates";
import {
  getSiteTemplateBundle,
  loadSiteTemplateBundleFromFilesystem,
} from "@/lib/generator-engine/site-templates";
import { getSessionUser } from "@/shared/lib/auth/get-session-user";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ slug: string }> };

/**
 * GET /api/generator/site-templates/[slug]
 * Query: kind=page|css|js|partial|other — фильтр; path=index.php — один asset.
 */
export async function GET(req: Request, ctx: RouteCtx) {
  const user = await getSessionUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { slug: slugRaw } = await ctx.params;
  const slug = String(slugRaw || "").trim().toLowerCase();
  if (!slug) {
    return NextResponse.json({ ok: false, error: "slug required" }, { status: 400 });
  }

  const url = new URL(req.url);
  const kindFilter = String(url.searchParams.get("kind") || "").trim().toLowerCase();
  const pathFilter = String(url.searchParams.get("path") || "").trim();
  const source = String(url.searchParams.get("source") || "supabase")
    .trim()
    .toLowerCase();

  try {
    const templates = await listActiveSiteTemplates();
    const meta = templates.find((t) => String(t.slug) === slug);
    if (!meta && source !== "filesystem") {
      return NextResponse.json(
        { ok: false, error: `Template not found: ${slug}` },
        { status: 404 }
      );
    }

    let bundle;
    if (source === "filesystem") {
      const fsMap = loadSiteTemplateBundleFromFilesystem(slug);
      bundle = fsMap;
    } else {
      bundle = await fetchSiteTemplateBundleFromSupabase(slug);
      if (bundle.size === 0) {
        bundle = await getSiteTemplateBundle(slug);
      }
    }

    if (pathFilter) {
      const row = bundle.get(pathFilter);
      if (!row) {
        return NextResponse.json(
          { ok: false, error: `Asset not found: ${pathFilter}` },
          { status: 404 }
        );
      }
      return NextResponse.json({
        ok: true,
        slug,
        asset: { path: pathFilter, kind: row.kind, content: row.content },
      });
    }

    const assets = [];
    for (const [assetPath, row] of bundle.entries()) {
      if (kindFilter && row.kind !== kindFilter) continue;
      assets.push({
        path: assetPath,
        kind: row.kind,
        content: row.content,
        size: row.content.length,
      });
    }

    return NextResponse.json({
      ok: true,
      template: meta || { slug },
      assetCount: assets.length,
      assets,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: String((e as Error)?.message || e).slice(0, 400),
      },
      { status: 500 }
    );
  }
}
