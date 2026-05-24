import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export type AdminSession = {
  userId: string;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
};

export async function requireAdminSession(): Promise<
  { ok: true; session: AdminSession } | { ok: false; status: 401 | 403; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error || profile?.role !== "admin") {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, session: { userId: user.id, supabase } };
}
