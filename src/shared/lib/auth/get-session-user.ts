import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export async function getSessionUserEmail(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const metaEmail =
    typeof user.user_metadata?.email === "string"
      ? user.user_metadata.email
      : "";
  const email = user.email?.trim() || metaEmail.trim();
  return email || null;
}
