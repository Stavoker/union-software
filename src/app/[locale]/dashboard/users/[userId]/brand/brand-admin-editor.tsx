"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { normalizePaletteCore } from "@/lib/generator-brand-palette";
import { seoBtnPrimary, seoCard, seoInput } from "@/shared/components/seo/seo-ui";

import { normalizeLayoutVariant, type LayoutVariant } from "./brand-types";

type Palette = {
  accent: string;
  bg: string;
  text: string;
};

type Asset = {
  id: string;
  kind: string;
  storagePath: string;
  fileName: string;
};

type ThemeRow = {
  id?: string;
  title: string;
  themeText: string;
  pageCount: number | "";
  sortOrder: number;
};

type BrandState = {
  brandName: string;
  notes: string;
  defaultThemeText: string;
  promptOverlay: string;
  seoKeywords: string;
  layoutVariant: LayoutVariant;
  palette: Palette;
  logoStoragePath: string;
  faviconStoragePath: string;
  assets: Asset[];
};

type Props = {
  userId: string;
  userEmail: string;
  initialBrand: BrandState | null;
  initialThemes: ThemeRow[];
};

const PALETTE_FIELDS: { key: keyof Palette; labelKey: "paletteAccent" | "paletteBg" | "paletteText" }[] = [
  { key: "accent", labelKey: "paletteAccent" },
  { key: "bg", labelKey: "paletteBg" },
  { key: "text", labelKey: "paletteText" },
];

const EMPTY_PALETTE: Palette = {
  accent: "#d1fe17",
  bg: "#0f1113",
  text: "#edf0f5",
};

const ASSET_KIND_LABEL_KEYS: Record<string, "kindHero" | "kindGame" | "kindPayment" | "kindMisc"> = {
  hero: "kindHero",
  game: "kindGame",
  payment: "kindPayment",
  misc: "kindMisc",
};

