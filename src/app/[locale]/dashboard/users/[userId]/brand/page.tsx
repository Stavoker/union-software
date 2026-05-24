import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  loadGeneratorBrandForUser,
  normalizePaletteCore,
} from "@/lib/generator-brand-kit";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

import { BrandAdminEditor } from "./brand-admin-editor";

export const dynamic = "force-dynamic";

export default async function UserBrandAdminPage({
  params,
}: {
  params: Promise<{ locale: string; userId: string }>;
}) {
  const { locale, userId } = await params;
  await getTranslations("generatorBrand");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}`);

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.role !== "admin") redirect(`/${locale}/dashboard`);

  const { data: target } = await supabase
    .from("profiles")
    .select("email, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (!target) redirect(`/${locale}/dashboard/users`);

  let brand = null;
  try {
    brand = await loadGeneratorBrandForUser(supabase, userId);
  } catch {
    brand = null;
  }

  const { data: themes } = await supabase
    .from("generator_themes")
    .select("id, title, theme_text, page_count, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  const initialBrand = brand
    ? {
        brandName: brand.brandName,
        notes: brand.notes,
        defaultThemeText: brand.defaultThemeText,
        promptOverlay: brand.promptOverlay,
        palette: normalizePaletteCore(brand.palette),
        logoStoragePath: brand.logoStoragePath,
        faviconStoragePath: brand.faviconStoragePath,
        assets: brand.assets,
      }
    : null;

  const initialThemes = (themes || []).map((t) => ({
    id: t.id,
    title: t.title,
    themeText: t.theme_text,
    pageCount: t.page_count === 3 || t.page_count === 4 ? t.page_count : ("" as const),
    sortOrder: t.sort_order ?? 0,
  }));

  return (
    <div className="min-h-full py-10">
      <div className="mx-auto max-w-3xl">
        <BrandAdminEditor
          userId={userId}
          userEmail={target.email || target.display_name || userId}
          initialBrand={initialBrand}
          initialThemes={initialThemes}
        />
      </div>
    </div>
  );
}
