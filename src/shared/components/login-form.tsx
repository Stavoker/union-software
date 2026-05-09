"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";

export function LoginForm() {
  const t = useTranslations("login");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    /* Supabase Auth wiring comes next — placeholder UX */
    await new Promise((r) => setTimeout(r, 400));
    setPending(false);
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
