"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/shared/lib/supabase/browser";
import { useEffect, useRef, useState } from "react";

export function UserMenu({ email }: { email: string }) {
  const t = useTranslations("nav");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function logout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.replace("/");
    router.refresh();
  }

  const short =
    email.length > 28 ? `${email.slice(0, 14)}…${email.slice(-8)}` : email;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[200px] items-center gap-2 rounded-full border border-union-border bg-white/[0.05] px-3 py-1.5 text-left text-xs text-union-text transition-colors hover:bg-white/[0.08] md:max-w-[260px] md:text-sm"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="truncate font-medium">{short}</span>
        <span className="text-union-muted" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 min-w-[200px] rounded-xl border border-union-border bg-union-surface py-1 shadow-xl backdrop-blur-xl"
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              router.push("/dashboard/settings");
            }}
            className="block w-full px-4 py-2.5 text-left text-sm text-union-text hover:bg-white/[0.06]"
          >
            {t("settings")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void logout()}
            className="block w-full px-4 py-2.5 text-left text-sm text-red-300 hover:bg-white/[0.06]"
          >
            {t("logout")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
