"use client";

import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { setProfileFrozenState } from "./actions";

export type ProfileAdminRow = {
  seq_no: number | null;
  id: string;
  email: string | null;
  display_name: string | null;
  role: string | null;
  is_frozen: boolean;
  account_frozen_at: string | null;
  account_frozen_reason: string | null;
  created_at: string;
  updated_at: string;
};

function formatDateForUi(iso: string, uiLocale: string) {
  try {
    const bcp47 =
      uiLocale === "uk" ? "uk-UA" : uiLocale === "ru" ? "ru-RU" : "en-US";
    return new Date(iso).toLocaleString(bcp47, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function RoleBadge({
  role,
  labelAdmin,
  labelClient,
}: {
  role: string | null;
  labelAdmin: string;
  labelClient: string;
}) {
  const isAdmin = role === "admin";
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isAdmin
          ? "bg-union-accent/20 text-union-accent"
          : "bg-white/[0.06] text-union-muted"
      }`}
    >
      {isAdmin ? labelAdmin : labelClient}
    </span>
  );
}

function FreezeCell({
  labelActive,
  labelSince,
}: {
  labelActive: string;
  labelSince: string | null;
}) {
  if (!labelSince) {
    return (
      <span className="whitespace-nowrap text-union-muted">{labelActive}</span>
    );
  }
  return (
    <span className="whitespace-nowrap font-medium text-amber-200/90">
      {labelSince}
    </span>
  );
}

export function UsersAdminTable({
  currentUserId,
  initialProfiles,
}: {
  currentUserId: string;
  initialProfiles: ProfileAdminRow[];
}) {
  const t = useTranslations("users");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nicknameQuery, setNicknameQuery] = useState("");

  const filteredProfiles = useMemo(() => {
    const q = nicknameQuery.trim().toLowerCase();
    if (!q) {
      return initialProfiles;
    }
    return initialProfiles.filter((row) => {
      const nick = (row.display_name ?? "").trim().toLowerCase();
      return nick.includes(q);
    });
  }, [initialProfiles, nicknameQuery]);

  const singleMatch =
    filteredProfiles.length === 1 ? filteredProfiles[0] : null;
  const singleMatchIsSelf = singleMatch?.id === currentUserId;

  async function onToggle(targetId: string, nextFrozen: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await setProfileFrozenState(locale, targetId, nextFrozen);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-2xl border border-union-border bg-union-surface/50 px-4 py-4 backdrop-blur-xl sm:flex-row sm:items-end sm:justify-between sm:px-5">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="whitespace-nowrap text-xs font-medium text-union-muted">
            {t("searchByNickname")}
          </span>
          <input
            type="search"
            value={nicknameQuery}
            onChange={(e) => setNicknameQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            autoComplete="off"
            className="w-full rounded-xl border border-union-border bg-union-bg/80 px-3 py-2.5 text-sm text-union-text outline-none ring-union-ring placeholder:text-union-muted/70 focus:border-union-accent/40 focus:ring-2"
          />
        </label>
        {nicknameQuery.trim() ? (
          <button
            type="button"
            onClick={() => setNicknameQuery("")}
            className="shrink-0 rounded-full border border-union-border px-4 py-2 text-sm text-union-muted transition-colors hover:border-white/15 hover:text-union-text"
          >
            {t("searchClear")}
          </button>
        ) : null}
      </div>

      {singleMatch && !singleMatchIsSelf ? (
        <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-union-accent/30 bg-union-accent/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="min-w-0 truncate text-sm text-union-text sm:whitespace-nowrap">
            {t("searchSingleMatch", {
              name:
                singleMatch.display_name?.trim() ||
                singleMatch.email ||
                "—",
            })}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => void onToggle(singleMatch.id, !singleMatch.is_frozen)}
            className={`shrink-0 whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
              singleMatch.is_frozen
                ? "border border-union-border bg-union-surface/80 text-union-text hover:bg-union-surface"
                : "bg-union-accent text-union-accent-fg hover:brightness-95"
            }`}
          >
            {singleMatch.is_frozen ? t("actionUnfreeze") : t("actionFreeze")}
          </button>
        </div>
      ) : null}

      {singleMatch && singleMatchIsSelf ? (
        <p className="rounded-xl border border-union-border bg-white/[0.04] px-4 py-3 text-sm text-union-muted">
          {t("searchCannotFreezeSelf")}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-union-border bg-union-surface/60 backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-max min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-union-border bg-black/20 text-union-muted">
                <th className="w-16 whitespace-nowrap px-4 py-3 font-medium tabular-nums">
                  {t("colNo")}
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  {t("colEmail")}
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  {t("colDisplayName")}
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  {t("colRole")}
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  {t("colIsFrozen")}
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  {t("colFrozen")}
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  {t("colFrozenReason")}
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  {t("colCreated")}
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  {t("colActions")}
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium font-mono text-xs">
                  id (uuid)
                </th>
              </tr>
            </thead>
            <tbody>
              {initialProfiles.length === 0 ? (
                <tr>
                  <td
                    className="whitespace-normal px-4 py-8 text-center text-union-muted"
                    colSpan={10}
                  >
                    {t("empty")}
                  </td>
                </tr>
              ) : filteredProfiles.length === 0 ? (
                <tr>
                  <td
                    className="whitespace-normal px-4 py-8 text-center text-union-muted"
                    colSpan={10}
                  >
                    {t("searchNoResults")}
                  </td>
                </tr>
              ) : (
                filteredProfiles.map((row) => {
                  const isSelf = row.id === currentUserId;
                  const canToggle = !isSelf;
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-union-border/80 transition-colors hover:bg-white/[0.03]"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono tabular-nums text-union-muted">
                        {row.seq_no ?? "—"}
                      </td>
                      <td className="max-w-[220px] truncate whitespace-nowrap px-4 py-3 text-union-text">
                        {row.email ?? "—"}
                      </td>
                      <td className="max-w-[200px] truncate whitespace-nowrap px-4 py-3 text-union-text">
                        {row.display_name ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <RoleBadge
                          role={row.role}
                          labelAdmin={t("roleAdmin")}
                          labelClient={t("roleClient")}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-union-text">
                        {row.is_frozen ? "true" : "false"}
                      </td>
                      <td className="max-w-[260px] truncate px-4 py-3 text-union-muted">
                        <FreezeCell
                          labelActive={t("frozenActive")}
                          labelSince={
                            row.account_frozen_at
                              ? t("frozenSince", {
                                  date: formatDateForUi(
                                    row.account_frozen_at,
                                    locale
                                  ),
                                })
                              : null
                          }
                        />
                      </td>
                      <td className="max-w-[200px] truncate whitespace-nowrap px-4 py-3 text-xs text-union-muted">
                        {row.account_frozen_reason?.trim() || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-union-muted tabular-nums">
                        {formatDateForUi(row.created_at, locale)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {canToggle ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              void onToggle(row.id, !row.is_frozen)
                            }
                            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                              row.is_frozen
                                ? "border border-union-accent/40 bg-union-accent/15 text-union-accent hover:bg-union-accent/25"
                                : "border border-union-border bg-white/[0.06] text-union-muted hover:text-union-text"
                            }`}
                          >
                            {row.is_frozen ? t("actionUnfreeze") : t("actionFreeze")}
                          </button>
                        ) : (
                          <span className="whitespace-nowrap text-xs text-union-muted">
                            —
                          </span>
                        )}
                      </td>
                      <td className="max-w-[220px] truncate whitespace-nowrap px-4 py-3 font-mono text-xs text-union-muted">
                        {row.id}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
