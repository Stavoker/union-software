// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { seoBtnLimeOutline, seoCard } from "@/shared/components/seo/seo-ui";
import { UnionStatusToast } from "@/shared/components/ui/union-status-toast";

async function readJsonSafe(response) {
  const text = await response.text();
  if (!text?.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function formatCountdown(totalSec) {
  const sec = Math.max(0, Math.trunc(Number(totalSec) || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TelegramConnectPanel() {
  const t = useTranslations("integrationSettings.telegram");
  const [linked, setLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [remainingSec, setRemainingSec] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState({ message: "", lime: true });

  async function loadStatus() {
    const response = await fetch("/api/settings/telegram");
    const payload = await readJsonSafe(response);
    if (response.ok && payload?.ok) {
      setLinked(!!payload.linked);
    }
  }

  useEffect(() => {
    loadStatus()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!expiresAt) {
      setRemainingSec(0);
      return;
    }

    const tick = () => {
      const left = Math.max(
        0,
        Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
      );
      setRemainingSec(left);
      if (left <= 0) {
        setCode("");
        setExpiresAt("");
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  async function generateCode() {
    setGenerating(true);
    setToast({ message: "", lime: true });
    try {
      const response = await fetch("/api/settings/telegram", { method: "POST" });
      const payload = await readJsonSafe(response);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || t("codeFailed"));
      }
      setCode(String(payload.code || ""));
      setExpiresAt(String(payload.expiresAt || ""));
      setToast({ message: t("codeReady"), lime: true });
    } catch (e) {
      setToast({ message: String(e?.message || t("codeFailed")), lime: true });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <UnionStatusToast
        message={toast.message}
        variant={toast.lime ? "lime" : "muted"}
        onDismiss={() => setToast({ message: "", lime: true })}
        dismissLabel={t("toastDismiss")}
      />
      <section className={`${seoCard} space-y-4`}>
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-union-text">{t("title")}</h2>
          <p className="text-xs text-union-muted">{t("hint")}</p>
        </div>
        {loading ? (
          <p className="text-sm text-union-muted">{t("loading")}</p>
        ) : linked ? (
          <p className="text-sm text-[#d1fe17]">{t("linked")}</p>
        ) : (
          <p className="text-sm text-union-muted">{t("notLinked")}</p>
        )}
        <ol className="list-decimal space-y-1 pl-5 text-xs text-union-muted">
          <li>{t("step1")}</li>
          <li>{t("step2")}</li>
          <li>{t("step3")}</li>
        </ol>
        {code ? (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-[#d1fe17]/40 bg-[#d1fe17]/10 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs text-union-muted">{t("yourCode")}</p>
              <p className="font-mono text-2xl font-semibold tracking-widest text-[#d1fe17]">
                {code}
              </p>
            </div>
            <p
              className="shrink-0 font-mono text-4xl font-semibold tabular-nums leading-none text-[#d1fe17] sm:text-5xl"
              aria-live="polite"
              aria-label={formatCountdown(remainingSec)}
            >
              {formatCountdown(remainingSec)}
            </p>
          </div>
        ) : null}
        <button
          type="button"
          className={seoBtnLimeOutline}
          onClick={() => generateCode()}
          disabled={generating}
        >
          {generating ? t("generating") : t("getCode")}
        </button>
      </section>
    </>
  );
}
