import {
  loadActiveGeneratorThemes,
  loadGeneratorBrandForUser,
} from "@/lib/generator-brand-kit";
import { GeneratorWorkbench } from "@/shared/components/generator/generator-workbench";
import { getSessionUser } from "@/shared/lib/auth/get-session-user";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GeneratorPage() {
  const user = await getSessionUser();
  let themePresets: { value: string; pageCount?: 3 | 4 }[] = [];
  let defaultTheme = "";

  if (user?.id) {
    const supabase = await createSupabaseServerClient();
    try {
      const brand = await loadGeneratorBrandForUser(supabase, user.id);
      defaultTheme = brand?.defaultThemeText?.trim() || "";
    } catch {
      /* ignore */
    }
    try {
      const themes = await loadActiveGeneratorThemes(supabase, user.id);
      themePresets = themes.flatMap((row) => {
        const value = String(row.theme_text || "").trim();
        if (!value) return [];
        const pc = row.page_count;
        return [
          {
            value,
            pageCount: pc === 3 || pc === 4 ? (pc as 3 | 4) : undefined,
          },
        ];
      });
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="py-10">
      <div className="mx-auto max-w-6xl">
        <GeneratorWorkbench themePresets={themePresets} defaultTheme={defaultTheme} />
      </div>
    </div>
  );
}
