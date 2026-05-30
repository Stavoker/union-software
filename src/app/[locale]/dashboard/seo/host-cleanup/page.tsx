// @ts-nocheck
"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { seoBtnDanger, seoBtnGhost, seoLinkBack } from "@/shared/components/seo/seo-ui";
import { UnionStatusToast } from "@/shared/components/ui/union-status-toast";

async function readJsonSafe(response) {
  const text = await response.text();
  if (!text || !text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Некорректный JSON в ответе (status ${response.status})`);
  }
}

function IconDelete() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export default function HostCleanupPage() {
  const t = useTranslations("seoWorkbench");
  const [domains, setDomains] = useState([]);
  const [projectNameMap, setProjectNameMap] = useState({});
  const [indexStatusMap, setIndexStatusMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [workingHost, setWorkingHost] = useState("");

  const loadDomains = useCallback(async () => {
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch("/api/seo/subdomains", { cache: "no-store" });
      const payload = await readJsonSafe(res);
      if (!res.ok) {
        throw new Error(payload?.details || payload?.error || "Не удалось загрузить домены");
      }
      const list = Array.isArray(payload.domains) ? payload.domains : [];
      setDomains([...list].sort((a, b) => a.localeCompare(b)));
      setProjectNameMap(payload.projectNameMap && typeof payload.projectNameMap === "object" ? payload.projectNameMap : {});
      setIndexStatusMap(payload.indexStatusMap && typeof payload.indexStatusMap === "object" ? payload.indexStatusMap : {});
    } catch (e) {
      setStatus(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDomains();
  }, [loadDomains]);

  async function removeFromHostOnly(host) {
    const h = String(host || "").trim().toLowerCase();
    if (!h || workingHost) {
      return;
    }
    const ok = window.confirm(
      `Снять файлы сайта с хоста для «${h}»?\n\nЗапись в Supabase останется (домен не переиспользуется для новых генераций).`
    );
    if (!ok) {
      return;
    }
    setWorkingHost(h);
    setStatus("");
    try {
      const res = await fetch("/api/seo/subdomains/remove-from-host", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: h }),
      });
      const payload = await readJsonSafe(res);
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.details || payload?.error || "Запрос не выполнен");
      }
      const warn = payload.hostWarning ? ` ${payload.hostWarning}` : "";
      setStatus(
        payload.hostRemoved
          ? `Каталог на хосте удалён: ${h}.${warn}`
          : `Хост: каталог не найден или не удалён: ${h}.${warn}`
      );
    } catch (e) {
      setStatus(`Ошибка: ${String(e?.message || e)}`);
    } finally {
      setWorkingHost("");
    }
  }

  const dotIn = "inline-block h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(34,197,94,0.45)]";
  const dotOut = "inline-block h-2 w-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.35)]";

  return (
    <>
      <UnionStatusToast
        message={status}
        variant="lime"
        onDismiss={() => setStatus("")}
        dismissLabel={t("statusDismiss")}
      />
    <div className="w-full space-y-6">
      <Link href="/dashboard/seo" className={seoLinkBack}>
        ← До панелі позицій
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-union-text">Зняття сайтів з хоста</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-union-muted">
          Видаляється лише каталог проєкту через SFTP. Запис у таблиці{" "}
          <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-union-text">seo_domains</code> і
          позиції в{" "}
          <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-union-text">
            seo_positions
          </code>{" "}
          не змінюються — домен лишається «зайнятим».
        </p>
        <button type="button" className={seoBtnGhost} onClick={loadDomains} disabled={loading || !!workingHost}>
          Оновити список
        </button>
      </header>

      <div className="overflow-hidden rounded-2xl border border-union-border bg-union-surface/50 backdrop-blur-md">
        <div className="max-h-[min(65vh,560px)] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 border-b border-union-border bg-union-bg/95 backdrop-blur-md">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-union-text">Домен</th>
                <th className="px-4 py-3 text-left font-semibold text-union-text">Проєкт (папка)</th>
                <th className="px-4 py-3 text-left font-semibold text-union-text">Індекс</th>
                <th className="w-28 px-4 py-3 text-right font-semibold text-union-text">Дія</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-union-muted">
                    Завантаження…
                  </td>
                </tr>
              ) : domains.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-union-muted">
                    Немає піддоменів у Supabase
                  </td>
                </tr>
              ) : (
                domains.map((host) => (
                  <tr key={host} className="border-b border-union-border/60 hover:bg-white/[0.03]">
                    <td className="max-w-[min(40vw,320px)] break-all px-4 py-3 font-mono text-xs text-union-text">
                      {host}
                    </td>
                    <td className="px-4 py-3 text-union-muted">{projectNameMap[host] || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={indexStatusMap[host] ? dotIn : dotOut}
                        title={indexStatusMap[host] ? "У індексі" : "Ні / черга"}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className={`${seoBtnDanger} min-h-9 min-w-9 justify-center`}
                        onClick={() => removeFromHostOnly(host)}
                        disabled={!!workingHost}
                        title="Видалити файли з хоста (БД не чіпаємо)"
                        aria-label={`Зняти з хоста ${host}`}
                      >
                        {workingHost === host ? "…" : <IconDelete />}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </>
  );
}
