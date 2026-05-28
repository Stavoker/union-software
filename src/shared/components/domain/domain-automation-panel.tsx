// @ts-nocheck
"use client";

import { Rocket, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { Link } from "@/i18n/navigation";

import {
  seoBtnGhost,
  seoBtnLimeOutline,
  seoBtnPrimary,
  seoFormDescendantControls,
  seoNoteLime,
} from "@/shared/components/seo/seo-ui";

const POPULAR_ZONES = ["com", "org", "net", "top", "casino", "info", "io", "co", "xyz"];

const DEFAULT_ZONE_EXTRA_JSON = '{\n  "sok": "ok"\n}';
const DEFAULT_RECORD_EXTRA_JSON = '{\n  "sok": "ok"\n}';
const RUN_STATE_STORAGE_KEY = "domainAutomation.activeRun";

async function readJsonSafe(response) {
  const text = await response.text();
  if (!text || !text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function buildFailureMessage(payload, fallback, t) {
  const base = String(fallback || payload?.details || payload?.error || t("errors.automationFailed"));
  const failed = Array.isArray(payload?.failures) ? payload.failures : [];
  if (!failed.length) {
    return base;
  }
  const failedDomains = failed
    .map((f) => {
      const label = String(f?.domainLabel || "").trim();
      const zone = String(f?.zone || "").trim().replace(/^\./, "");
      if (label && zone) return `${label}.${zone}`;
      if (label) return label;
      return "";
    })
    .filter(Boolean);
  if (!failedDomains.length) {
    return base;
  }
  const suffix = failedDomains.slice(0, 8).join(", ");
  const more = failedDomains.length > 8 ? ` +${failedDomains.length - 8}` : "";
  return `${base}. ${t("errors.failedDomains", { list: `${suffix}${more}` })}`;
}

export function DomainAutomationPanel() {
  const t = useTranslations("domainWorkbench");
  const locale = useLocale();
  const [domainRows, setDomainRows] = useState([{ id: 1, domainLabel: "", selectedZone: "com", customZone: "" }]);
  const [hosts, setHosts] = useState([]);
  const [selectedHostId, setSelectedHostId] = useState("");
  const [years, setYears] = useState("1");
  const [nameserversInput, setNameserversInput] = useState(
    "ns1.zomro.net, ns2.zomro.ru, ns3.zomro.com, ns4.zomro.su"
  );
  const [hostRecordName, setHostRecordName] = useState("@");
  const [zomroZoneFunc, setZomroZoneFunc] = useState("dnsdomain.edit");
  const [zomroRecordFunc, setZomroRecordFunc] = useState("dns.record.edit");
  const [zomroZoneExtraParams, setZomroZoneExtraParams] = useState(DEFAULT_ZONE_EXTRA_JSON);
  const [zomroRecordExtraParams, setZomroRecordExtraParams] = useState(DEFAULT_RECORD_EXTRA_JSON);
  const [zomroDnsmgrEnabled, setZomroDnsmgrEnabled] = useState(true);
  const [zomroVpsEnabled, setZomroVpsEnabled] = useState(false);
  const [vpsPricelist, setVpsPricelist] = useState("6740");
  const [vpsOrderPeriod, setVpsOrderPeriod] = useState("-50");
  const [vpsInstancesOs, setVpsInstancesOs] = useState("479c96f1-ccc6-47a2-952c-c9e3bbdc8d07");
  const [vpsDatacenter, setVpsDatacenter] = useState("13");
  const [vpsOrderCount, setVpsOrderCount] = useState("1");
  const [vpsUseSshKey, setVpsUseSshKey] = useState("off");
  const [vpsPassword, setVpsPassword] = useState("");
  const [vpsServername, setVpsServername] = useState("");
  const [vpsAddonKey, setVpsAddonKey] = useState("addon_6746");
  const [vpsAddonValue, setVpsAddonValue] = useState("260");
  const [vpsPromocode, setVpsPromocode] = useState("");
  const [vpsPaymethodId, setVpsPaymethodId] = useState("0");
  const [skipPurchase, setSkipPurchase] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState(null);
  const [errorToasts, setErrorToasts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeRunMeta, setActiveRunMeta] = useState(null);

  const parsedDomains = useMemo(() => {
    return domainRows
      .map((row) => {
        const domainLabel = String(row?.domainLabel || "").trim().toLowerCase();
        const zone =
          row?.selectedZone === "__custom__"
            ? String(row?.customZone || "").trim().toLowerCase()
            : String(row?.selectedZone || "").trim().toLowerCase();
        return { domainLabel, zone };
      })
      .filter((d) => d.domainLabel && d.zone);
  }, [domainRows]);

  function pushErrorToast(message) {
    const text = String(message || t("errors.unknown")).trim();
    if (!text) return;
    const toast = { id: `${Date.now()}-${Math.random()}`, message: text };
    setErrorToasts((prev) => [...prev, toast].slice(-4));
  }

  function removeErrorToast(id) {
    setErrorToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function appendLog(message, extra = null) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${String(message || "").trim()}`;
    const rendered = extra ? `${line}\n${JSON.stringify(extra, null, 2)}` : line;
    setLogs((prev) => [...prev, rendered].slice(-400));
  }

  function persistActiveRun(meta) {
    setActiveRunMeta(meta);
    try {
      if (meta) {
        window.localStorage.setItem(RUN_STATE_STORAGE_KEY, JSON.stringify(meta));
      } else {
        window.localStorage.removeItem(RUN_STATE_STORAGE_KEY);
      }
    } catch {}
  }

  function clearActiveRun() {
    persistActiveRun(null);
  }

  function payloadHasPendingSsl(payload) {
    if (!payload || typeof payload !== "object") return false;
    if (payload.mode === "batch") {
      const arr = Array.isArray(payload?.results) ? payload.results : [];
      return arr.some((entry) =>
        Array.isArray(entry?.result?.steps)
          ? entry.result.steps.some((step) => step?.id === "spaceship-ssl-letsencrypt-dns01" && step?.pending)
          : false
      );
    }
    const steps = Array.isArray(payload?.steps) ? payload.steps : [];
    return steps.some((step) => step?.id === "spaceship-ssl-letsencrypt-dns01" && step?.pending);
  }

  function updateDomainRow(id, patch) {
    setDomainRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addDomainRow() {
    setDomainRows((prev) => {
      if (prev.length >= 60) return prev;
      return [...prev, { id: Date.now() + Math.random(), domainLabel: "", selectedZone: "com", customZone: "" }];
    });
  }

  function removeDomainRow(id) {
    setDomainRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((row) => row.id !== id);
    });
  }

  async function loadHosts(preferredId = "") {
    const response = await fetch("/api/domain/hosts");
    const payload = await readJsonSafe(response);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.details || payload?.error || t("errors.hostLoadFailed"));
    }
    const list = Array.isArray(payload?.hosts) ? payload.hosts : [];
    setHosts(list);
    const pickId = String(preferredId || selectedHostId || "").trim();
    if (pickId && list.some((h) => String(h.id) === pickId)) {
      setSelectedHostId(pickId);
    } else if (list.length) {
      setSelectedHostId(String(list[0].id || ""));
    } else {
      setSelectedHostId("");
    }
    return list;
  }

  useEffect(() => {
    let mounted = true;
    loadHosts().catch(() => {
      if (mounted) setHosts([]);
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RUN_STATE_STORAGE_KEY);
      if (!raw) return;
      const meta = JSON.parse(raw);
      if (!meta?.startedAt) return;
      setActiveRunMeta(meta);
      appendLog(t("logs.restored"), meta);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once on mount
  }, []);

  useEffect(() => {
    if (!activeRunMeta?.startedAt) return;
    setStatus(
      t("status.unfinishedRun", {
        when: new Date(activeRunMeta.startedAt).toLocaleString(locale),
      })
    );
  }, [activeRunMeta, locale, t]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) {
      return;
    }
    if (!parsedDomains.length) {
      const msg = t("errors.noDomains");
      setStatus(msg);
      pushErrorToast(msg);
      appendLog(msg);
      return;
    }
    if (parsedDomains.length > 60) {
      const msg = t("errors.maxDomains");
      setStatus(msg);
      pushErrorToast(msg);
      appendLog(msg);
      return;
    }

    let parsedZoneExtra = {};
    let parsedRecordExtra = {};
    try {
      parsedZoneExtra = zomroZoneExtraParams.trim() ? JSON.parse(zomroZoneExtraParams) : {};
      parsedRecordExtra = zomroRecordExtraParams.trim() ? JSON.parse(zomroRecordExtraParams) : {};
    } catch {
      const msg = t("errors.invalidJson");
      setStatus(msg);
      pushErrorToast(msg);
      appendLog(msg);
      return;
    }

    setLoading(true);
    setStatus(t("status.starting", { count: parsedDomains.length }));
    setResult(null);
    setLogs([]);
    appendLog(t("logs.starting", { count: parsedDomains.length }));
    appendLog(t("logs.domainsPayload"), parsedDomains);

    const selectedHost = selectedHostId
      ? hosts.find((h) => String(h?.id || "") === String(selectedHostId))
      : null;
    const hostIpFromSelection = selectedHost?.hostIp ? String(selectedHost.hostIp).trim() : "";

    persistActiveRun({
      startedAt: new Date().toISOString(),
      domains: parsedDomains,
      hostId: selectedHostId || null,
    });

    try {
      const response = await fetch("/api/domain/automation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          domainLabel: parsedDomains[0]?.domainLabel || "",
          zone: parsedDomains[0]?.zone || "",
          domains: parsedDomains,
          hostId: selectedHostId || undefined,
          years: Number(years || 1),
          nameservers: nameserversInput,
          hostIp: hostIpFromSelection || undefined,
          hostRecordName,
          sslDnsPropagationTimeoutMs: 300000,
          sslDnsPropagationPollMs: 5000,
          sslAsyncRetryMs: 15000,
          zomroZoneFunc,
          zomroRecordFunc,
          zomroZoneExtraParams: parsedZoneExtra,
          zomroRecordExtraParams: parsedRecordExtra,
          zomroDnsmgrEnabled,
          zomroVpsEnabled,
          vpsPricelist,
          vpsOrderPeriod,
          vpsInstancesOs,
          vpsDatacenter,
          vpsOrderCount,
          vpsUseSshKey,
          vpsPassword,
          vpsServername,
          vpsAddonKey,
          vpsAddonValue,
          vpsPromocode,
          vpsPaymethodId,
          skipPurchase,
        }),
      });
      appendLog(t("logs.httpStatus", { status: response.status }));

      const payload = await readJsonSafe(response);
      if (!response.ok || !payload?.ok) {
        appendLog(t("logs.apiError"), payload);
        throw new Error(
          buildFailureMessage(payload, payload?.details || payload?.error || t("errors.automationFailed"), t)
        );
      }

      setResult(payload);
      appendLog(t("logs.apiSuccess"), payload);
      if (payload?.mode === "batch") {
        const pendingSslBatch = payloadHasPendingSsl(payload) ? t("status.batchSslPending") : "";
        setStatus(
          t("status.batchDone", {
            ok: payload.okCount || 0,
            total: payload.total || 0,
            fail: payload.failCount || 0,
            extra: pendingSslBatch,
          })
        );
      } else if (payloadHasPendingSsl(payload)) {
        setStatus(t("status.acceptedPendingSsl", { domain: payload.domain }));
      } else {
        setStatus(t("status.done", { domain: payload.domain }));
      }
      if (!payloadHasPendingSsl(payload)) {
        clearActiveRun();
      } else {
        appendLog(t("logs.sslBackground"));
      }
    } catch (error) {
      const msg = t("errors.withMessage", {
        message: error?.message || t("errors.unknown"),
      });
      setStatus(msg);
      pushErrorToast(msg);
      appendLog(msg, { stack: error?.stack || null });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-6 pb-10 pt-2">
      {errorToasts.length ? (
        <div
          className="fixed right-4 top-4 z-50 flex max-w-md flex-col gap-2 md:right-8"
          role="region"
          aria-label={t("errorToastsAria")}
        >
          {errorToasts.map((toast) => (
            <div
              key={toast.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-red-500/35 bg-red-950/90 px-4 py-3 text-sm text-red-100 shadow-lg backdrop-blur-md"
              role="alert"
            >
              <p className="min-w-0 flex-1 leading-snug">{toast.message}</p>
              <button
                type="button"
                className="shrink-0 rounded-md px-2 py-0.5 text-lg leading-none text-red-200 hover:bg-red-900/60"
                onClick={() => removeErrorToast(toast.id)}
                aria-label={t("closeToast")}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-union-text">{t("title")}</h1>
      </div>

      <form className={`space-y-5 ${seoFormDescendantControls}`} onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-union-muted">{t("form.domainsLabel")}</span>
          </label>
          <div className="flex flex-col gap-2">
              {domainRows.map((row, idx) => (
                <div
                  key={row.id}
                  className="grid gap-2 md:grid-cols-[minmax(0,1fr)_130px_minmax(0,1fr)_auto] md:items-center"
                >
                  <input
                    type="text"
                    value={row.domainLabel}
                    onChange={(event) => updateDomainRow(row.id, { domainLabel: event.target.value })}
                    placeholder={t("form.domainPlaceholder", { n: idx + 1 })}
                    disabled={loading}
                    required={idx === 0}
                  />
                  <select
                    value={row.selectedZone}
                    onChange={(event) => updateDomainRow(row.id, { selectedZone: event.target.value })}
                    disabled={loading}
                  >
                    {POPULAR_ZONES.map((zone) => (
                      <option key={zone} value={zone}>
                        .{zone}
                      </option>
                    ))}
                    <option value="__custom__">{t("form.customZone")}</option>
                  </select>
                  {row.selectedZone === "__custom__" ? (
                    <input
                      type="text"
                      value={row.customZone}
                      onChange={(event) => updateDomainRow(row.id, { customZone: event.target.value })}
                      placeholder={t("form.customZonePlaceholder")}
                      disabled={loading}
                    />
                  ) : null}
                  <button
                    type="button"
                    className={seoBtnLimeOutline}
                    onClick={() => removeDomainRow(row.id)}
                    disabled={loading || domainRows.length <= 1}
                  >
                    <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                    {t("form.delete")}
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={seoBtnLimeOutline}
                onClick={addDomainRow}
                disabled={loading || domainRows.length >= 60}
              >
                {t("form.addDomain")}
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="hostId">{t("form.host")}</label>
              <select
                id="hostId"
                value={selectedHostId}
                onChange={(event) => setSelectedHostId(event.target.value)}
                disabled={loading}
              >
                <option value="">{t("form.hostFallback")}</option>
                {hosts.map((host) => (
                  <option key={host.id} value={host.id}>
                    {(host.name || host.hostIp || host.id) + (host.hostIp ? ` (${host.hostIp})` : "")}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-union-muted">
                {t("form.hostSettingsHint")}{" "}
                <Link href="/dashboard/settings" className="text-[#d1fe17] underline-offset-2 hover:underline">
                  {t("form.hostSettingsLink")}
                </Link>
              </p>
            </div>
            <div>
              <label htmlFor="nameservers">{t("form.nameservers")}</label>
              <input
                id="nameservers"
                type="text"
                value={nameserversInput}
                onChange={(event) => setNameserversInput(event.target.value)}
                placeholder={t("form.nameserversPlaceholder")}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="hostRecordName">{t("form.dnsRecordName")}</label>
              <input
                id="hostRecordName"
                type="text"
                value={hostRecordName}
                onChange={(event) => setHostRecordName(event.target.value)}
                placeholder="@"
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="years">{t("form.years")}</label>
              <input
                id="years"
                type="text"
                value={years}
                onChange={(event) => setYears(event.target.value)}
                placeholder="1"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="skipPurchase">{t("form.runMode")}</label>
              <select
                id="skipPurchase"
                value={skipPurchase ? "skip" : "full"}
                onChange={(event) => setSkipPurchase(event.target.value === "skip")}
                disabled={loading}
              >
                <option value="full">{t("form.runModeFull")}</option>
                <option value="skip">{t("form.runModeSkip")}</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="zomroZoneFunc">{t("form.zomroZoneFunc")}</label>
              <input
                id="zomroZoneFunc"
                type="text"
                value={zomroZoneFunc}
                onChange={(event) => setZomroZoneFunc(event.target.value)}
                placeholder={t("form.zomroZoneFuncPlaceholder")}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="zomroDnsmgrEnabled">{t("form.zomroDnsmgr")}</label>
            <div className="flex flex-wrap items-start gap-3">
              <select
                id="zomroDnsmgrEnabled"
                className="!w-auto min-w-[10rem] max-w-xs shrink-0"
                value={zomroDnsmgrEnabled ? "on" : "off"}
                onChange={(event) => setZomroDnsmgrEnabled(event.target.value === "on")}
                disabled={loading}
              >
                <option value="off">{t("form.dnsmgrOff")}</option>
                <option value="on">{t("form.dnsmgrOn")}</option>
              </select>
              <p className={seoNoteLime}>
                {t.rich("form.dnsmgrNote", {
                  code: (chunks) => <code>{chunks}</code>,
                })}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="zomroRecordFunc">{t("form.zomroRecordFunc")}</label>
              <input
                id="zomroRecordFunc"
                type="text"
                value={zomroRecordFunc}
                onChange={(event) => setZomroRecordFunc(event.target.value)}
                placeholder={t("form.zomroRecordFuncPlaceholder")}
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="zomroVpsEnabled">{t("form.vpsEnabled")}</label>
              <select
                id="zomroVpsEnabled"
                value={zomroVpsEnabled ? "on" : "off"}
                onChange={(event) => setZomroVpsEnabled(event.target.value === "on")}
                disabled={loading}
              >
                <option value="off">{t("form.vpsOff")}</option>
                <option value="on">{t("form.vpsOn")}</option>
              </select>
            </div>
          </div>

          {zomroVpsEnabled ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="vpsPricelist">VPS pricelist</label>
                <input
                  id="vpsPricelist"
                  type="text"
                  value={vpsPricelist}
                  onChange={(event) => setVpsPricelist(event.target.value)}
                  disabled={loading}
                  required={zomroVpsEnabled}
                />
              </div>
              <div>
                <label htmlFor="vpsOrderPeriod">VPS order_period</label>
                <input
                  id="vpsOrderPeriod"
                  type="text"
                  value={vpsOrderPeriod}
                  onChange={(event) => setVpsOrderPeriod(event.target.value)}
                  disabled={loading}
                  required={zomroVpsEnabled}
                />
              </div>
              <div>
                <label htmlFor="vpsInstancesOs">VPS instances_os</label>
                <input
                  id="vpsInstancesOs"
                  type="text"
                  value={vpsInstancesOs}
                  onChange={(event) => setVpsInstancesOs(event.target.value)}
                  disabled={loading}
                  required={zomroVpsEnabled}
                />
              </div>
              <div>
                <label htmlFor="vpsDatacenter">VPS datacenter</label>
                <input
                  id="vpsDatacenter"
                  type="text"
                  value={vpsDatacenter}
                  onChange={(event) => setVpsDatacenter(event.target.value)}
                  disabled={loading}
                  required={zomroVpsEnabled}
                />
              </div>
              <div>
                <label htmlFor="vpsOrderCount">VPS order_count</label>
                <input
                  id="vpsOrderCount"
                  type="text"
                  value={vpsOrderCount}
                  onChange={(event) => setVpsOrderCount(event.target.value)}
                  disabled={loading}
                />
              </div>
              <div>
                <label htmlFor="vpsUseSshKey">VPS use_ssh_key</label>
                <select
                  id="vpsUseSshKey"
                  value={vpsUseSshKey}
                  onChange={(event) => setVpsUseSshKey(event.target.value)}
                  disabled={loading}
                >
                  <option value="off">off</option>
                  <option value="on">on</option>
                </select>
              </div>
              <div>
                <label htmlFor="vpsPassword">VPS password</label>
                <input
                  id="vpsPassword"
                  type="text"
                  value={vpsPassword}
                  onChange={(event) => setVpsPassword(event.target.value)}
                  placeholder={t("form.vpsPasswordPlaceholder")}
                  disabled={loading || vpsUseSshKey === "on"}
                />
              </div>
              <div>
                <label htmlFor="vpsServername">VPS servername</label>
                <input
                  id="vpsServername"
                  type="text"
                  value={vpsServername}
                  onChange={(event) => setVpsServername(event.target.value)}
                  placeholder="MyServer-1"
                  disabled={loading}
                />
              </div>
              <div>
                <label htmlFor="vpsAddonKey">VPS addon key</label>
                <input
                  id="vpsAddonKey"
                  type="text"
                  value={vpsAddonKey}
                  onChange={(event) => setVpsAddonKey(event.target.value)}
                  disabled={loading}
                />
              </div>
              <div>
                <label htmlFor="vpsAddonValue">VPS addon value</label>
                <input
                  id="vpsAddonValue"
                  type="text"
                  value={vpsAddonValue}
                  onChange={(event) => setVpsAddonValue(event.target.value)}
                  disabled={loading}
                />
              </div>
              <div>
                <label htmlFor="vpsPromocode">VPS promocode (optional)</label>
                <input
                  id="vpsPromocode"
                  type="text"
                  value={vpsPromocode}
                  onChange={(event) => setVpsPromocode(event.target.value)}
                  disabled={loading}
                />
              </div>
              <div>
                <label htmlFor="vpsPaymethodId">VPS paymethod_id</label>
                <input
                  id="vpsPaymethodId"
                  type="text"
                  value={vpsPaymethodId}
                  onChange={(event) => setVpsPaymethodId(event.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="zoneExtraParams">{t("form.zoneExtra")}</label>
              <textarea
                id="zoneExtraParams"
                value={zomroZoneExtraParams}
                onChange={(event) => setZomroZoneExtraParams(event.target.value)}
                rows={5}
                spellCheck={false}
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="recordExtraParams">{t("form.recordExtra")}</label>
              <textarea
                id="recordExtraParams"
                value={zomroRecordExtraParams}
                onChange={(event) => setZomroRecordExtraParams(event.target.value)}
                rows={5}
                spellCheck={false}
                disabled={loading}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button type="submit" className={`${seoBtnPrimary} gap-2`} disabled={loading}>
              {!loading ? <Rocket className="h-4 w-4 shrink-0" aria-hidden /> : null}
              {loading ? t("form.submitting") : t("form.submit")}
            </button>
          </div>
        </form>

        <p className="text-sm text-union-muted">{status}</p>
        {activeRunMeta ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95">
            {t("status.activeRun")}{" "}
            <button type="button" className={`${seoBtnGhost} ml-1 inline-flex`} onClick={clearActiveRun}>
              {t("status.clearRun")}
            </button>
            .
          </div>
        ) : null}

        {loading || logs.length > 0 || activeRunMeta ? (
          <section className="space-y-3 rounded-2xl border border-union-border bg-union-bg/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm font-semibold text-union-text">{t("form.logsTitle")}</strong>
              <button
                type="button"
                className={seoBtnGhost}
                onClick={() => setLogs([])}
                disabled={!logs.length || loading}
              >
                {t("form.logsClear")}
              </button>
            </div>
            {logs.length ? (
              <pre className="max-h-[min(45vh,360px)] overflow-auto rounded-xl border border-union-border bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-union-text/90">
                {logs.join("\n\n")}
              </pre>
            ) : loading ? (
              <p className="text-xs text-union-muted">{t("form.logsRunning")}</p>
            ) : null}
          </section>
        ) : null}

        {result ? (
          <pre className="overflow-auto rounded-xl border border-union-border bg-union-bg/50 p-4 font-mono text-[11px] leading-relaxed text-union-text">
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : (
          <p className="text-xs text-union-muted">{t("form.hint")}</p>
        )}
    </div>
  );
}
