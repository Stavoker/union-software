"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export type ToggleFrozenResult = { ok: true } | { ok: false; error: string };

/**
 * Лише admin. Не дозволяє заморозити власний акаунт (щоб не втратити доступ).
 */
export async function setProfileFrozenState(
  locale: string,
  targetUserId: string,
  frozen: boolean
): Promise<ToggleFrozenResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  const { data: adminRow, error: adminErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (adminErr || adminRow?.role !== "admin") {
    return { ok: false, error: "Forbidden" };
  }

  if (targetUserId === user.id && frozen) {
    return { ok: false, error: "Cannot freeze your own account" };
  }

  const updates = frozen
    ? {
        is_frozen: true,
        account_frozen_at: new Date().toISOString(),
        account_frozen_reason: "admin_panel",
      }
    : {
        is_frozen: false,
        account_frozen_at: null,
        account_frozen_reason: null,
      };

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", targetUserId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/${locale}/dashboard/users`);
  revalidatePath(`/${locale}/dashboard`, "layout");
  return { ok: true };
}
