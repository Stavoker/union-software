import { NextResponse } from "next/server";
import { createLinkCodeForUser } from "@/lib/telegram/telegramLinkCodes";
import { getActiveChatIdsForUser } from "@/lib/telegram/telegramSubscribersRepository";
import { getSessionUser } from "@/shared/lib/auth/get-session-user";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const chats = await getActiveChatIdsForUser(user.id);
    return NextResponse.json({
      ok: true,
      linked: chats.length > 0,
      chatCount: chats.length,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to load Telegram status" },
      { status: 500 }
    );
  }
}

export async function POST() {
  const user = await getSessionUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { code, expiresAt, expiresInSec } = await createLinkCodeForUser(user.id);
    return NextResponse.json({
      ok: true,
      code,
      expiresAt,
      expiresInSec,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to create link code" },
      { status: 500 }
    );
  }
}
