export type LayoutVariant = "auto" | "sidebar-left" | "top-nav";

export function normalizeLayoutVariant(raw: string | null | undefined): LayoutVariant {
  const v = String(raw || "auto").trim();
  if (v === "sidebar-left" || v === "top-nav") return v;
  return "auto";
}
