import fs from "node:fs/promises";
import { PassThrough, Readable } from "node:stream";
import path from "node:path";
import archiver from "archiver";
import { NextResponse } from "next/server";
import { getSessionUserEmail } from "@/shared/lib/auth/get-session-user";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Додає у ZIP лише deployable файли (без _react_src, node_modules тощо).
 */
async function appendFilteredDirToArchive(
  archive: archiver.Archiver,
  localDir: string,
  archivePrefix: string,
  shouldSkip: (name: string, isDirectory: boolean) => boolean
) {
  const entries = await fs.readdir(localDir, { withFileTypes: true });
  for (const ent of entries) {
    if (shouldSkip(ent.name, ent.isDirectory())) continue;
    const lp = path.join(localDir, ent.name);
    const name = archivePrefix ? `${archivePrefix}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      await appendFilteredDirToArchive(archive, lp, name, shouldSkip);
    } else {
      archive.file(lp, { name });
    }
  }
}

export async function GET(req: Request) {
  const email = await getSessionUserEmail();
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const projectName = String(searchParams.get("projectName") || "").trim();
    if (!projectName) {
      throw new Error("Missing projectName");
    }

    const { getProjectPath } = await import("@/src/lib/project-service.js");
    const { shouldSkipDeployProjectEntry } = await import(
      "@/lib/generator-engine/multipage-postprocess.js"
    );
    const projectPath = await getProjectPath(projectName);

    const pass = new PassThrough();
    const archive = archiver("zip", { zlib: { level: 6 } });

    archive.on("error", (err) => {
      pass.destroy(err);
    });
    archive.pipe(pass);

    void (async () => {
      try {
        await appendFilteredDirToArchive(
          archive,
          projectPath,
          "",
          shouldSkipDeployProjectEntry
        );
        await archive.finalize();
      } catch (err) {
        archive.abort();
        pass.destroy(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    const webStream = Readable.toWeb(pass) as ReadableStream<Uint8Array>;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(projectName)}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ZIP error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
