import { NextResponse } from "next/server";
import { listActiveHosts } from "@/lib/admin-seo/hostsRepository";

export async function GET() {
  try {
    const hosts = await listActiveHosts();
    return NextResponse.json({ ok: true, hosts });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load hosts",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
