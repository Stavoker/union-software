import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import archiver from "archiver";
import { NextResponse } from "next/server";
import { getSessionUserEmail } from "@/shared/lib/auth/get-session-user";

export const runtime = "nodejs";

async function zipDirectory(sourceDir: string, outPath: string) {
  await new Promise<void>((resolve, reject) => {
    const output = fsSync.createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    void archive.finalize();
  });
}

export async function GET(req: Request) {
  const email = await getSessionUserEmail();
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  let tempZipPath: string | null = null;
  try {
    const { searchParams } = new URL(req.url);
    const projectName = String(searchParams.get("projectName") || "").trim();
    if (!projectName) {
      throw new Error("Missing projectName");
    }

    const { getProjectPath } = await import("@/src/lib/project-service.js");
    const projectPath = await getProjectPath(projectName);
    tempZipPath = path.join(os.tmpdir(), `union-gen-${randomUUID()}.zip`);

    await zipDirectory(projectPath, tempZipPath);
    const zipBuffer = await fs.readFile(tempZipPath);

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(projectName)}.zip"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ZIP error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  } finally {
    if (tempZipPath) {
      try {
        await fs.unlink(tempZipPath);
      } catch {
        /* ignore */
      }
    }
  }
}
