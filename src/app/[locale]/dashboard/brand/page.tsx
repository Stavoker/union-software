import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  loadGeneratorBrandForUser,
  normalizePaletteCore,
} from "@/lib/generator-brand-kit";
import { BrandAdminEditor } from "@/app/[locale]/dashboard/users/[userId]/brand/brand-admin-editor";
import { normalizeLayoutVariant } from "@/app/[locale]/dashboard/users/[userId]/brand/brand-types";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function UserBrandPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await getTranslations("generatorBrand");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, display_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "admin") {
    redirect(`/${locale}/dashboard/users`);
  }

  let brand = null;
  try {
    brand = await loadGeneratorBrandForUser(supabase, user.id);
  } catch {
    brand = null;
  }

  const { data: themes } = await supabase
    .from("generator_themes")
    .select("id, title, theme_text, page_count, sort_order, seo_keywords")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  const initialBrand = brand
    ? {
        brandName: brand.brandName,
        notes: brand.notes,
        geo: brand.geo || "",
        defaultThemeText: brand.defaultThemeText,
        promptOverlay: brand.promptOverlay,
        layoutVariant: normalizeLayoutVariant(brand.layoutVariant),
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
    seoKeywords: String(t.seo_keywords || ""),
    pageCount: t.page_count === 3 || t.page_count === 4 ? t.page_count : ("" as const),
    sortOrder: t.sort_order ?? 0,
  }));

  const displayName = profile?.email || profile?.display_name || user.email || user.id;

  return (
    <div className="min-h-full py-10">
      <div className="mx-auto max-w-3xl">
        <BrandAdminEditor
          userId={user.id}
          userEmail={displayName}
          initialBrand={initialBrand}
          initialThemes={initialThemes}
          apiMode="user"
        />
      </div>
    </div>
  );
}
