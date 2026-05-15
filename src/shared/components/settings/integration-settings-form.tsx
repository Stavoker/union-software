// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { getPublicIntegrationDefinitions } from "@/lib/account-integration-settings";
import { seoBtnPrimary, seoCard, seoInput } from "@/shared/components/seo/seo-ui";

const SECTION_ORDER = [
  "generator",
  "spaceship",
  "zomro",
  "ssl",
  "host",
  "seo",
  "telegram",
  "autoscript",
];
const STATIC_DEFINITIONS = getPublicIntegrationDefinitions();

async function readJsonSafe(response) {
  const text = await response.text();
  if (!text?.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export function IntegrationSettingsForm() {
  const t = useTranslations("integrationSettings");
  const [definitions, setDefinitions] = useState(STATIC_DEFINITIONS);
  const [fields, setFields] = useState({});
  const [configured, setConfigured] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [dbReady, setDbReady] = useState(true);

  const bySection = useMemo(() => {
    const map = new Map();
    for (const def of definitions) {
      const list = map.get(def.section) || [];
      list.push(def);
      map.set(def.section, list);
    }
    return map;
  }, [definitions]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch("/api/settings/integration", { cache: "no-store" })
      .then((r) => readJsonSafe(r).then((payload) => ({ ok: r.ok, payload })))
      .then(({ ok, payload }) => {
        if (!mounted) return;
        if (!ok || !payload?.ok) {
          throw new Error(payload?.details || payload?.error || "Load failed");
        }
        setDefinitions(
          Array.isArray(payload.definitions) && payload.definitions.length
            ? payload.definitions
            : STATIC_DEFINITIONS
        );
        setFields(payload.fields && typeof payload.fields === "object" ? payload.fields : {});
        setConfigured(payload.configured && typeof payload.configured === "object" ? payload.configured : {});
        setDbReady(payload.dbReady !== false);
        if (payload.dbReady === false) {
          setStatus(t("dbMigrationRequired"));
        }
      })
      .catch((e) => {
        if (!mounted) return;
        setDefinitions(STATIC_DEFINITIONS);
        setDbReady(false);
        setStatus(t("loadError", { message: e.message }));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [t]);

  function updateField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch("/api/settings/integration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      const payload = await readJsonSafe(response);
      if (!response.ok || !payload?.ok) {
        if (payload?.dbReady === false) {
          setDbReady(false);
          throw new Error(t("dbMigrationRequired"));
        }
        throw new Error(payload?.details || payload?.error || "Save failed");
      }
      setDbReady(payload.dbReady !== false);
      setFields(payload.fields || {});
      setConfigured(payload.configured || {});
      setStatus(t("saved"));
    } catch (e) {
      setStatus(t("saveError", { message: e.message }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`${seoCard} space-y-6`}>
      <header className="space-y-2">
        <h2 className="text-lg font-semibold text-union-text">{t("title")}</h2>
        <p className="max-w-3xl text-sm text-union-muted">{t("lead")}</p>
      </header>

      {!dbReady ? (
        <div
          className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95"
          role="alert"
        >
          {t("dbMigrationRequired")}
          <code className="mt-2 block text-xs text-amber-200/90">
            supabase/migrations/20260516140000_account_integration_settings_env_columns.sql
          </code>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-union-muted">{t("loading")}</p>
      ) : (
        <form className="space-y-8" onSubmit={handleSubmit}>
          {SECTION_ORDER.map((section) => {
            const defs = bySection.get(section);
            if (!defs?.length) return null;
            return (
              <div key={section} className="space-y-4">
                <h3 className="text-sm font-medium text-union-text">{t(`sections.${section}`)}</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {defs.map((def) => (
                    <div key={def.key} className="space-y-1.5">
                      <label className="block space-y-0.5" htmlFor={`int-${def.key}`}>
                        <span className="font-mono text-[11px] font-medium tracking-tight text-union-text">
                          {def.key}
                        </span>
                        <span className="block text-xs font-normal text-union-muted">
                          {def.hint || t(`fields.${def.key}`)}
                        </span>
                        {def.secret && configured[def.key] ? (
                          <span className="text-xs font-normal text-[#d1fe17]">({t("configured")})</span>
                        ) : null}
                      </label>
                      {def.kind === "bool" ? (
                        <select
                          id={`int-${def.key}`}
                          className={seoInput}
                          value={fields[def.key] ?? ""}
                          onChange={(e) => updateField(def.key, e.target.value)}
                          disabled={saving}
                        >
                          <option value="">{t("boolUnset")}</option>
                          <option value="1">{t("boolOn")}</option>
                          <option value="0">{t("boolOff")}</option>
                        </select>
                      ) : (
                        <input
                          id={`int-${def.key}`}
                          type={def.secret ? "password" : "text"}
                          className={seoInput}
                          value={fields[def.key] ?? ""}
                          onChange={(e) => updateField(def.key, e.target.value)}
                          placeholder={def.secret ? t("secretPlaceholder") : t("valuePlaceholder")}
                          disabled={saving}
                          autoComplete="off"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={seoBtnPrimary} disabled={saving || !dbReady}>
              {saving ? t("saving") : t("save")}
            </button>
          </div>
        </form>
      )}

      {status ? <p className="text-sm text-union-muted">{status}</p> : null}
    </section>
  );
}
