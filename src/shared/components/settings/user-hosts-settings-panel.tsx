// @ts-nocheck
"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { seoBtnGhost, seoBtnLimeOutline, seoCard } from "@/shared/components/seo/seo-ui";
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

export function UserHostsSettingsPanel() {
  const t = useTranslations("integrationSettings.hosts");
  const [hosts, setHosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ message: "", lime: true });
  const [hostFormName, setHostFormName] = useState("");
  const [hostFormIp, setHostFormIp] = useState("");
  const [hostFormUser, setHostFormUser] = useState("root");
  const [hostFormPassword, setHostFormPassword] = useState("");
  const [hostFormPort, setHostFormPort] = useState("22");
  const [hostFormProjectsDir, setHostFormProjectsDir] = useState("/var/www");
  const [provisioningId, setProvisioningId] = useState("");

  function resetHostForm() {
    setHostFormName("");
    setHostFormIp("");
    setHostFormUser("");
    setHostFormPassword("");
    setHostFormPort("");
    setHostFormProjectsDir("");
  }

  async function loadHosts() {
    const response = await fetch("/api/settings/hosts");
    const payload = await readJsonSafe(response);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.details || payload?.error || t("loadFailed"));
    }
    const list = Array.isArray(payload?.hosts) ? payload.hosts : [];
    setHosts(list);
    return list;
  }

  useEffect(() => {
    let mounted = true;
    loadHosts()
      .catch((e) => {
        if (mounted) {
          setToast({ message: String(e?.message || t("loadFailed")), lime: true });
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  async function saveNewHost() {
    if (saving) return;
    setSaving(true);
    setToast({ message: "", lime: true });
    try {
      const response = await fetch("/api/settings/hosts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: hostFormName,
          hostIp: hostFormIp,
          sshUser: hostFormUser,
          sshPassword: hostFormPassword,
          sshPort: Number(hostFormPort || 22),
          projectsDir: hostFormProjectsDir,
        }),
      });
      const payload = await readJsonSafe(response);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.details || payload?.error || t("saveFailed"));
      }
      await loadHosts();
      resetHostForm();
      setToast({ message: t("saved"), lime: true });
    } catch (e) {
      setToast({ message: String(e?.message || t("saveFailed")), lime: true });
    } finally {
      setSaving(false);
    }
  }

  async function provisionHost(hostId) {
    const id = String(hostId || "").trim();
    if (!id || saving || provisioningId) return;
    setProvisioningId(id);
    setToast({ message: t("provisionRunning"), lime: true });
    try {
      const response = await fetch("/api/settings/hosts/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const payload = await readJsonSafe(response);
      if (!response.ok || !payload?.ok) {
        const tail = Array.isArray(payload?.logs) ? payload.logs.slice(-3).join(" ") : "";
        throw new Error(
          payload?.details || payload?.error || tail || t("provisionFailed")
        );
      }
      const sites = payload?.provision?.sites || [];
      const okCount = sites.filter((s) => s?.ok).length;
      setToast({
        message: t("provisionDone", { ok: okCount, total: sites.length }),
        lime: true,
      });
    } catch (e) {
      setToast({ message: String(e?.message || t("provisionFailed")), lime: true });
    } finally {
      setProvisioningId("");
    }
  }

  async function deleteHost(hostId) {
    const id = String(hostId || "").trim();
    if (!id || saving) return;
    setSaving(true);
    setToast({ message: "", lime: true });
    try {
      const response = await fetch("/api/settings/hosts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const payload = await readJsonSafe(response);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.details || payload?.error || t("deleteFailed"));
      }
      await loadHosts();
      setToast({ message: t("deleted"), lime: true });
    } catch (e) {
      setToast({ message: String(e?.message || t("deleteFailed")), lime: true });
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

      <section className={`${seoCard} space-y-5`}>
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-union-text">
            {t("title")}
            {!loading && hosts.length > 0 ? (
              <span className="ml-2 font-normal text-union-muted">({hosts.length})</span>
            ) : null}
          </h2>
          <p className="text-xs text-union-muted">{t("hint")}</p>
        </div>

        {loading ? (
          <p className="text-sm text-union-muted">{t("loading")}</p>
        ) : hosts.length ? (
          <ul className="divide-y divide-white/10 rounded-xl border border-white/10">
            {hosts.map((host) => (
              <li
                key={host.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-union-text">
                    {host.name || host.hostIp || host.id}
                  </p>
                  <p className="text-xs text-union-muted">
                    {host.hostIp}
                    {host.sshUser ? ` · ${host.sshUser}` : ""}
                    {host.sshPort ? ` · :${host.sshPort}` : ""}
                    {host.projectsDir ? ` · ${host.projectsDir}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={seoBtnLimeOutline}
                    onClick={() => provisionHost(host.id)}
                    disabled={saving || Boolean(provisioningId) || !host.hasPassword}
                  >
                    {provisioningId === host.id ? t("provisionRunning") : t("provisionPhp")}
                  </button>
                  <button
                    type="button"
                    className={seoBtnGhost}
                    onClick={() => deleteHost(host.id)}
                    disabled={saving || Boolean(provisioningId)}
                    aria-label={t("delete")}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    <span className="sr-only">{t("delete")}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-union-muted">{t("empty")}</p>
        )}

        <div className="space-y-3 border-t border-white/10 pt-4">
          <p className="text-xs font-medium text-union-text">{t("addTitle")}</p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="settingsHostName" className="text-xs text-union-muted">
                {t("name")}
              </label>
              <input
                id="settingsHostName"
                type="text"
                className="w-full rounded-xl border border-union-border bg-union-bg/80 px-3 py-2 text-sm text-union-text outline-none ring-union-ring focus:ring-2 disabled:opacity-50"
                value={hostFormName}
                onChange={(e) => setHostFormName(e.target.value)}
                placeholder={t("namePlaceholder")}
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="settingsHostIp" className="text-xs text-union-muted">
                {t("ip")}
              </label>
              <input
                id="settingsHostIp"
                type="text"
                className="w-full rounded-xl border border-union-border bg-union-bg/80 px-3 py-2 text-sm text-union-text outline-none ring-union-ring focus:ring-2 disabled:opacity-50"
                value={hostFormIp}
                onChange={(e) => setHostFormIp(e.target.value)}
                placeholder="203.0.113.10"
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="settingsHostUser" className="text-xs text-union-muted">
                {t("user")}
              </label>
              <input
                id="settingsHostUser"
                type="text"
                className="w-full rounded-xl border border-union-border bg-union-bg/80 px-3 py-2 text-sm text-union-text outline-none ring-union-ring focus:ring-2 disabled:opacity-50"
                value={hostFormUser}
                onChange={(e) => setHostFormUser(e.target.value)}
                placeholder="root"
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="settingsHostPassword" className="text-xs text-union-muted">
                {t("password")}
              </label>
              <input
                id="settingsHostPassword"
                type="password"
                className="w-full rounded-xl border border-union-border bg-union-bg/80 px-3 py-2 text-sm text-union-text outline-none ring-union-ring focus:ring-2 disabled:opacity-50"
                value={hostFormPassword}
                onChange={(e) => setHostFormPassword(e.target.value)}
                autoComplete="new-password"
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="settingsHostPort" className="text-xs text-union-muted">
                {t("port")}
              </label>
              <input
                id="settingsHostPort"
                type="text"
                className="w-full rounded-xl border border-union-border bg-union-bg/80 px-3 py-2 text-sm text-union-text outline-none ring-union-ring focus:ring-2 disabled:opacity-50"
                value={hostFormPort}
                onChange={(e) => setHostFormPort(e.target.value)}
                placeholder="22"
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="settingsHostProjectsDir" className="text-xs text-union-muted">
                {t("projectsDir")}
              </label>
              <input
                id="settingsHostProjectsDir"
                type="text"
                className="w-full rounded-xl border border-union-border bg-union-bg/80 px-3 py-2 text-sm text-union-text outline-none ring-union-ring focus:ring-2 disabled:opacity-50"
                value={hostFormProjectsDir}
                onChange={(e) => setHostFormProjectsDir(e.target.value)}
                placeholder={t("projectsDirPlaceholder")}
                disabled={saving}
                autoComplete="off"
              />
            </div>
          </div>
          <button
            type="button"
            className={seoBtnLimeOutline}
            onClick={() => saveNewHost()}
            disabled={saving || !hostFormIp.trim() || !hostFormPassword.trim()}
          >
            {saving ? t("saving") : hosts.length ? t("addAnother") : t("save")}
          </button>
        </div>
      </section>
    </>
  );
}
