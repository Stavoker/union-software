"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/shared/lib/supabase/browser";

export function LoginForm() {
  const t = useTranslations("login");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signErr) {
        setError(signErr.message);
        setPending(false);
        return;
      }
      router.replace("/dashboard/users");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      onSubmit={onSubmit}
      className="flex w-full flex-col gap-5"
    >
      <label className="flex flex-col gap-2 text-sm">
        <span className="text-union-muted">{t("email")}</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-xl border border-union-border bg-union-surface/80 px-4 py-3 text-union-text outline-none ring-union-ring transition-[box-shadow,border-color] placeholder:text-union-muted focus:border-union-accent/40 focus:ring-2"
          placeholder="you@company.com"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm">
        <span className="text-union-muted">{t("password")}</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-xl border border-union-border bg-union-surface/80 px-4 py-3 text-union-text outline-none ring-union-ring transition-[box-shadow,border-color] placeholder:text-union-muted focus:border-union-accent/40 focus:ring-2"
        />
      </label>
      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex h-12 items-center justify-center rounded-xl bg-union-accent px-4 text-sm font-semibold text-union-accent-fg transition-[transform,opacity] hover:brightness-95 active:scale-[0.99] disabled:opacity-60"
      >
        {pending ? "…" : t("submit")}
      </button>
    </motion.form>
  );
}
