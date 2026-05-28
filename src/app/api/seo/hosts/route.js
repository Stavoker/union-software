import { NextResponse } from "next/server";
import {
  createUserHost,
  deleteUserHost,
  listActiveHosts,
} from "@/lib/admin-seo/hostsRepository";
import { requireSeoSession } from "@/lib/admin-seo/seoApiAuth";

export async function GET() {
  try {
    const session = await requireSeoSession();
    if (session.errorResponse) return session.errorResponse;

    const hosts = await listActiveHosts(session.userId);
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

/** Додати SSH-хост для поточного користувача. */
export async function POST(request) {
  try {
    const session = await requireSeoSession();
    if (session.errorResponse) return session.errorResponse;

    const body = await request.json().catch(() => ({}));
    const host = await createUserHost(session.userId, {
      name: body?.name,
      hostIp: body?.hostIp ?? body?.host_ip,
      sshUser: body?.sshUser ?? body?.ssh_user,
      sshPassword: body?.sshPassword ?? body?.ssh_password,
      sshPort: body?.sshPort ?? body?.ssh_port,
    });

    return NextResponse.json({ ok: true, host });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to save host",
        details: error?.message || "Unknown error",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request) {
  try {
    const session = await requireSeoSession();
    if (session.errorResponse) return session.errorResponse;

    const body = await request.json().catch(() => ({}));
    const url = new URL(request.url);
    const hostId = String(body?.id || body?.hostId || url.searchParams.get("id") || "").trim();
    if (!hostId) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }

    await deleteUserHost(session.userId, hostId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to delete host",
        details: error?.message || "Unknown error",
      },
      { status: 400 }
    );
  }
}
