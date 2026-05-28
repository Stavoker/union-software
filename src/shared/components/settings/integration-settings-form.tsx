// @ts-nocheck
"use client";

import { Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { getPublicIntegrationDefinitions } from "@/lib/account-integration-settings";
import {
  isAcceptableClaudeApiKey,
  normalizeClaudeApiKeyInput,
} from "@/lib/generator-llm-endpoint";
import { seoBtnPrimary, seoCard } from "@/shared/components/seo/seo-ui";
import { UnionStatusToast } from "@/shared/components/ui/union-status-toast";

const SECTION_ORDER = [
  "generator",
  "spaceship",
  "zomro",
  "ssl",
  "host",
  "seo",
  "autoscript",
];
const STATIC_DEFINITIONS = getPublicIntegrationDefinitions();

const inputShell =
  "flex overflow-hidden rounded-xl border border-union-border bg-union-bg/80 ring-union-ring focus-within:ring-2";
const inputInner =
  "min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm text-union-text outline-none placeholder:text-union-muted read-only:cursor-default read-only:text-union-text/90";
const editBtn =
  "shrink-0 cursor-pointer border-l border-black/10 bg-[#d1fe17] px-3 py-2 text-black transition-[opacity,filter] hover:opacity-90 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40";

async function readJsonSafe(response) {
  const text = await response.text();
  if (!text?.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** Опис поля з next-intl; fallback — лише якщо ключ ще не додано в messages. */
function translateFieldHint(def, t) {
  const key = `fields.${def.key}`;
  if (typeof t.has === "function" && t.has(key)) {
    return t(key);
  }
  return def.hint || def.key;
}

function hydrateFromPayload(payload) {
  return {
    storedPreview:
      payload?.storedPreview && typeof payload.storedPreview === "object"
        ? payload.storedPreview
        : {},
    fields: {},
    editingKeys: new Set(),
  };
}

function IntegrationFieldInput({
  def,
  fields,
  storedPreview,
  saving,
  editingKeys,
  onToggleEdit,
  onChange,
  t,
}) {
  const stored = storedPreview[def.key] || "";
  const hasStored = !!stored;
  const isEditing = editingKeys.has(def.key);

  if (def.kind === "bool") {
    if (hasStored && !isEditing) {
      const label =
        stored === "1" ? t("boolOn") : stored === "0" ? t("boolOff") : stored;
      return (
        <div className={inputShell}>
          <input
            id={`int-${def.key}`}
            type="text"
            className={inputInner}
            value={label}
            readOnly
            disabled={saving}
            aria-readonly="true"
          />
          <button
            type="button"
            className={editBtn}
            disabled={saving}
            onClick={() => onToggleEdit(def.key, def)}
            aria-label={t("editStoredValue")}
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
        </div>
      );
    }
    return (
      <select
        id={`int-${def.key}`}
        className="w-full rounded-xl border border-union-border bg-union-bg/80 px-3 py-2 text-sm text-union-text outline-none ring-union-ring focus:ring-2 disabled:opacity-50"
        value={fields[def.key] ?? stored ?? ""}
        onChange={(e) => onChange(def.key, e.target.value)}
        disabled={saving}
      >
        <option value="">{t("boolUnset")}</option>
        <option value="1">{t("boolOn")}</option>
        <option value="0">{t("boolOff")}</option>
      </select>
    );
  }

  if (hasStored && !isEditing) {
    return (
      <div className={inputShell}>
        <input
          id={`int-${def.key}`}
          type="text"
          className={inputInner}
          value={stored}
          readOnly
          disabled={saving}
          autoComplete="off"
          aria-readonly="true"
        />
        <button
          type="button"
          className={editBtn}
          disabled={saving}
          onClick={() => onToggleEdit(def.key, def)}
          aria-label={t("editStoredValue")}
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  const displayValue = isEditing ? (fields[def.key] ?? "") : stored || fields[def.key] || "";
  const placeholder = def.secret
    ? t("secretPlaceholder")
    : hasStored
      ? t("valuePlaceholder")
      : t("notStoredPlaceholder");

  if (hasStored && isEditing) {
    return (
      <div className={inputShell}>
        <input
          id={`int-${def.key}`}
          type={def.secret ? "password" : "text"}
          className={inputInner}
          value={displayValue}
          onChange={(e) => onChange(def.key, e.target.value)}
          placeholder={placeholder}
          disabled={saving}
          autoComplete="off"
        />
        <button
          type="button"
          className={editBtn}
          disabled={saving}
          onClick={() => onToggleEdit(def.key, def)}
          aria-label={t("editCancel")}
          aria-pressed
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <input
      id={`int-${def.key}`}
      type={def.secret ? "password" : "text"}
      className="w-full rounded-xl border border-union-border bg-union-bg/80 px-3 py-2 text-sm text-union-text outline-none ring-union-ring placeholder:text-union-muted focus:ring-2 disabled:opacity-50"
      value={displayValue}
      onChange={(e) => onChange(def.key, e.target.value)}
      placeholder={placeholder}
      disabled={saving}
      autoComplete="off"
    />
  );
}

export function IntegrationSettingsForm() {
  const t = useTranslations("integrationSettings");
  const [definitions, setDefinitions] = useState(STATIC_DEFINITIONS);
  const [fields, setFields] = useState({});
  const [storedPreview, setStoredPreview] = useState({});
  const [editingKeys, setEditingKeys] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ message: "", lime: true });
  const [inlineError, setInlineError] = useState("");
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
        const hydrated = hydrateFromPayload(payload);
        setStoredPreview(hydrated.storedPreview);
        setFields(hydrated.fields);
        setEditingKeys(hydrated.editingKeys);
        setDbReady(payload.dbReady !== false);
        if (payload.dbReady === false) {
          setInlineError(t("dbMigrationRequired"));
        }
      })
      .catch((e) => {
        if (!mounted) return;
        setDefinitions(STATIC_DEFINITIONS);
        setDbReady(false);
        setInlineError(t("loadError", { message: e.message }));
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

  function toggleFieldEdit(key, def) {
    setEditingKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setFields((f) => {
          const copy = { ...f };
          delete copy[key];
          return copy;
        });
      } else {
        next.add(key);
        setFields((f) => ({
          ...f,
          [key]: def.secret ? "" : String(storedPreview[key] || ""),
        }));
      }
      return next;
    });
  }

  function buildSavePatch() {
    const patch = {};
    for (const def of definitions) {
      if (!Object.prototype.hasOwnProperty.call(fields, def.key)) continue;
      const v = fields[def.key];
      if (v === undefined || v === null) continue;
      patch[def.key] = v;
    }
    return patch;
  }

  function validateClaudeKeysBeforeSave(patch) {
    const baseUrl =
      patch.ANTHROPIC_BASE_URL ??
      storedPreview.ANTHROPIC_BASE_URL ??
      fields.ANTHROPIC_BASE_URL ??
      "";
    for (const def of definitions) {
      if (!/^CLAUDE_API_KEY_\d+$/i.test(def.key)) continue;
      if (!Object.prototype.hasOwnProperty.call(patch, def.key)) continue;
      const raw = patch[def.key];
      if (!String(raw || "").trim()) continue;
      const normalized = normalizeClaudeApiKeyInput(raw);
      if (!isAcceptableClaudeApiKey(normalized, baseUrl)) {
        return def.key;
      }
    }
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setToast({ message: "", lime: true });
    setInlineError("");
    const patch = buildSavePatch();
    const badKey = validateClaudeKeysBeforeSave(patch);
    if (badKey) {
      setSaving(false);
      setToast({ message: t("invalidClaudeKey", { key: badKey }), lime: true });
      return;
    }
    try {
      const response = await fetch("/api/settings/integration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: patch }),
      });
      const payload = await readJsonSafe(response);
      if (!response.ok || !payload?.ok) {
        if (payload?.dbReady === false) {
          setDbReady(false);
          throw new Error(t("dbMigrationRequired"));
        }
        if (payload?.error === "invalid_claude_key") {
          throw new Error(
            t("invalidClaudeKey", { key: payload.envKey || "CLAUDE_API_KEY_01" })
          );
        }
        throw new Error(payload?.details || payload?.error || "Save failed");
      }
      setDbReady(payload.dbReady !== false);
      const hydrated = hydrateFromPayload(payload);
      setStoredPreview(hydrated.storedPreview);
      setFields(hydrated.fields);
      setEditingKeys(hydrated.editingKeys);
      setToast({ message: t("saved"), lime: true });
    } catch (e) {
      setToast({
        message: t("saveError", { message: e.message }),
        lime: true,
      });
    } finally {
      setSaving(false);
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

      <section className={`${seoCard} space-y-6`}>
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

        {inlineError ? (
          <p className="text-sm text-red-200/90" role="alert">
            {inlineError}
          </p>
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
                            {translateFieldHint(def, t)}
                          </span>
                        </label>
                        <IntegrationFieldInput
                          def={def}
                          fields={fields}
                          storedPreview={storedPreview}
                          saving={saving}
                          editingKeys={editingKeys}
                          onToggleEdit={toggleFieldEdit}
                          onChange={updateField}
                          t={t}
                        />
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
      </section>
    </>
  );
}
