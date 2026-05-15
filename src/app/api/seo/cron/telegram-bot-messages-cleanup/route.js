import { NextResponse } from "next/server";
import { cleanupTelegramBotMessages } from "@/lib/admin-seo/telegramBotMessages";

export const dynamic = "force-dynamic";

function cronAuthorized(request) {
  const secret = String(process.env.CRON_SECRET || process.env.TELEGRAM_BOT_CLEANUP_CRON_SECRET || "").trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const xh = request.headers.get("x-cron-secret") || "";
  return bearer === secret || xh === secret;
}

export async function GET(request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await cleanupTelegramBotMessages();
    const status = result.ok ? 200 : 422;
    return NextResponse.json(result, { status });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(request) {
  return GET(request);
}