export function BrandAdminEditor({
  userId,
  userEmail,
  initialBrand,
  initialThemes,
}: Props) {
  const t = useTranslations("generatorBrand");

  const [brand, setBrand] = useState<BrandState>(
    initialBrand || {
      brandName: "",
      notes: "",
      defaultThemeText: "",
      promptOverlay: "",
      seoKeywords: "",
      layoutVariant: "auto",
      palette: { ...EMPTY_PALETTE },
      logoStoragePath: "",
      faviconStoragePath: "",
      assets: [],
    }
  );
  const [themes, setThemes] = useState<ThemeRow[]>(initialThemes);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const save = useCallback(async () => {
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch(`/api/admin/generator-brand/${userId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: brand.brandName,
          notes: brand.notes,
          defaultThemeText: brand.defaultThemeText,
          promptOverlay: brand.promptOverlay,
          seoKeywords: brand.seoKeywords,
          layoutVariant: brand.layoutVariant,
          palette: brand.palette,
          logoStoragePath: brand.logoStoragePath || null,
          faviconStoragePath: brand.faviconStoragePath || null,
          themes: themes.map((th, i) => ({
            title: th.title,
            themeText: th.themeText,
            pageCount: th.pageCount === 3 || th.pageCount === 4 ? th.pageCount : null,
            sortOrder: i,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || t("saveError"));
      if (data.brand) {
        setBrand({
          brandName: data.brand.brandName || "",
          notes: data.brand.notes || "",
          defaultThemeText: data.brand.defaultThemeText || "",
          promptOverlay: data.brand.promptOverlay || "",
          seoKeywords: data.brand.seoKeywords || "",
          layoutVariant: normalizeLayoutVariant(data.brand.layoutVariant),
          palette: normalizePaletteCore(data.brand.palette),
          logoStoragePath: data.brand.logoStoragePath || "",
          faviconStoragePath: data.brand.faviconStoragePath || "",
          assets: data.brand.assets || [],
        });
      }
      setStatus(t("saved"));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }, [brand, themes, t, userId]);

  async function uploadFile(file: File, kind: string, slot?: string) {
    setUploading(true);
    setStatus("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      if (slot) fd.append("slot", slot);
      const res = await fetch(`/api/admin/generator-brand/${userId}/upload`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || t("uploadError"));

      if (slot === "logo") {
        setBrand((b) => ({ ...b, logoStoragePath: data.storagePath }));
      } else if (slot === "favicon") {
        setBrand((b) => ({ ...b, faviconStoragePath: data.storagePath }));
      } else if (data.asset) {
        setBrand((b) => ({
          ...b,
          assets: [
            ...b.assets,
            {
              id: data.asset.id,
              kind: data.asset.kind,
              storagePath: data.asset.storage_path,
              fileName: data.asset.file_name,
            },
          ],
        }));
      }
      setStatus(t("uploaded"));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : t("uploadError"));
    } finally {
      setUploading(false);
    }
  }

  async function deleteAsset(assetId: string) {
    setStatus("");
    const res = await fetch(
      `/api/admin/generator-brand/${userId}?assetId=${encodeURIComponent(assetId)}`,
      { method: "DELETE", credentials: "include" }
    );
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setStatus(data.error || t("deleteError"));
      return;
    }
    setBrand((b) => ({ ...b, assets: b.assets.filter((a) => a.id !== assetId) }));
  }

  function setPaletteField(key: keyof Palette, value: string) {
    setBrand((b) => ({ ...b, palette: { ...b.palette, [key]: value } }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/users"
          className="text-sm font-medium text-[#d1fe17] hover:opacity-85"
        >
          ← {t("backUsers")}
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-union-text">{t("title")}</h1>
        <p className="mt-1 text-sm text-union-muted">
          {userEmail} · <span className="font-mono text-xs">{userId}</span>
        </p>
      </div>

      <section className={`${seoCard} space-y-4`}>
        <h2 className="text-base font-semibold text-union-text">{t("sectionBrand")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs text-union-muted">{t("brandName")}</span>
            <input
              className={seoInput}
              value={brand.brandName}
              onChange={(e) => setBrand((b) => ({ ...b, brandName: e.target.value }))}
            />
          </label>
          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs text-union-muted">{t("defaultTheme")}</span>
            <input
              className={seoInput}
              value={brand.defaultThemeText}
              onChange={(e) => setBrand((b) => ({ ...b, defaultThemeText: e.target.value }))}
            />
          </label>
          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs text-union-muted">{t("promptOverlay")}</span>
            <textarea
              className={`${seoInput} min-h-[100px]`}
              value={brand.promptOverlay}
              onChange={(e) => setBrand((b) => ({ ...b, promptOverlay: e.target.value }))}
            />
          </label>
          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs text-union-muted">{t("seoKeywords")}</span>
            <textarea
              className={`${seoInput} min-h-[80px]`}
              value={brand.seoKeywords}
              onChange={(e) => setBrand((b) => ({ ...b, seoKeywords: e.target.value }))}
              placeholder={t("seoKeywordsPlaceholder")}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-union-muted">{t("layoutVariant")}</span>
            <select
              className={seoInput}
              value={brand.layoutVariant}
              onChange={(e) =>
                setBrand((b) => ({
                  ...b,
                  layoutVariant: e.target.value as LayoutVariant,
                }))
              }
            >
              <option value="auto">{t("layoutAuto")}</option>
              <option value="sidebar-left">{t("layoutSidebar")}</option>
              <option value="top-nav">{t("layoutTopNav")}</option>
            </select>
          </label>
          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs text-union-muted">{t("notes")}</span>
            <textarea
              className={`${seoInput} min-h-[72px]`}
              value={brand.notes}
              onChange={(e) => setBrand((b) => ({ ...b, notes: e.target.value }))}
            />
          </label>
        </div>
      </section>

      <section className={`${seoCard} space-y-4`}>
        <h2 className="text-base font-semibold text-union-text">{t("sectionPalette")}</h2>
        <p className="text-xs text-union-muted">{t("paletteHint")}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {PALETTE_FIELDS.map(({ key, labelKey }) => (
            <label key={key} className="block space-y-1">
              <span className="text-xs text-union-muted">{t(labelKey)}</span>
              <input
                className={seoInput}
                value={brand.palette[key]}
                onChange={(e) => setPaletteField(key, e.target.value)}
                placeholder="#d1fe17"
              />
            </label>
          ))}
        </div>
      </section>

      <section className={`${seoCard} space-y-4`}>
        <h2 className="text-base font-semibold text-union-text">{t("sectionAssets")}</h2>
        <p className="text-xs text-union-muted">{t("assetsHint")}</p>
        <div className="flex flex-wrap gap-3">
          <label className="cursor-pointer rounded-lg border border-union-border px-3 py-2 text-sm text-union-text hover:border-[#d1fe17]/40">
            {t("uploadLogo")}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadFile(f, "logo", "logo");
                e.target.value = "";
              }}
            />
          </label>
          <label className="cursor-pointer rounded-lg border border-union-border px-3 py-2 text-sm text-union-text hover:border-[#d1fe17]/40">
            {t("uploadFavicon")}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadFile(f, "favicon", "favicon");
                e.target.value = "";
              }}
            />
          </label>
          <label className="cursor-pointer rounded-lg border border-union-border px-3 py-2 text-sm text-union-text hover:border-[#d1fe17]/40">
            {t("uploadBanner")}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const files = e.target.files;
                if (!files?.length) return;
                void (async () => {
                  for (const f of Array.from(files)) {
                    await uploadFile(f, "hero");
                  }
                })();
                e.target.value = "";
              }}
            />
          </label>
          <label className="cursor-pointer rounded-lg border border-union-border px-3 py-2 text-sm text-union-text hover:border-[#d1fe17]/40">
            {t("uploadSlot")}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const files = e.target.files;
                if (!files?.length) return;
                void (async () => {
                  for (const f of Array.from(files)) {
                    await uploadFile(f, "game");
                  }
                })();
                e.target.value = "";
              }}
            />
          </label>
          <label className="cursor-pointer rounded-lg border border-union-border px-3 py-2 text-sm text-union-text hover:border-[#d1fe17]/40">
            {t("uploadPayment")}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const files = e.target.files;
                if (!files?.length) return;
                void (async () => {
                  for (const f of Array.from(files)) {
                    await uploadFile(f, "payment");
                  }
                })();
                e.target.value = "";
              }}
            />
          </label>
          <label className="cursor-pointer rounded-lg border border-dashed border-union-border px-3 py-2 text-sm text-union-muted hover:border-[#d1fe17]/40">
            {t("uploadMisc")}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const files = e.target.files;
                if (!files?.length) return;
                void (async () => {
                  for (const f of Array.from(files)) {
                    await uploadFile(f, "misc");
                  }
                })();
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {brand.logoStoragePath ? (
          <p className="font-mono text-xs text-union-muted">logo: {brand.logoStoragePath}</p>
        ) : null}
        {brand.faviconStoragePath ? (
          <p className="font-mono text-xs text-union-muted">favicon: {brand.faviconStoragePath}</p>
        ) : null}
        {brand.assets.length > 0 ? (
          <ul className="space-y-2">
            {brand.assets.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-union-border px-3 py-2 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded-md bg-union-border/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#d1fe17]">
                    {t(ASSET_KIND_LABEL_KEYS[a.kind] || "kindMisc")}
                  </span>
                  <span className="min-w-0 truncate font-mono text-xs text-union-muted">
                    {a.fileName}
                  </span>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-xs text-red-300 hover:text-red-200"
                  onClick={() => void deleteAsset(a.id)}
                >
                  {t("deleteAsset")}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-union-muted">{t("noAssets")}</p>
        )}
      </section>

      <section className={`${seoCard} space-y-4`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-union-text">{t("sectionThemes")}</h2>
          <button
            type="button"
            className="text-sm text-[#d1fe17]"
            onClick={() =>
              setThemes((list) => [
                ...list,
                { title: "", themeText: "", pageCount: "", sortOrder: list.length },
              ])
            }
          >
            + {t("addTheme")}
          </button>
        </div>
        {themes.length === 0 ? (
          <p className="text-sm text-union-muted">{t("noThemes")}</p>
        ) : (
          <div className="space-y-4">
            {themes.map((th, index) => (
              <div
                key={index}
                className="space-y-2 rounded-xl border border-union-border p-4"
              >
                <input
                  className={seoInput}
                  placeholder={t("themeTitlePlaceholder")}
                  value={th.title}
                  onChange={(e) =>
                    setThemes((list) =>
                      list.map((row, i) =>
                        i === index ? { ...row, title: e.target.value } : row
                      )
                    )
                  }
                />
                <textarea
                  className={`${seoInput} min-h-[72px]`}
                  placeholder={t("themeTextPlaceholder")}
                  value={th.themeText}
                  onChange={(e) =>
                    setThemes((list) =>
                      list.map((row, i) =>
                        i === index ? { ...row, themeText: e.target.value } : row
                      )
                    )
                  }
                />
                <select
                  className={seoInput}
                  value={th.pageCount === "" ? "" : String(th.pageCount)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setThemes((list) =>
                      list.map((row, i) =>
                        i === index
                          ? { ...row, pageCount: v === "" ? "" : (Number(v) as 3 | 4) }
                          : row
                      )
                    );
                  }}
                >
                  <option value="">{t("pageCountDefault")}</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={seoBtnPrimary} disabled={saving} onClick={() => void save()}>
          {saving ? t("saving") : t("save")}
        </button>
        {status ? <p className="text-sm text-union-muted">{status}</p> : null}
      </div>
    </div>
  );
}
