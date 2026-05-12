import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Акаунт заморожено, якщо profiles.is_frozen = true.
 */
export async function isAccountFrozen(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("is_frozen")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return Boolean(data.is_frozen);
}
